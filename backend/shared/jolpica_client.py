"""
Thin, reusable HTTP client for the Jolpica F1 API (an Ergast-schema-
compatible, free, unauthenticated season/standings/results API — see
https://github.com/jolpica/jolpica-f1).

Same job as openf1_client.py: make a GET request safely, paced under the
published rate limit (4 req/s burst, 500 req/hour sustained), and retried
with backoff when the API hiccups. Endpoint-specific parsing belongs in the
calling module (race_weekend.py), not here.

Unlike OpenF1, Jolpica follows Ergast convention: an empty result set is a
200 with an empty `Races`/`DriverStandings`/etc. array, never a 404 — so
there's no "no results" special case to swallow here, only real transport
and server errors.
"""

import random
import time
import requests

from backend.shared.logger import logger

BASE_URL = "https://api.jolpi.ca/ergast/f1"

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
MIN_REQUEST_INTERVAL = 0.3

_last_request_time = 0.0


def _pace_request():
    global _last_request_time
    elapsed = time.monotonic() - _last_request_time
    if elapsed < MIN_REQUEST_INTERVAL:
        time.sleep(MIN_REQUEST_INTERVAL - elapsed)
    _last_request_time = time.monotonic()


def _compute_delay(response, attempt, base_delay):
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return float(retry_after)
        except ValueError:
            logger.warning(
                "Retry-After header present but unparseable: %r — falling back to exponential backoff",
                retry_after,
            )
    return base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)


def request_with_retry(path, params=None, max_retries=3, base_delay=1.0, timeout=10):
    """GET {BASE_URL}{path} with pacing + retry/backoff, returning the
    parsed `MRData` dict. `path` should start with '/', e.g.
    '/2026.json' or '/2025/circuits/monza/results.json'."""
    url = f"{BASE_URL}{path}"
    for attempt in range(1, max_retries + 1):
        _pace_request()
        try:
            resp = requests.get(url, params=params, timeout=timeout)
            resp.raise_for_status()
            return resp.json()["MRData"]

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code
            if status not in RETRYABLE_STATUS_CODES or attempt == max_retries:
                raise
            delay = _compute_delay(e.response, attempt, base_delay)
            logger.debug(
                "HTTP %s, retrying in %.1fs (attempt %d/%d)", status, delay, attempt, max_retries
            )
            time.sleep(delay)

        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            if attempt == max_retries:
                raise
            delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            logger.debug(
                "%s, retrying in %.1fs (attempt %d/%d)", type(e).__name__, delay, attempt, max_retries
            )
            time.sleep(delay)
