"""
Domain logic for the F1 tracker: which session to pull, which drivers we
care about, and what to do with the data once we have it. Endpoint wrappers
live in backend/shared/openf1_endpoints.py; HTTP pacing/retry lives in
backend/shared/openf1_client.py; the table upserts live in store.py next
to this file.

Run from the repo root:  py -m backend.pipeline.fetch_laps
"""

from datetime import datetime, timezone

from backend.shared.logger import logger
from backend.shared.openf1_endpoints import (
    get_sessions,
    get_tracked_drivers,
    get_laps,
    get_stints,
    get_pit,
    get_weather,
    get_positions,
    get_race_control,
)
from backend.shared.db import get_connection
from backend.pipeline.store import (
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
from backend.pipeline.fetch_audit import assert_fetch_counts


def get_completed_race_sessions(year=2026):
    """All completed race sessions for a year, oldest first."""
    now = datetime.now(timezone.utc)
    races = get_sessions(year=year, session_name="Race")

    completed = []
    for r in races:
        if r.get("is_cancelled"):
            logger.info(
                "Excluding cancelled session: session_key=%s location=%s",
                r.get("session_key"), r.get("location"),
            )
            continue
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


def _group_by_driver(rows, endpoint):
    """Bucket a session-wide payload by driver_number.

    Rows without one can't be attributed to anybody, so they're counted and
    dropped rather than landing in some arbitrary driver's bucket."""
    buckets = {}
    unattributed = 0

    for row in rows:
        number = row.get("driver_number")
        if number is None:
            unattributed += 1
            continue
        buckets.setdefault(number, []).append(row)

    if unattributed:
        logger.warning("%d %s rows had no driver_number — skipped", unattributed, endpoint)

    return buckets


def process_session(conn, session):
    """Fetch and persist everything we track for one race session.

    Fetch phase runs to completion, and is asserted, before any write —
    see fetch_audit.py. A total fetch failure (e.g. the session is missing
    from OpenF1 entirely) must not reach the write phase: idempotent upserts
    against an empty payload are no-ops, so a DB diff after the fact can't
    tell a real zero-lap session from a fetch that silently returned nothing.
    """
    session_key = session["session_key"]

    # Driver numbers are resolved per-session from /drivers, not hardcoded —
    # numbers can change between seasons. If a team ever fields more than two
    # drivers across a season (mid-season swap), all of them are tracked —
    # the frontend decides how to present them.
    tracked = get_tracked_drivers(session_key)

    # One request per endpoint for the whole session, grouped by driver below.
    # Fetching inside the loop instead cost four requests per driver for the
    # exact same rows.
    laps_raw = get_laps(session_key)
    stints_raw = get_stints(session_key)
    pit_raw = get_pit(session_key)
    positions_raw = get_positions(session_key)
    weather = get_weather(session_key)

    # DB read, not a fetch — decides whether /race_control gets called at all.
    # Insert-only table: skip entirely if this session was already pulled,
    # otherwise every re-run (e.g. the Thursday redundancy run) duplicates rows.
    race_control_skipped = race_control_already_fetched(conn, session_key)
    if race_control_skipped:
        race_control = []
        race_control_count = "skipped"
    else:
        race_control = get_race_control(session_key)
        race_control_count = len(race_control)

    counts = {
        "drivers": len(tracked),
        "laps": len(laps_raw),
        "stints": len(stints_raw),
        "pit": len(pit_raw),
        "position": len(positions_raw),
        "weather": len(weather),
        "race_control": race_control_count,
    }

    assert_fetch_counts(counts, session_key)

    if len(tracked) != 22:
        logger.warning(
            "tracked driver count is %d, expected 22 — team_names: %s",
            len(tracked), sorted({d.get("team_name") for d in tracked}),
        )

    # --- write phase: unchanged logic and logging, in the existing order ---
    upsert_race(conn, session)

    laps_by_driver = _group_by_driver(laps_raw, "lap")
    stints_by_driver = _group_by_driver(stints_raw, "stint")
    pit_by_driver = _group_by_driver(pit_raw, "pit")
    positions_by_driver = _group_by_driver(positions_raw, "position")

    # Iterate the tracked list, not the bucket keys: a tracked driver who set no
    # laps still gets their upsert and log line, and the rest of the grid — now
    # present in every payload — stays out of the database.
    for record in tracked:
        number = record["driver_number"]
        name = record.get("full_name") or record.get("name_acronym") or str(number)

        upsert_driver(conn, number, name, record.get("team_name"), record.get("name_acronym"))

        laps = laps_by_driver.get(number, [])
        upsert_laps(conn, session_key, number, laps)
        logger.info("%s (#%d) — %d laps upserted", name, number, len(laps))

        stints = stints_by_driver.get(number, [])
        upsert_stints(conn, session_key, number, stints)
        logger.info("%s (#%d) — %d stints upserted", name, number, len(stints))

        pit_stops = pit_by_driver.get(number, [])
        upsert_pit(conn, session_key, number, pit_stops)
        logger.info("%s (#%d) — %d pit stops upserted", name, number, len(pit_stops))

        positions = positions_by_driver.get(number, [])
        upsert_positions(conn, session_key, number, positions)
        logger.info("%s (#%d) — %d positions upserted", name, number, len(positions))

    # Session-wide endpoints — fetched once, not per driver
    upsert_weather(conn, session_key, weather)
    logger.info("%d weather readings upserted", len(weather))

    if race_control_skipped:
        logger.info(
            "race control messages already fetched for session_key=%s — skipping",
            session_key,
        )
    else:
        insert_race_control(conn, session_key, race_control)
        logger.info("%d race control messages inserted", len(race_control))

    return counts


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
