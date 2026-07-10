"""
jolpica_lookup.py

Shared Jolpica F1 primitives for anything that needs a season's schedule
or needs to resolve a real-world race date to its Jolpica season/round:
Ergast's split date+time field parsing, season-schedule fetching, and
find_jolpica_round() — the join between this project's own Postgres
`races` table (OpenF1-sourced, keyed by session_key, no round number
stored anywhere) and Jolpica's season+round identifiers.
"""

from datetime import datetime, timezone

from backend.shared.jolpica_client import request_with_retry


def parse_datetime(date_str, time_str):
    if not date_str:
        return None
    time_str = time_str or "00:00:00Z"
    try:
        return datetime.fromisoformat(f"{date_str}T{time_str}".replace("Z", "+00:00"))
    except ValueError:
        return None


def race_datetime(race):
    return parse_datetime(race.get("date"), race.get("time"))


def get_season_schedule(year):
    """Returns (races, total) for a season. `total` comes straight from the
    API rather than len(races) — callers never paginate (a season is at
    most ~24 rounds, well under our limit=100), but a round-progress badge
    should reflect what the API itself considers the full calendar."""
    data = request_with_retry(f"/{year}.json", params={"limit": 100})
    races = data.get("RaceTable", {}).get("Races", [])
    total = int(data.get("total", len(races)))
    return races, total


def find_jolpica_round(year, date_start):
    """Matches a Postgres `races` row to its Jolpica round: same season
    year plus the same UTC calendar date. Both `races.date_start` (OpenF1,
    "Race" session_name only — one row per Grand Prix weekend) and
    Jolpica's schedule date+time are literal UTC race-start timestamps, so
    a plain date match is exact — no fuzzy circuit-name matching needed,
    and no assumption that a round number carries over year to year
    (calendars get reshuffled). Returns None if nothing in that season's
    schedule falls on that date (an off-calendar date, or a season Jolpica
    doesn't have yet)."""
    races, _total = get_season_schedule(year)
    target_date = date_start.astimezone(timezone.utc).date()
    for race in races:
        dt = race_datetime(race)
        if dt is not None and dt.date() == target_date:
            return {
                "season": int(race["season"]),
                "round": int(race["round"]),
                "race_name": race.get("raceName"),
                "circuit_id": race["Circuit"]["circuitId"],
                "has_sprint": bool(race.get("Sprint")),
            }
    return None
