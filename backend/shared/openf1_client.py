"""
Thin, reusable HTTP client for the OpenF1 API.

This module doesn't know what a "lap" or "driver" is — its only job is
making a GET request safely: paced to stay under the rate limit, and
retried with backoff when the API hiccups. Endpoint-specific functions
(get_laps, get_pit_stops, etc.) belong in the calling module, not here.
"""

import random
import time
import requests

from backend.shared.logger import logger

BASE_URL = "https://api.openf1.org/v1"

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
MIN_REQUEST_INTERVAL = 0.4

_last_request_time = 0.0


def _pace_request():
    global _last_request_time
    elapsed = time.monotonic() - _last_request_time
    if elapsed < MIN_REQUEST_INTERVAL:
        time.sleep(MIN_REQUEST_INTERVAL - elapsed)
    _last_request_time = time.monotonic()


def _is_no_results(response):
    """OpenF1 signals an empty result set as 404 {"detail": "No results found."}
    on some queries, rather than 200 with an empty list. Entire sessions can be
    missing (e.g. the 2026 Bahrain GP) — that's data absence, not a bad request."""
    try:
        body = response.json()
    except ValueError:
        return False
    return isinstance(body, dict) and body.get("detail") == "No results found."


def _compute_delay(response, attempt, base_delay):
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return float(retry_after)
        except ValueError:
            logger.warning("Retry-After header present but unparseable: %r — falling back to exponential backoff", retry_after)
    return base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)


def request_with_retry(url, params=None, max_retries=5, base_delay=1.0, timeout=10):
    """GET with pacing + retry/backoff baked in. Every endpoint call in
    this project should go through this instead of requests.get directly,
    so rate-limit handling stays in exactly one place."""
    for attempt in range(1, max_retries + 1):
        _pace_request()
        try:
            resp = requests.get(url, params=params, timeout=timeout)
            resp.raise_for_status()
            return resp.json()

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code
            if status == 404 and _is_no_results(e.response):
                logger.warning("no results for %s params=%s — treating as empty", url, params)
                return []
            if status not in RETRYABLE_STATUS_CODES or attempt == max_retries:
                raise
            delay = _compute_delay(e.response, attempt, base_delay)
            logger.debug("HTTP %s, retrying in %.1fs (attempt %d/%d)", status, delay, attempt, max_retries)
            time.sleep(delay)

        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            if attempt == max_retries:
                raise
            delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            logger.debug("%s, retrying in %.1fs (attempt %d/%d)", type(e).__name__, delay, attempt, max_retries)
            time.sleep(delay)