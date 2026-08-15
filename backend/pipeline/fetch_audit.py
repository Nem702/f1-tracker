"""
Verification for the fetch phase of process_session(): asserts on
per-endpoint response record counts before any write happens.

A DB diff can't catch a total fetch failure — idempotent upserts against an
empty payload are no-ops, so previously-stored rows survive and both row
counts and checksums match. This module is the actual check: it fails the
run before a single row is written if an endpoint that should have data
came back empty.
"""

from backend.shared.logger import logger

# The frozen endpoint set for one call to process_session(). "FAIL" means a
# zero count aborts the run; "WARN" means it's logged loudly and the run
# continues — a red-flagged or shortened race can genuinely have zero pit
# stops, and failing on that would block a legitimate backfill.
ENDPOINT_POLICY = {
    "drivers": "FAIL",
    "laps": "FAIL",
    "stints": "FAIL",
    "pit": "WARN",
    "position": "FAIL",
    "weather": "FAIL",
    "race_control": "FAIL",
}


class FetchVerificationError(Exception):
    pass


def assert_fetch_counts(counts, session_key):
    """counts maps endpoint name -> int, or the string 'skipped' for
    race_control when race_control_already_fetched() short-circuited the
    fetch. 'skipped' never trips the assertion — it is not a zero."""
    failures = []

    for endpoint, policy in ENDPOINT_POLICY.items():
        if endpoint not in counts:
            failures.append(f"no count reported for {endpoint}")
            continue

        count = counts[endpoint]
        if count == "skipped":
            continue
        if count == 0:
            if policy == "FAIL":
                failures.append(f"zero records from {endpoint}")
            else:
                logger.warning(
                    "%s returned 0 records for session_key=%s — WARN policy, continuing",
                    endpoint, session_key,
                )

    if failures:
        raise FetchVerificationError(
            f"session_key={session_key}: {'; '.join(failures)}"
        )


def format_counts_table(counts, session_key):
    """Renders the counts dict as a plain-text table for pasting into reports."""
    lines = [f"Fetch counts — session_key={session_key}", f"{'endpoint':<14}{'count':>10}"]
    for endpoint in ENDPOINT_POLICY:
        count = counts.get(endpoint, "—")
        lines.append(f"{endpoint:<14}{str(count):>10}")
    return "\n".join(lines)
