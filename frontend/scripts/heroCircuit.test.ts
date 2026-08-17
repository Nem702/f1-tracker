/**
 * The hero's race -> circuit join.
 *
 * `Race` carries no circuit id, only three free-text OpenF1 fields, so the
 * join is a lookup against explicit vocabularies (same shape as teams.ts's
 * `teamSlugFromName`). Two things can go wrong and neither surfaces as an
 * error at runtime — the hero just renders the wrong outline, or none:
 *
 *   1. A selectable race resolves to nothing, or to the WRONG circuit. Every
 *      assertion below is on id EQUALITY, never truthiness: a lookup that
 *      returns Silverstone for Budapest is still truthy, and that is exactly
 *      the bug being guarded against.
 *   2. A pack entry is unreachable by any alias — a circuit that silently
 *      never renders. The reachability test catches that.
 *
 * THE TRAP. `country_name` is ambiguous for two countries: Spain hosts both
 * Barcelona and Madrid, the United States hosts Miami, Austin and Las Vegas.
 * Those must NOT be in the country tier, or a US race resolves to whichever
 * round was typed first. The last test pins that down.
 *
 * Run: `npm test` (node --test --experimental-strip-types).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  circuitForRace,
  heroCircuitById,
  normalizeCircuitKey,
  HERO_CIRCUIT_ALIAS_TABLES,
} from "../src/lib/heroCircuit.ts";
import { HERO_CIRCUITS } from "../src/data/heroCircuits.ts";
import type { Race } from "../src/api/types.ts";

function race(
  circuit_short_name: string | null,
  location: string | null,
  country_name: string | null,
): Race {
  return {
    session_key: 1,
    location,
    country_name,
    circuit_short_name,
    date_start: null,
    date_end: null,
    year: 2026,
  };
}

/** The 13 rows /api/races actually returns, measured against the local API on
 *  2026-08-16. Two of them (Jeddah, Sakhir) are cancelled races with no lap
 *  data — they must still resolve to a circuit, because the hero renders a
 *  static outline for them rather than nothing. */
const REAL_RACES: [string, string, string, string][] = [
  ["Hungaroring", "Budapest", "Hungary", "hu-1986"],
  ["Spa-Francorchamps", "Spa-Francorchamps", "Belgium", "be-1925"],
  ["Silverstone", "Silverstone", "United Kingdom", "gb-1948"],
  ["Spielberg", "Spielberg", "Austria", "at-1969"],
  ["Catalunya", "Barcelona", "Spain", "es-1991"],
  ["Monte Carlo", "Monte Carlo", "Monaco", "mc-1929"],
  ["Montreal", "Montréal", "Canada", "ca-1978"],
  ["Miami", "Miami Gardens", "United States", "us-2022"],
  ["Jeddah", "Jeddah", "Saudi Arabia", "sa-2021"],
  ["Sakhir", "Sakhir", "Bahrain", "bh-2002"],
  ["Suzuka", "Suzuka", "Japan", "jp-1962"],
  ["Shanghai", "Shanghai", "China", "cn-2004"],
  ["Melbourne", "Melbourne", "Australia", "au-1953"],
];

test("every selectable race resolves to the right circuit", () => {
  for (const [circuit, location, country, expected] of REAL_RACES) {
    const got = circuitForRace(race(circuit, location, country));
    assert.equal(
      got?.id,
      expected,
      `${circuit} / ${location} / ${country} -> ${got?.id ?? "null"}`,
    );
  }
});

test("each tier resolves on its own, so a missing field still joins", () => {
  // circuit_short_name alone
  assert.equal(circuitForRace(race("Hungaroring", null, null))?.id, "hu-1986");
  // location alone
  assert.equal(circuitForRace(race(null, "Miami Gardens", null))?.id, "us-2022");
  // country alone, for an unambiguous country
  assert.equal(circuitForRace(race(null, null, "Belgium"))?.id, "be-1925");
});

test("every one of the 24 pack circuits is reachable by at least one alias", () => {
  const reachable = new Set<string>();
  for (const table of Object.values(HERO_CIRCUIT_ALIAS_TABLES)) {
    for (const id of Object.values(table)) reachable.add(id);
  }
  for (const circuit of HERO_CIRCUITS) {
    assert.ok(
      reachable.has(circuit.id),
      `${circuit.id} (${circuit.location}) is unreachable by any alias`,
    );
  }
  assert.equal(HERO_CIRCUITS.length, 24);
});

test("every alias points at a circuit that exists in the pack", () => {
  for (const [tier, table] of Object.entries(HERO_CIRCUIT_ALIAS_TABLES)) {
    for (const [key, id] of Object.entries(table)) {
      assert.ok(
        heroCircuitById(id),
        `${tier} alias "${key}" points at unknown circuit "${id}"`,
      );
    }
  }
});

test("normalisation strips accents, case and punctuation", () => {
  assert.equal(normalizeCircuitKey("Montréal"), "montreal");
  assert.equal(normalizeCircuitKey("Spa-Francorchamps"), "spafrancorchamps");
  assert.equal(normalizeCircuitKey("Monte Carlo"), "montecarlo");
  assert.equal(normalizeCircuitKey("São Paulo"), "saopaulo");
  assert.equal(normalizeCircuitKey(null), "");
});

test("an unknown race resolves to null rather than guessing", () => {
  assert.equal(circuitForRace(race("Nürburgring", "Nürburg", "Germany")), null);
  assert.equal(circuitForRace(race(null, null, null)), null);
  assert.equal(circuitForRace(null), null);
});

test("ambiguous countries are absent from the country tier", () => {
  // Spain hosts Barcelona AND Madrid; the US hosts Miami, Austin AND Vegas.
  // Resolving either from country alone would render the wrong circuit under
  // the right race name.
  const { country } = HERO_CIRCUIT_ALIAS_TABLES;
  assert.equal(country["spain"], undefined);
  assert.equal(country["unitedstates"], undefined);
  assert.equal(circuitForRace(race(null, null, "Spain")), null);
  assert.equal(circuitForRace(race(null, null, "United States")), null);

  // …but they still resolve when the circuit or location is present.
  assert.equal(circuitForRace(race(null, "Madrid", "Spain"))?.id, "es-2026");
  assert.equal(circuitForRace(race(null, "Barcelona", "Spain"))?.id, "es-1991");
  assert.equal(circuitForRace(race(null, "Austin", "United States"))?.id, "us-2012");
  assert.equal(circuitForRace(race(null, "Las Vegas", "United States"))?.id, "us-2023");
});

test("the pit-normal corrections survived transcription", () => {
  // These four are the circuits whose pit side was CHANGED after the mockup
  // was built. docs/hero-pits.html still carries the old values; if anyone
  // ever re-derives from that file instead of the JSON, these break.
  const expect: Record<string, { nrm: number; side: string }> = {
    "mc-1929": { nrm: -92.8, side: "inner" },
    "jp-1962": { nrm: 140.7, side: "inner" },
    "us-2022": { nrm: 121.9, side: "outer" },
    "ca-1978": { nrm: -91.6, side: "outer" },
  };
  for (const [id, want] of Object.entries(expect)) {
    const c = heroCircuitById(id);
    assert.ok(c, `${id} missing`);
    assert.equal(c.pitNormalDeg, want.nrm, `${id} pitNormalDeg`);
    assert.equal(c.pitSide, want.side, `${id} pitSide`);
  }
  // Exactly two circuits are "outer", and exactly 14 are rotated.
  assert.equal(HERO_CIRCUITS.filter((c) => c.pitSide === "outer").length, 2);
  assert.equal(HERO_CIRCUITS.filter((c) => c.rotationDeg === 90).length, 14);
  // Four are defaulted-not-eyeballed and flagged as such.
  assert.deepEqual(
    HERO_CIRCUITS.filter((c) => !c.pitSideConfirmed).map((c) => c.id).sort(),
    ["at-1969", "es-2026", "sa-2021", "sg-2008"],
  );
});
