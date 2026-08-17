import { test } from "node:test";
import assert from "node:assert/strict";
import { paceDomain, quantile } from "../src/lib/paceDomain.ts";

/** Deterministic PRNG so these assertions can't flake. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const green = (n: number, base: number, spread: number, seed = 5) => {
  const r = lcg(seed);
  return Array.from({ length: n }, () => base + r() * spread);
};

test("quantile interpolates between neighbours", () => {
  assert.equal(quantile([0, 10], 0.5), 5);
  assert.equal(quantile([0, 10, 20], 0.25), 5);
});

test("a clean race puts the racing across a usable slice of the domain", () => {
  const pool = green(120, 81.5, 2.0);
  const { lo, hi } = paceDomain(pool);
  const inRange = pool.filter((t) => t >= lo && t <= hi).sort((a, b) => a - b);
  const height = (quantile(inRange, 0.95) - quantile(inRange, 0.05)) / (hi - lo);
  // The whole point of the component: not a flat band at the bottom.
  assert.ok(height > 0.4, `racing occupies only ${(100 * height).toFixed(0)}% of plot height`);
});

test("pit spikes do not inflate the domain", () => {
  const base = green(120, 81.5, 2.0);
  const clean = paceDomain(base).hi;
  const withPits = paceDomain([...base, ...Array.from({ length: 8 }, () => 103)]).hi;
  assert.ok(Math.abs(withPits - clean) < 0.2, `pit laps moved hi by ${(withPits - clean).toFixed(2)}s`);
});

test("hi barely drifts at 33% safety-car contamination", () => {
  // The property the rule is built for. A median-anchored spread drifts
  // +0.83s here; this must stay an order of magnitude tighter.
  for (const [label, spread] of [["flat deg", 2.0], ["wide deg", 4.5]] as const) {
    const base = green(80, 81.5, spread);
    const clean = paceDomain(base).hi;
    const sc = Array.from({ length: 39 }, () => 107);
    const drift = paceDomain([...base, ...sc]).hi - clean;
    assert.ok(drift < 0.35, `${label}: hi drifted ${drift.toFixed(2)}s under 33% contamination`);
  }
});

test("a genuine fastest lap is never clipped off the bottom", () => {
  // Regression: an earlier form bottom-clipped 2.6% of Monaco's laps. Monaco's
  // real shape is a fastest lap ~0.85 spreads below p05, which must stay in.
  const pool = [...green(120, 78, 2.0), 77.3, ...Array.from({ length: 30 }, () => 99)];
  const { lo } = paceDomain(pool);
  assert.ok(lo <= Math.min(...pool), `lo ${lo.toFixed(2)} clips the fastest lap ${Math.min(...pool)}`);
});

test("but an implausibly fast lap does not drag the floor away", () => {
  // The other half of the same guard: a timing glitch many spreads below p05
  // is excluded rather than allowed to flatten the plot. Without the bound the
  // domain would stretch to meet it and waste most of the height.
  const pool = [...green(120, 78, 2.0), 41.0, ...Array.from({ length: 30 }, () => 99)];
  const { lo } = paceDomain(pool);
  assert.ok(lo > 70, `a 41s glitch lap dragged lo down to ${lo.toFixed(2)}`);
});

test("a red-flag lap cannot drag the ceiling past 1.5x median", () => {
  const pool = [...green(120, 78, 2.0), 2264.2];
  const { hi } = paceDomain(pool);
  assert.ok(hi < 78 * 1.5 + 1, `hi ${hi.toFixed(1)} exceeded the ceiling rail`);
});

test("degenerate inputs still produce a positive-height domain", () => {
  for (const pool of [[82], [82, 82.1], Array.from({ length: 40 }, () => 82)]) {
    const { lo, hi } = paceDomain(pool);
    assert.ok(hi > lo, `non-positive domain for ${pool.length} laps`);
    assert.ok(Number.isFinite(lo) && Number.isFinite(hi));
  }
});
