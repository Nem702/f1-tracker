import random
import time
import requests
from datetime import datetime, timezone

BASE_URL = "https://api.openf1.org/v1"
DRIVERS = {"Hamilton": 44, "Leclerc": 16}

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
MIN_REQUEST_INTERVAL = 0.4  # comfortably under 1/3s (3 req/sec) to avoid rate limiting

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
            pass  # ignore invalid Retry-After header
    return base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)


def request_with_retry(url, params=None, max_retries=5, base_delay=1.0, timeout=10):
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


def get_latest_completed_race_session(year=2026):
    resp = request_with_retry(f"{BASE_URL}/sessions", params={"year": year, "session_name": "Race"})
    races = resp.json()
    now = datetime.now(timezone.utc)
    completed = [r for r in races if datetime.fromisoformat(r["date_end"]) < now]
    if not completed:
        raise ValueError(f"No completed races found for {year}")
    latest = max(completed, key=lambda r: r["date_start"])
    return latest


def get_laps(session_key, driver_number):
    resp = request_with_retry(f"{BASE_URL}/laps", params={"session_key": session_key, "driver_number": driver_number})
    return resp.json()


def main():
    session = get_latest_completed_race_session()
    print(f"Latest completed race: {session['location']} ({session['date_start']}) — session_key={session['session_key']}")
    for name, number in DRIVERS.items():
        laps = get_laps(session["session_key"], number)
        print(f"\n{name} (#{number}) — {len(laps)} laps")
        for lap in laps[:5]:
            print(f"  Lap {lap['lap_number']}: {lap['lap_duration']}s")


if __name__ == "__main__":
    main()