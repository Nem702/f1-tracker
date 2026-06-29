"""
Domain logic for the F1 tracker: which drivers/session to pull, and what
to do with the data once we have it. HTTP pacing/retry lives in
openf1_client.py — this file just calls into it.
"""

from datetime import datetime, timezone

from openf1_client import BASE_URL, request_with_retry

DRIVERS = {"Hamilton": 44, "Leclerc": 16}


def get_latest_completed_race_session(year=2026):
    now = datetime.now(timezone.utc)
    params = {
        "year": year,
        "session_name": "Race",
        "date_end<": now.isoformat(),
    }
    resp = request_with_retry(f"{BASE_URL}/sessions", params=params)
    races = resp.json()

    completed = []
    for r in races:
        try:
            if datetime.fromisoformat(r["date_end"]) < now:
                completed.append(r)
        except (TypeError, ValueError):
            # date_end is None for a session that hasn't finished (or is
            # malformed) — skip it instead of crashing the whole pull.
            print(f"Skipping race with invalid date_end: {r}")

    if not completed:
        raise ValueError(f"No completed races found for {year}")

    latest = max(completed, key=lambda r: r["date_start"])
    return latest


def get_laps(session_key, driver_number):
    resp = request_with_retry(
        f"{BASE_URL}/laps",
        params={"session_key": session_key, "driver_number": driver_number},
    )
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