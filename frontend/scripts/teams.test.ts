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

import { TEAM_ORDER, teamSlugFromName } from "../src/teams.ts";
import type { TeamSlug } from "../src/teams.ts";

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
