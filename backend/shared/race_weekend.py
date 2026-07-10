"""
race_weekend.py

Builds the aggregate payload for the "race weekend" page: the next race on
the calendar (round number, circuit, weekend session times), last year's
winner at that specific circuit, a recap of the most recently completed
race, and the top-5 driver/constructor standings — all from the Jolpica F1
API (Ergast-schema, free, no key). Also exposes get_standings() for the
full/uncapped standings endpoint.

Deliberately independent of OpenF1/next_race.py: it finds "the next race"
itself by scanning the season schedule for the soonest date >= now, rather
than trusting an undocumented Ergast round-selector keyword or depending on
OpenF1 being reachable. get_race_weekend()/get_standings() have no side
effects at import time and are safe to call directly (the API layer wraps
them in a cache).
"""

from datetime import datetime, timezone

from backend.shared.jolpica_lookup import get_season_schedule, race_datetime
from backend.shared.jolpica_client import request_with_retry
from backend.shared.jolpica_results import get_official_result
from backend.shared.logger import logger

# Ergast/Jolpica session sub-blocks in weekend order. 2023 used
# "SecondPractice" for what's now "SprintQualifying" in 2024+ — jolpica
# already normalizes that (see docs/ergast_differences.md), so this project
# only needs to know the current key names.
SESSION_BLOCKS = [
    ("FirstPractice", "Practice 1"),
    ("SecondPractice", "Practice 2"),
    ("ThirdPractice", "Practice 3"),
    ("SprintQualifying", "Sprint Qualifying"),
    ("Sprint", "Sprint"),
    ("Qualifying", "Qualifying"),
]


def _extract_sessions(race):
    sessions = []
    for key, label in SESSION_BLOCKS:
        block = race.get(key)
        if not block:
            continue
        dt = race_datetime(block)
        if dt:
            sessions.append({"name": label, "date_start": dt.isoformat()})

    race_dt = race_datetime(race)
    if race_dt:
        sessions.append({"name": "Race", "date_start": race_dt.isoformat()})

    sessions.sort(key=lambda s: s["date_start"])
    return sessions


def _find_next_race(races, now):
    upcoming = []
    for race in races:
        dt = race_datetime(race)
        if dt is not None and dt >= now:
            upcoming.append((dt, race))
    if not upcoming:
        return None
    upcoming.sort(key=lambda x: x[0])
    return upcoming[0]


def _find_previous_race(races, now):
    completed = []
    for race in races:
        dt = race_datetime(race)
        if dt is not None and dt < now:
            completed.append((dt, race))
    if not completed:
        return None
    completed.sort(key=lambda x: x[0])
    return completed[-1]


def _get_last_year_winner(season, circuit_id):
    """Best-effort: a circuit new to (or rotated off) the calendar has no
    prior-year result at all, which is a normal, expected outcome — not an
    error — so this returns None rather than raising."""
    try:
        data = request_with_retry(f"/{season}/circuits/{circuit_id}/results.json", params={"limit": 1})
    except Exception:
        logger.exception("last-year-winner lookup failed for %s/%s", season, circuit_id)
        return None

    races = data.get("RaceTable", {}).get("Races", [])
    if not races:
        return None
    results = races[0].get("Results") or []
    if not results:
        return None
    winner = results[0]
    driver = winner.get("Driver", {})
    constructor = winner.get("Constructor", {})
    return {
        "season": season,
        "driver_name": f"{driver.get('givenName', '')} {driver.get('familyName', '')}".strip() or None,
        "constructor_name": constructor.get("name"),
    }


def _get_previous_race_recap(now):
    """Most recently completed race, regardless of which season's schedule
    contains the upcoming race — so this still finds last season's finale
    right at a season rollover, when the next-race search may have already
    jumped to next year's schedule. Best-effort: returns None rather than
    raising if the schedule or result lookup fails."""
    this_year_races, _ = get_season_schedule(now.year)
    found = _find_previous_race(this_year_races, now)
    if found is None:
        last_year_races, _ = get_season_schedule(now.year - 1)
        found = _find_previous_race(last_year_races, now)
    if found is None:
        return None

    prev_dt, race = found
    season = int(race["season"])
    round_number = int(race["round"])
    has_sprint = bool(race.get("Sprint"))

    try:
        result = get_official_result(season, round_number, has_sprint)
    except Exception:
        logger.exception("previous-race recap fetch failed for %s round %s", season, round_number)
        return None

    race_rows = result.get("race") or []
    fastest = next((r for r in race_rows if r.get("fastest_lap_rank") == 1), None)
    sprint_rows = result.get("sprint")

    return {
        "season": season,
        "round": round_number,
        "race_name": race.get("raceName"),
        "date": prev_dt.isoformat(),
        "top3": race_rows[:3],
        "fastest_lap": fastest,
        "sprint_top3": sprint_rows[:3] if sprint_rows else None,
    }


def _get_standings(kind, season):
    """`kind` is 'driverstandings' or 'constructorstandings'. Returns the
    StandingsList dict for that season, or None if the season has no
    standings yet (e.g. queried before round 1 has run). Requests a high
    limit regardless of caller — slicing to whatever size is needed
    (top-5 vs. the full grid) happens in the _format_* helpers below, so
    there's exactly one request shape to reason about."""
    data = request_with_retry(f"/{season}/{kind}.json", params={"limit": 100})
    lists = data.get("StandingsTable", {}).get("StandingsLists", [])
    return lists[0] if lists else None


def _format_driver_standings(standings, limit):
    if not standings:
        return []
    return [
        {
            "position": int(d["position"]),
            "driver_name": f"{d['Driver'].get('givenName', '')} {d['Driver'].get('familyName', '')}".strip(),
            "code": d["Driver"].get("code"),
            "team_name": d["Constructors"][0]["name"] if d.get("Constructors") else None,
            "points": float(d["points"]),
        }
        for d in standings.get("DriverStandings", [])[:limit]
    ]


def _format_constructor_standings(standings, limit):
    if not standings:
        return []
    return [
        {
            "position": int(c["position"]),
            "team_name": c["Constructor"]["name"],
            "points": float(c["points"]),
        }
        for c in standings.get("ConstructorStandings", [])[:limit]
    ]


def _driver_standings_top5(season):
    # A brand-new season has no standings until its first race — fall back
    # to the just-finished season so the card still shows something
    # meaningful ("who's the reigning order") instead of an empty table.
    standings = _get_standings("driverstandings", season) or _get_standings(
        "driverstandings", season - 1
    )
    return _format_driver_standings(standings, 5)


def _constructor_standings_top5(season):
    standings = _get_standings("constructorstandings", season) or _get_standings(
        "constructorstandings", season - 1
    )
    return _format_constructor_standings(standings, 5)


def get_standings(limit=30):
    """Full driver + constructor standings for the current season, falling
    back to last season before round 1 has run (same rule as the top-5
    helpers above) — backs GET /api/standings. `limit` caps rows per
    table; the default comfortably covers a full ~20-24 entry grid."""
    now = datetime.now(timezone.utc)
    season = now.year
    driver_list = _get_standings("driverstandings", season)
    if not driver_list:
        season -= 1
        driver_list = _get_standings("driverstandings", season)
    constructor_list = _get_standings("constructorstandings", season)
    return {
        "season": season,
        "driver_standings": _format_driver_standings(driver_list, limit),
        "constructor_standings": _format_constructor_standings(constructor_list, limit),
    }


def get_race_weekend():
    """Returns the aggregate payload, or None if no upcoming race could be
    found (e.g. the current season's schedule isn't published yet and
    next year's isn't either)."""
    now = datetime.now(timezone.utc)
    year = now.year

    races, total_rounds = get_season_schedule(year)
    found = _find_next_race(races, now)
    if found is None:
        # This year's calendar is exhausted (season over) or not yet
        # published — try next year rather than reporting "nothing upcoming"
        # for months over the off-season.
        races, total_rounds = get_season_schedule(year + 1)
        found = _find_next_race(races, now)
    if found is None:
        logger.warning("No upcoming race found in %s or %s schedules", year, year + 1)
        return None

    next_dt, race = found
    season = int(race["season"])
    round_number = int(race["round"])
    circuit = race["Circuit"]
    location = circuit["Location"]

    last_winner = _get_last_year_winner(season - 1, circuit["circuitId"])

    return {
        "season": season,
        "round": round_number,
        "total_rounds": total_rounds,
        "race_name": race.get("raceName"),
        "date_start": next_dt.isoformat(),
        "circuit": {
            "circuit_id": circuit["circuitId"],
            "name": circuit.get("circuitName"),
            "locality": location.get("locality"),
            "country": location.get("country"),
            "lat": float(location["lat"]),
            "long": float(location["long"]),
        },
        "sessions": _extract_sessions(race),
        "last_year_winner": last_winner,
        "previous_race": _get_previous_race_recap(now),
        "driver_standings": _driver_standings_top5(season),
        "constructor_standings": _constructor_standings_top5(season),
    }
