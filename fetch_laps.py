import requests
from datetime import datetime, timezone

BASE_URL = "https://api.openf1.org/v1"
DRIVERS = {"Hamilton": 44, "Leclerc": 16}

def get_latest_completed_race_session(year=2026):
    resp = requests.get(f"{BASE_URL}/sessions", params={"year": year, "session_name": "Race"})
    resp.raise_for_status()
    races = resp.json()

    now = datetime.now(timezone.utc)
    completed = [r for r in races if datetime.fromisoformat(r["date_end"]) < now]
    if not completed:
        raise ValueError(f"No completed races found for {year}")

    latest = max(completed, key=lambda r: r["date_start"])
    return latest

def get_laps(session_key, driver_number):
    resp = requests.get(f"{BASE_URL}/laps", params={"session_key": session_key, "driver_number": driver_number})
    resp.raise_for_status()
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