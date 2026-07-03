"""
Domain logic for the F1 tracker: which session to pull, which drivers we
care about, and what to do with the data once we have it. Endpoint wrappers
live in openf1_endpoints.py; HTTP pacing/retry lives in openf1_client.py.
"""

from datetime import datetime, timezone

from logger import logger
from openf1_endpoints import (
    get_sessions,
    get_ferrari_teammates,
    get_laps,
    get_stints,
    get_pit,
    get_weather,
    get_positions,
    get_race_control,
)
from db import (
    get_connection,
    upsert_race,
    upsert_driver,
    upsert_laps,
    upsert_stints,
    upsert_pit,
    upsert_weather,
    upsert_positions,
    race_control_already_fetched,
    insert_race_control,
)


def get_completed_race_sessions(year=2026):
    """All completed race sessions for a year, oldest first."""
    now = datetime.now(timezone.utc)
    races = get_sessions(year=year, session_name="Race")

    completed = []
    for r in races:
        try:
            if datetime.fromisoformat(r["date_end"]) < now:
                completed.append(r)
        except (KeyError, TypeError, ValueError):
            logger.warning("Skipping race with invalid date_end: %s", r)

    completed.sort(key=lambda r: r["date_start"])
    return completed


def get_latest_completed_race_session(year=2026):
    completed = get_completed_race_sessions(year)
    if not completed:
        raise ValueError(f"No completed races found for {year}")
    return completed[-1]


def process_session(conn, session):
    """Fetch and persist everything we track for one race session."""
    upsert_race(conn, session)

    # Driver numbers are resolved per-session from /drivers, not hardcoded —
    # numbers can change between seasons, and a session that predates the
    # teammate pairing just yields fewer entries here.
    teammates = get_ferrari_teammates(session["session_key"])

    for acronym, record in teammates.items():
        number = record["driver_number"]
        name = record.get("full_name") or acronym

        upsert_driver(conn, number, name)

        laps = get_laps(session["session_key"], number)
        upsert_laps(conn, session["session_key"], number, laps)
        logger.info("%s (#%d) — %d laps upserted", name, number, len(laps))

        stints = get_stints(session["session_key"], number)
        upsert_stints(conn, session["session_key"], number, stints)
        logger.info("%s (#%d) — %d stints upserted", name, number, len(stints))

        pit_stops = get_pit(session["session_key"], number)
        upsert_pit(conn, session["session_key"], number, pit_stops)
        logger.info("%s (#%d) — %d pit stops upserted", name, number, len(pit_stops))

        positions = get_positions(session["session_key"], number)
        upsert_positions(conn, session["session_key"], number, positions)
        logger.info("%s (#%d) — %d positions upserted", name, number, len(positions))

    # Session-wide endpoints — fetched once, not per driver
    weather = get_weather(session["session_key"])
    upsert_weather(conn, session["session_key"], weather)
    logger.info("%d weather readings upserted", len(weather))

    # Insert-only table — skip entirely if this session was already pulled,
    # otherwise every re-run (e.g. the Thursday redundancy run) duplicates rows.
    if race_control_already_fetched(conn, session["session_key"]):
        logger.info(
            "race control messages already fetched for session_key=%s — skipping",
            session["session_key"],
        )
    else:
        race_control = get_race_control(session["session_key"])
        insert_race_control(conn, session["session_key"], race_control)
        logger.info("%d race control messages inserted", len(race_control))


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
        process_session(conn, session)
        logger.info("F1 tracker run complete")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
