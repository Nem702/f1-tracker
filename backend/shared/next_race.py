"""
next_race.py

Finds the soonest upcoming F1 session from OpenF1. Runnable as a CLI
(`py -m backend.shared.next_race` from the repo root, prints a countdown
to stdout) and importable — `get_next_session()` has no side effects at
import time or on call, so the API's `/api/next-race` endpoint calls it
directly.
"""
from datetime import datetime, timezone
from backend.shared.openf1_client import request_with_retry
from backend.shared.logger import logger

BASE_URL = "https://api.openf1.org/v1"

# Order sessions logically within a race weekend
SESSION_ORDER = [
    "Practice 1", "Practice 2", "Practice 3",
    "Sprint Qualifying", "Sprint",
    "Qualifying", "Race"
]


def get_next_session():
    now = datetime.now(timezone.utc)
    now_str = now.strftime("%Y-%m-%dT%H:%M:%S")

    logger.debug("Fetching upcoming sessions from OpenF1")
    sessions = request_with_retry(
        f"{BASE_URL}/sessions?date_start>{now_str}"
    )

    if not sessions:
        logger.warning("No upcoming sessions found")
        return None

    # Parse and sort by date_start ascending, take the soonest
    parsed = []
    for s in sessions:
        try:
            dt = datetime.fromisoformat(s["date_start"])
            # Make timezone-aware if it isn't (OpenF1 usually includes +00:00)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            parsed.append((dt, s))
        except (TypeError, ValueError):
            continue

    if not parsed:
        return None

    parsed.sort(key=lambda x: x[0])
    next_dt, next_session = parsed[0]
    return next_dt, next_session


def format_countdown(delta_seconds):
    total = int(delta_seconds)
    days = total // 86400
    hours = (total % 86400) // 3600
    minutes = (total % 3600) // 60

    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    parts.append(f"{minutes}m")
    return " ".join(parts)


def main():
    result = get_next_session()
    if not result:
        print("No upcoming sessions found.")
        return

    next_dt, session = result
    now = datetime.now(timezone.utc)
    delta = (next_dt - now).total_seconds()

    gp_name = session.get("circuit_short_name") or session.get("location") or "Unknown GP"
    session_name = session.get("session_name", "Unknown Session")
    location = session.get("country_name", "")
    countdown = format_countdown(delta)

    print(f"\n  Next F1 Session")
    print(f"  {'─' * 30}")
    print(f"  {gp_name} — {location}")
    print(f"  {session_name}")
    print(f"  Starts: {next_dt.strftime('%a %d %b %Y, %H:%M UTC')}")
    print(f"  In:     {countdown}\n")

    logger.info(
        "Next session: %s %s in %s",
        gp_name, session_name, countdown
    )


if __name__ == "__main__":
    main()