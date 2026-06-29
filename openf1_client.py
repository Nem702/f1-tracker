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

BASE_URL = "https://api.openf1.org/v1"

# Retry these — they're transient (rate limit, server hiccup). 4xx codes
# like 400/404 are deliberately NOT here: that means the request itself
# was malformed, and retrying just burns rate-limit budget for nothing.
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

# Comfortably under OpenF1's free-tier 3 req/sec limit. Spacing calls
# proactively means we never even hit a 429 in the first place — waiting
# for the rejection means that request was already wasted.
MIN_REQUEST_INTERVAL = 0.4

_last_request_time = 0.0


def _pace_request():
    # Module-level state is fine here since this client is used
    # single-threaded — one script, one request at a time.
    global _last_request_time
    elapsed = time.monotonic() - _last_request_time
    if elapsed < MIN_REQUEST_INTERVAL:
        time.sleep(MIN_REQUEST_INTERVAL - elapsed)
    _last_request_time = time.monotonic()


def _compute_delay(response, attempt, base_delay):
    # Prefer the server's own Retry-After hint if it gives one; otherwise
    # exponential backoff with jitter so retries don't all land in sync.
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return float(retry_after)
        except ValueError:
            pass  # ignore invalid Retry-After header
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
            return resp

        except requests.exceptions.HTTPError as e:
            status = e.response.status_code
            if status not in RETRYABLE_STATUS_CODES or attempt == max_retries:
                raise  # non-retryable (e.g. 400/404) or out of attempts
            delay = _compute_delay(e.response, attempt, base_delay)
            print(f"HTTP {status}, retrying in {delay:.1f}s (attempt {attempt}/{max_retries})")
            time.sleep(delay)

        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            if attempt == max_retries:
                raise
            delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            print(f"{type(e).__name__}, retrying in {delay:.1f}s (attempt {attempt}/{max_retries})")
            time.sleep(delay)