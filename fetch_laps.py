"""
Domain logic for the F1 tracker: which drivers/session to pull, and what
to do with the data once we have it. HTTP pacing/retry lives in
openf1_client.py — this file just calls into it.
"""

from datetime import datetime, timezone

from logger import logger
from openf1_client import BASE_URL, request_with_retry
from db import get_connection, upsert_race, upsert_driver, upsert_laps

DRIVERS = {"Hamilton": 44, "Leclerc": 16}


def get_latest_completed_race_session(year=2026):
    now = datetime.now(timezone.utc)
    params = {
        "year": year,
        "session_name": "Race",
        "date_end<": now.isoformat(),
    }
    resp = request_with_retry(f"{BASE_URL}/sessions", params=params)
    races = resp

    completed = []
    for r in races:
        try:
            if datetime.fromisoformat(r["date_end"]) < now:
                completed.append(r)
        except (TypeError, ValueError):
            logger.warning("Skipping race with invalid date_end: %s", r)

    if not completed:
        raise ValueError(f"No completed races found for {year}")

    latest = max(completed, key=lambda r: r["date_start"])
    return latest


def get_laps(session_key, driver_number):
    resp = request_with_retry(
        f"{BASE_URL}/laps",
        params={"session_key": session_key, "driver_number": driver_number},
    )
    return resp


def main():
    logger.info("F1 tracker run started")

    session = get_latest_completed_race_session()
    logger.info(
        "Latest completed race: %s (%s) — session_key=%s",
        session["location"],
        session["date_start"],
        session["session_key"],
    )

    conn = get_connection()
    try:
        upsert_race(conn, session)

        for name, number in DRIVERS.items():
            upsert_driver(conn, number, name)
            laps = get_laps(session["session_key"], number)
            upsert_laps(conn, session["session_key"], number, laps)
            logger.info("%s (#%d) — %d laps upserted", name, number, len(laps))
    finally:
        conn.close()
        logger.info("F1 tracker run complete")


if __name__ == "__main__":
    main()