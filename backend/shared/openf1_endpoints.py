"""
Endpoint layer for the OpenF1 API: one thin wrapper per endpoint.

Each function here knows one endpoint's URL and query params, and nothing
else — no domain decisions (which session matters, which drivers we track)
and no persistence. HTTP pacing/retry lives in openf1_client.py; deciding
what to fetch and what to do with it lives in fetch_laps.py.
"""

from datetime import datetime, timezone

from backend.shared.logger import logger
from backend.shared.openf1_client import BASE_URL, request_with_retry


def get_sessions(year: int | None = None, session_name: str | None = None,
                 country_name: str | None = None) -> list[dict]:
    """Fetch sessions, filtered by whichever params are not None."""
    params = {}
    if year is not None:
        params["year"] = year
    if session_name is not None:
        params["session_name"] = session_name
    if country_name is not None:
        params["country_name"] = country_name
    logger.debug("fetching /sessions params=%s", params)
    data = request_with_retry(f"{BASE_URL}/sessions", params=params)
    return data or []


def get_drivers(session_key: int) -> list[dict]:
    """Fetch the driver roster for a session."""
    logger.debug("fetching /drivers session_key=%s", session_key)
    data = request_with_retry(f"{BASE_URL}/drivers", params={"session_key": session_key})
    return data or []


def get_ferrari_teammates(session_key: int) -> dict[str, dict]:
    """Resolve Hamilton and Leclerc's driver records for a session, keyed "HAM"/"LEC"."""
    targets = {"HAM": "hamilton", "LEC": "leclerc"}
    drivers = get_drivers(session_key)

    teammates = {}
    for acronym, last_name in targets.items():
        for d in drivers:
            full_name = (d.get("full_name") or "").lower()
            record_last = (d.get("last_name") or "").lower()
            if last_name == record_last or last_name in full_name:
                teammates[acronym] = d
                break
        else:
            logger.warning(
                "%s not found among %d drivers for session_key=%s — omitting",
                acronym, len(drivers), session_key,
            )
    return teammates


def get_laps(session_key: int, driver_number: int | None = None) -> list[dict]:
    """Fetch lap timing data for a session, optionally for one driver."""
    params = {"session_key": session_key}
    if driver_number is not None:
        params["driver_number"] = driver_number
    logger.debug("fetching /laps params=%s", params)
    data = request_with_retry(f"{BASE_URL}/laps", params=params)
    return data or []


def get_stints(session_key: int, driver_number: int | None = None) -> list[dict]:
    """Fetch tire stints for a session, optionally for one driver."""
    params = {"session_key": session_key}
    if driver_number is not None:
        params["driver_number"] = driver_number
    logger.debug("fetching /stints params=%s", params)
    data = request_with_retry(f"{BASE_URL}/stints", params=params)
    return data or []


def get_pit(session_key: int, driver_number: int | None = None) -> list[dict]:
    """Fetch pit stops for a session, optionally for one driver."""
    params = {"session_key": session_key}
    if driver_number is not None:
        params["driver_number"] = driver_number
    logger.debug("fetching /pit params=%s", params)
    data = request_with_retry(f"{BASE_URL}/pit", params=params)
    return data or []


def get_weather(session_key: int) -> list[dict]:
    """Fetch weather readings for a session. Session-wide — not filtered by driver."""
    logger.debug("fetching /weather session_key=%s", session_key)
    data = request_with_retry(f"{BASE_URL}/weather", params={"session_key": session_key})
    return data or []


def get_positions(session_key: int, driver_number: int | None = None) -> list[dict]:
    """Fetch position changes for a session, optionally for one driver.

    Note: OpenF1 endpoint is /position (singular), despite our table being 'positions'."""
    params = {"session_key": session_key}
    if driver_number is not None:
        params["driver_number"] = driver_number
    logger.debug("fetching /position params=%s", params)
    data = request_with_retry(f"{BASE_URL}/position", params=params)
    return data or []


def get_race_control(session_key: int) -> list[dict]:
    """Fetch race control messages for a session. Session-wide — not filtered by driver."""
    logger.debug("fetching /race_control session_key=%s", session_key)
    data = request_with_retry(f"{BASE_URL}/race_control", params={"session_key": session_key})
    return data or []


def get_intervals(session_key: int, driver_number: int | None = None) -> list[dict]:
    """Fetch gaps to leader/car ahead, optionally for one driver.

    Race sessions only — practice/quali return no data. gap_to_leader can be
    null or a string like "+1 LAP" for lapped cars, so don't assume float.
    Fetch-only for now: there is deliberately no intervals table in schema.sql yet."""
    params = {"session_key": session_key}
    if driver_number is not None:
        params["driver_number"] = driver_number
    logger.debug("fetching /intervals params=%s", params)
    data = request_with_retry(f"{BASE_URL}/intervals", params=params)
    return data or []


if __name__ == "__main__":
    # Smoke test, not a test suite: latest completed race, resolve the
    # teammates, print each driver's lap count.
    now = datetime.now(timezone.utc)

    races = get_sessions(year=now.year, session_name="Race")
    completed = []
    for r in races:
        try:
            if datetime.fromisoformat(r["date_end"]) < now:
                completed.append(r)
        except (KeyError, TypeError, ValueError):
            logger.warning("Skipping race with invalid date_end: %s", r)

    if not completed:
        raise SystemExit(f"No completed races found for {now.year}")

    latest = max(completed, key=lambda r: r["date_start"])
    print(f"Latest completed race: {latest['location']} ({latest['date_start']}) — session_key={latest['session_key']}")

    teammates = get_ferrari_teammates(latest["session_key"])
    for acronym, record in teammates.items():
        laps = get_laps(latest["session_key"], record["driver_number"])
        print(f"{record['full_name']} (#{record['driver_number']}) — {len(laps)} laps")
