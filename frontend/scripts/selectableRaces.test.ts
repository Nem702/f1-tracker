import { test } from "node:test";
import assert from "node:assert/strict";

import { filterSelectableRaces } from "../src/lib/selectableRaces.ts";
import type { Race } from "../src/api/types.ts";

const NOW = Date.parse("2026-08-17T00:00:00Z");

function race(overrides: Partial<Race>): Race {
  return {
    session_key: 1,
    location: "Somewhere",
    country_name: null,
    circuit_short_name: null,
    date_start: "2026-01-01T00:00:00Z",
    date_end: null,
    year: 2026,
    has_laps: true,
    ...overrides,
  };
}

test("has_laps: false is excluded", () => {
  const past = race({ session_key: 1, has_laps: false, date_start: "2026-01-01T00:00:00Z" });
  const withLaps = race({ session_key: 2, has_laps: true, date_start: "2026-01-01T00:00:00Z" });
  assert.deepEqual(
    filterSelectableRaces([past, withLaps], NOW).map((r) => r.session_key),
    [2],
  );
});

test("a future date is excluded even with has_laps true", () => {
  const future = race({ session_key: 1, has_laps: true, date_start: "2099-01-01T00:00:00Z" });
  const past = race({ session_key: 2, has_laps: true, date_start: "2026-01-01T00:00:00Z" });
  assert.deepEqual(
    filterSelectableRaces([future, past], NOW).map((r) => r.session_key),
    [2],
  );
});

test("has_laps true and a past (or null) date is included", () => {
  const withDate = race({ session_key: 1, has_laps: true, date_start: "2026-01-01T00:00:00Z" });
  const noDate = race({ session_key: 2, has_laps: true, date_start: null });
  assert.deepEqual(
    filterSelectableRaces([withDate, noDate], NOW).map((r) => r.session_key),
    [1, 2],
  );
});

test("an empty filtered result falls back to the unfiltered list", () => {
  const noLaps1 = race({ session_key: 1, has_laps: false });
  const noLaps2 = race({ session_key: 2, has_laps: false });
  assert.deepEqual(
    filterSelectableRaces([noLaps1, noLaps2], NOW).map((r) => r.session_key),
    [1, 2],
  );
});

test("an empty input list stays empty (no crash, no fallback loop)", () => {
  assert.deepEqual(filterSelectableRaces([], NOW), []);
});
