"""
Backfill: fetch and persist every completed race of a season, not just the
latest. Safe to re-run — upserts are idempotent, and race_control is skipped
for sessions already pulled. Subject to the free-tier live-session lockout
like everything else; run it while no session is live.
"""

from backend.shared.logger import logger
from backend.pipeline.fetch_laps import get_completed_race_sessions, process_session
from backend.shared.db import get_connection


def backfill_year(year=2026):
    completed = get_completed_race_sessions(year)
    logger.info("Backfilling %d completed races for %d", len(completed), year)

    conn = get_connection()
    try:
        for session in completed:
            logger.info(
                "Backfilling %s (%s) — session_key=%s",
                session["location"],
                session["date_start"],
                session["session_key"],
            )
            process_session(conn, session)
        logger.info("Backfill complete")
    finally:
        conn.close()


if __name__ == "__main__":
    backfill_year()
