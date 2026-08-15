"""
Backfill: fetch and persist every completed race of a season, not just the
latest. Safe to re-run — upserts are idempotent, and race_control is skipped
for sessions already pulled. Subject to the free-tier live-session lockout
like everything else; run it while no session is live.

Run from the repo root:  python -m backend.pipeline.backfill [--limit N]
"""

import argparse

from backend.shared.logger import logger
from backend.pipeline.fetch_laps import get_completed_race_sessions, process_session
from backend.pipeline.fetch_audit import format_counts_table
from backend.shared.db import get_connection


def backfill_year(year=2026, limit=None):
    completed = get_completed_race_sessions(year)
    if limit is not None:
        completed = completed[:limit]
    logger.info("Backfilling %d completed races for %d", len(completed), year)

    all_counts = []

    conn = get_connection()
    try:
        for session in completed:
            logger.info(
                "Backfilling %s (%s) — session_key=%s",
                session["location"],
                session["date_start"],
                session["session_key"],
            )
            # FetchVerificationError propagates and aborts the run — a
            # session that failed verification should not be silently
            # skipped in favor of the next one.
            counts = process_session(conn, session)
            all_counts.append((session, counts))
            logger.info(
                "\n%s",
                format_counts_table(counts, session["session_key"]),
            )
        logger.info("Backfill complete")
    finally:
        conn.close()

    logger.info("Backfill summary — %d session(s):", len(all_counts))
    for session, counts in all_counts:
        logger.info(
            "\n%s",
            format_counts_table(counts, session["session_key"]),
        )

    return all_counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    backfill_year(limit=args.limit)
