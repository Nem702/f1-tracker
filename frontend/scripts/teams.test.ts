/**
 * teamSlugFromName has to resolve TWO team-name vocabularies, because two
 * different upstreams feed it:
 *
 *   OpenF1   /api/drivers -> team_name        (the pipeline's roster)
 *   Jolpica  constructor_name                 (standings, official results)
 *
 * They disagree, and for one team they share no substring at all:
 * OpenF1 calls it "Racing Bulls", Jolpica calls it "RB F1 Team". A matcher
 * written against either source alone silently returns null for the other,
 * and the failure renders as a grey TeamDot rather than an error — which is
 * why this is a test and not a comment.
 *
 * THE TRAP THIS FILE EXISTS FOR. "Racing Bulls" contains "bulls"; a loose
 * "bull" or "rb" test swallows it into Red Bull, or swallows Red Bull into
 * Racing Bulls, depending on which is checked first. Both Racing Bulls
 * patterns must be evaluated BEFORE any Red Bull pattern, and the Red Bull
 * test must stay the exact two-word form. Every assertion below is on slug
 * EQUALITY, never truthiness — a matcher that returns the wrong team is
 * still truthy, and that is precisely the bug being guarded against.
 *
 * Run: `npm test` (node --test --experimental-strip-types).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TEAM_ORDER,
  buildRosters,
  defaultTeam,
  raceEntrants,
  teamSlugFromName,
} from "../src/teams.ts";
import type { TeamRoster, TeamSlug } from "../src/teams.ts";
import type { Driver, Lap, RaceResultRow } from "../src/api/types.ts";

/** What each upstream actually calls each team. OpenF1 names were fetched
 *  live from /v1/drivers (session_key=11342); Jolpica names from
 *  /ergast/f1/2026/constructors. Kept as one table so a new team cannot be
 *  added to TEAM_ORDER without both of its real-world names being recorded. */
const VOCABULARIES: Record<TeamSlug, { openf1: string; jolpica: string }> = {
  ferrari: { openf1: "Ferrari", jolpica: "Ferrari" },
  mercedes: { openf1: "Mercedes", jolpica: "Mercedes" },
  mclaren: { openf1: "McLaren", jolpica: "McLaren" },
  redbull: { openf1: "Red Bull Racing", jolpica: "Red Bull" },
  astonmartin: { openf1: "Aston Martin", jolpica: "Aston Martin" },
  williams: { openf1: "Williams", jolpica: "Williams" },
  audi: { openf1: "Audi", jolpica: "Audi" },
  alpine: { openf1: "Alpine", jolpica: "Alpine F1 Team" },
  haas: { openf1: "Haas F1 Team", jolpica: "Haas F1 Team" },
  racingbulls: { openf1: "Racing Bulls", jolpica: "RB F1 Team" },
  cadillac: { openf1: "Cadillac", jolpica: "Cadillac F1 Team" },
};

// ---- the Racing Bulls / Red Bull collision ---------------------------------

test("Racing Bulls resolves from both vocabularies", () => {
  assert.equal(teamSlugFromName("Racing Bulls"), "racingbulls");
  assert.equal(teamSlugFromName("RB F1 Team"), "racingbulls");
  assert.equal(teamSlugFromName("rb f1"), "racingbulls");
});

test("Red Bull resolves and is not swallowed by Racing Bulls", () => {
  assert.equal(teamSlugFromName("Red Bull"), "redbull");
  assert.equal(teamSlugFromName("Red Bull Racing"), "redbull");
  assert.equal(teamSlugFromName("Oracle Red Bull Racing"), "redbull");
});

test("neither team ever resolves to the other", () => {
  // Stated separately from the two tests above so the report names the actual
  // defect if it regresses, rather than just "expected racingbulls".
  for (const name of ["Racing Bulls", "RB F1 Team", "rb f1", "Visa Cash App RB"]) {
    assert.notEqual(teamSlugFromName(name), "redbull", `${name} must not be Red Bull`);
  }
  for (const name of ["Red Bull", "Red Bull Racing", "Oracle Red Bull Racing"]) {
    assert.notEqual(teamSlugFromName(name), "racingbulls", `${name} must not be Racing Bulls`);
  }
});

// ---- both vocabularies, every team -----------------------------------------

test("OpenF1 vocabulary resolves every team", () => {
  for (const slug of TEAM_ORDER) {
    assert.equal(teamSlugFromName(VOCABULARIES[slug].openf1), slug);
  }
});

test("Jolpica vocabulary resolves every team", () => {
  for (const slug of TEAM_ORDER) {
    assert.equal(teamSlugFromName(VOCABULARIES[slug].jolpica), slug);
  }
});

test("every tracked team is reachable from a real name", () => {
  // Completeness, not spot-checks: a slug added to TEAM_ORDER without a
  // matcher branch passes every test above (they iterate TEAM_ORDER) only if
  // it also resolves. This asserts the mapping is onto TEAM_ORDER exactly —
  // 11 names in, 11 distinct slugs out, no team missing and none doubled up.
  const resolved = TEAM_ORDER.map((slug) => teamSlugFromName(VOCABULARIES[slug].openf1));
  assert.deepEqual([...new Set(resolved)].sort(), [...TEAM_ORDER].sort());
});

// ---- sponsor decoration and case ------------------------------------------

test("sponsor-decorated names still resolve", () => {
  // OpenF1 has historically prefixed title sponsors; the matcher is substring
  // based so this must keep working.
  assert.equal(teamSlugFromName("Scuderia Ferrari"), "ferrari");
  assert.equal(teamSlugFromName("Mercedes-AMG Petronas"), "mercedes");
  assert.equal(teamSlugFromName("McLaren Formula 1 Team"), "mclaren");
  assert.equal(teamSlugFromName("Aston Martin Aramco"), "astonmartin");
  assert.equal(teamSlugFromName("Atlassian Williams Racing"), "williams");
  assert.equal(teamSlugFromName("MoneyGram Haas F1 Team"), "haas");
  assert.equal(teamSlugFromName("BWT Alpine F1 Team"), "alpine");
});

test("matching is case insensitive", () => {
  assert.equal(teamSlugFromName("FERRARI"), "ferrari");
  assert.equal(teamSlugFromName("racing bulls"), "racingbulls");
  assert.equal(teamSlugFromName("RED BULL RACING"), "redbull");
  assert.equal(teamSlugFromName("aston martin"), "astonmartin");
});

// ---- non-matches ------------------------------------------------------------

test("unresolvable input is null, not a guess", () => {
  assert.equal(teamSlugFromName(null), null);
  assert.equal(teamSlugFromName(""), null);
  assert.equal(teamSlugFromName("Toro Rosso"), null);
  assert.equal(teamSlugFromName("Lotus"), null);
});

// ---- per-race rosters (handoff 12) -----------------------------------------
//
// The one 2026 swap, as Neon and OpenF1 actually hold it: from Zandvoort on,
// LAW moved Racing Bulls -> Red Bull, HAD (Red Bull) was not entered and TSU
// joined Racing Bulls. `drivers` keeps only the latest team_name, so LAW reads
// "Red Bull Racing" for every race — which is exactly what these guard.

const DRIVERS: Driver[] = [
  [3, "VER", "Max VERSTAPPEN", "Red Bull Racing"],
  [6, "HAD", "Isack HADJAR", "Red Bull Racing"],
  [30, "LAW", "Liam LAWSON", "Red Bull Racing"],
  [22, "TSU", "Yuki TSUNODA", "Racing Bulls"],
  [41, "LIN", "Arvid LINDBLAD", "Racing Bulls"],
  [16, "LEC", "Charles LECLERC", "Ferrari"],
  [44, "HAM", "Lewis HAMILTON", "Ferrari"],
  [12, "ANT", "Andrea Kimi ANTONELLI", "Mercedes"],
  [63, "RUS", "George RUSSELL", "Mercedes"],
].map(([driver_number, name_acronym, name, team_name]) => ({
  driver_number: driver_number as number,
  name_acronym: name_acronym as string,
  name: name as string,
  team_name: team_name as string,
}));

// Jolpica's vocabulary on purpose: "Red Bull", "RB F1 Team".
const result = (rows: [string, string][]): RaceResultRow[] =>
  rows.map(([driver_code, constructor_name], i) => ({
    position: i + 1,
    position_text: String(i + 1),
    points: null,
    driver_code,
    driver_name: driver_code,
    constructor_name,
    grid: null,
    laps: null,
    status: null,
    time: null,
    fastest_lap_rank: null,
    fastest_lap_time: null,
  }));

const BUDAPEST = result([
  ["VER", "Red Bull"], ["HAD", "Red Bull"],
  ["LAW", "RB F1 Team"], ["LIN", "RB F1 Team"],
  ["LEC", "Ferrari"], ["HAM", "Ferrari"],
]);
const MADRID = result([
  ["VER", "Red Bull"], ["LAW", "Red Bull"],
  ["TSU", "RB F1 Team"], ["LIN", "RB F1 Team"],
  ["LEC", "Ferrari"], ["HAM", "Ferrari"],
]);

const duoAt = (race: RaceResultRow[] | null, slug: TeamSlug) => {
  const rosters = buildRosters(DRIVERS, race ? raceEntrants(race, DRIVERS) : undefined);
  const roster = rosters.find((r) => r.slug === slug);
  assert.ok(roster, `no ${slug} roster`);
  return roster.duo;
};
const acronyms = (race: RaceResultRow[] | null, slug: TeamSlug) =>
  duoAt(race, slug).map((d) => d.acronym);

test("Red Bull resolves per race across the Zandvoort swap", () => {
  assert.deepEqual(acronyms(BUDAPEST, "redbull"), ["VER", "HAD"]);
  assert.deepEqual(acronyms(MADRID, "redbull"), ["VER", "LAW"]);
});

test("Racing Bulls loses LAW after the swap, and has him before it", () => {
  const budapest = duoAt(BUDAPEST, "racingbulls");
  assert.deepEqual(budapest.map((d) => d.acronym), ["LAW", "LIN"]);
  // LAW drove for Racing Bulls there, whatever `drivers` says now — so he
  // carries that team and its slot 0.
  assert.equal(budapest[0].teamSlug, "racingbulls");
  assert.equal(budapest[0].slot, 0);
  assert.deepEqual(acronyms(MADRID, "racingbulls"), ["TSU", "LIN"]);
});

test("slot-0 driver still leads the duo", () => {
  const madrid = duoAt(MADRID, "redbull");
  assert.equal(madrid[0].acronym, "VER");
  assert.equal(madrid[0].slot, 0);
  assert.equal(madrid[1].slot, 1);
});

test("no official result falls back to the season-wide duo", () => {
  assert.deepEqual(acronyms(null, "redbull"), ["VER", "HAD"]);
  assert.deepEqual(acronyms(null, "racingbulls"), ["TSU", "LIN"]);
});

test("H2H list stays season-wide whatever the race", () => {
  const rosters = buildRosters(DRIVERS, raceEntrants(MADRID, DRIVERS));
  const redbull = rosters.find((r) => r.slug === "redbull");
  assert.deepEqual(redbull?.drivers.map((d) => d.acronym), ["VER", "HAD", "LAW"]);
});

// ---- default team -----------------------------------------------------------

const timedLaps = (driver_number: number, count: number): Lap[] =>
  Array.from({ length: count }, (_, i) => ({
    session_key: 1,
    driver_number,
    lap_number: i + 1,
    date_start: null,
    lap_duration: 90,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
    i1_speed: null,
    i2_speed: null,
    st_speed: null,
    is_pit_out_lap: null,
  }));

const rostersAt = (race: RaceResultRow[]): TeamRoster[] =>
  buildRosters(DRIVERS, raceEntrants(race, DRIVERS));

test("default is Ferrari when both Ferrari drivers have a model", () => {
  const laps = [16, 44, 63, 12].flatMap((n) => timedLaps(n, 57));
  assert.equal(defaultTeam(rostersAt(MADRID), laps), "ferrari");
});

test("default falls back to the next team in TEAM_ORDER with a model", () => {
  // Madrid as it happened: HAM out after 6 laps.
  const laps = [...timedLaps(16, 57), ...timedLaps(44, 6), ...[63, 12].flatMap((n) => timedLaps(n, 57))];
  assert.equal(defaultTeam(rostersAt(MADRID), laps), "mercedes");
});

test("default stays Ferrari when no team has a model", () => {
  assert.equal(defaultTeam(rostersAt(MADRID), []), "ferrari");
});
