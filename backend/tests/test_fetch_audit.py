"""The fetch-phase guard: a zero count from a FAIL endpoint stops the run
before anything is written."""

import pytest

from backend.pipeline.fetch_audit import FetchVerificationError, assert_fetch_counts

GOOD = {
    "drivers": 22,
    "laps": 1200,
    "stints": 60,
    "pit": 0,  # WARN policy: a red-flagged race can genuinely have none
    "position": 500,
    "weather": 120,
    "race_control": "skipped",  # already fetched — not a zero
}


def test_good_counts_pass():
    assert_fetch_counts(GOOD, session_key=1)


def test_zero_from_fail_endpoint_raises():
    with pytest.raises(FetchVerificationError, match="zero records from laps"):
        assert_fetch_counts({**GOOD, "laps": 0}, session_key=1)
