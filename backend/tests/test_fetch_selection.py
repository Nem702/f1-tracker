"""Which races the fetch pipeline picks: the season filter over /sessions,
and the catch-up selection on top of it. No network — get_sessions is
replaced with a canned list."""

from datetime import datetime, timedelta, timezone

import pytest

from backend.pipeline import fetch_laps
from backend.pipeline.fetch_laps import (
    format_catch_up,
    get_completed_race_sessions,
    select_sessions_to_fetch,
)

NOW = datetime.now(timezone.utc)


def _session(key, days_ago, **extra):
    start = NOW - timedelta(days=days_ago)
    return {
        "session_key": key,
        "location": f"Track{key}",
        "date_start": start.isoformat(),
        "date_end": (start + timedelta(hours=2)).isoformat(),
        **extra,
    }


@pytest.fixture
def sessions(monkeypatch):
    """Returns a setter: sessions([...]) makes get_sessions return that list."""
    def set_sessions(rows):
        monkeypatch.setattr(fetch_laps, "get_sessions", lambda **_: rows)
    return set_sessions


def test_cancelled_session_dropped(sessions):
    sessions([_session(1, 30), _session(2, 20, is_cancelled=True)])
    assert [s["session_key"] for s in get_completed_race_sessions()] == [1]


def test_future_session_dropped(sessions):
    sessions([_session(1, 30), _session(2, -5)])
    assert [s["session_key"] for s in get_completed_race_sessions()] == [1]


def test_malformed_or_missing_date_end_dropped(sessions):
    bad_date = _session(2, 20, date_end="not a date")
    no_date = _session(3, 10)
    del no_date["date_end"]
    sessions([_session(1, 30), bad_date, no_date])
    assert [s["session_key"] for s in get_completed_race_sessions()] == [1]


def test_completed_sessions_sorted_oldest_first(sessions):
    sessions([_session(3, 10), _session(1, 30), _session(2, 20)])
    assert [s["session_key"] for s in get_completed_race_sessions()] == [1, 2, 3]


COMPLETED = [_session(1, 30), _session(2, 20), _session(3, 10), _session(4, 3)]


def test_catch_up_nothing_missing_fetches_latest_only():
    # Identical to the pre-catch-up default run.
    picked = select_sessions_to_fetch(COMPLETED, stored_keys={1, 2, 3, 4})
    assert [s["session_key"] for s in picked] == [4]
    assert format_catch_up(picked[1:]).startswith("Catch-up: none")


def test_catch_up_latest_first_then_gaps_oldest_first():
    picked = select_sessions_to_fetch(COMPLETED, stored_keys={2})
    assert [s["session_key"] for s in picked] == [4, 1, 3]
    assert "2 completed race(s)" in format_catch_up(picked[1:])


def test_catch_up_refetches_latest_even_when_stored():
    picked = select_sessions_to_fetch(COMPLETED, stored_keys={4})
    assert [s["session_key"] for s in picked] == [4, 1, 2, 3]


def test_catch_up_no_completed_races_raises():
    with pytest.raises(ValueError):
        select_sessions_to_fetch([], stored_keys=set())
