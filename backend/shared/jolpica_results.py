"""
jolpica_results.py

Normalizes Jolpica's official race classification, qualifying results, and
sprint results (when applicable) for a single season+round. Row shapes are
flattened out of Ergast's nested schema once here so callers (the
official-result endpoint, the race-weekend previous-race recap) don't each
re-derive the same field access.
"""

from backend.shared.jolpica_client import request_with_retry


def _driver_name(driver):
    return f"{driver.get('givenName', '')} {driver.get('familyName', '')}".strip()


def _format_race_row(row):
    fastest = row.get("FastestLap") or {}
    fastest_time = fastest.get("Time") or {}
    return {
        "position": int(row["position"]) if row.get("position") else None,
        "position_text": row.get("positionText"),
        "points": float(row["points"]) if row.get("points") is not None else None,
        "driver_code": row.get("Driver", {}).get("code"),
        "driver_name": _driver_name(row.get("Driver", {})),
        "constructor_name": row.get("Constructor", {}).get("name"),
        "grid": int(row["grid"]) if row.get("grid") else None,
        "laps": int(row["laps"]) if row.get("laps") else None,
        "status": row.get("status"),
        "time": (row.get("Time") or {}).get("time"),
        "fastest_lap_rank": int(fastest["rank"]) if fastest.get("rank") else None,
        "fastest_lap_time": fastest_time.get("time"),
    }


def _format_qualifying_row(row):
    return {
        "position": int(row["position"]) if row.get("position") else None,
        "driver_code": row.get("Driver", {}).get("code"),
        "driver_name": _driver_name(row.get("Driver", {})),
        "constructor_name": row.get("Constructor", {}).get("name"),
        "q1": row.get("Q1"),
        "q2": row.get("Q2"),
        "q3": row.get("Q3"),
    }


def get_official_result(season, round_number, has_sprint):
    """Fetches the official race classification + qualifying, and sprint
    results when `has_sprint`. Returns
    {"race": [...], "qualifying": [...], "sprint": [...] | None}. An empty
    Races array from Jolpica (a round with no data published yet, or a bad
    season/round) yields an empty list for that section rather than
    raising — Ergast semantics are always 200 + empty arrays, never 404."""
    race_data = request_with_retry(f"/{season}/{round_number}/results.json", params={"limit": 40})
    race_races = race_data.get("RaceTable", {}).get("Races", [])
    race_rows = [
        _format_race_row(r) for r in (race_races[0].get("Results", []) if race_races else [])
    ]

    quali_data = request_with_retry(f"/{season}/{round_number}/qualifying.json", params={"limit": 40})
    quali_races = quali_data.get("RaceTable", {}).get("Races", [])
    quali_rows = [
        _format_qualifying_row(r)
        for r in (quali_races[0].get("QualifyingResults", []) if quali_races else [])
    ]

    sprint_rows = None
    if has_sprint:
        sprint_data = request_with_retry(f"/{season}/{round_number}/sprint.json", params={"limit": 40})
        sprint_races = sprint_data.get("RaceTable", {}).get("Races", [])
        sprint_rows = [
            _format_race_row(r)
            for r in (sprint_races[0].get("SprintResults", []) if sprint_races else [])
        ]

    return {"race": race_rows, "qualifying": quali_rows, "sprint": sprint_rows}
