/**
 * AI Lab core behaviour: the pieces that would quietly ruin the lab if they
 * broke, without throwing anything at runtime.
 *
 *   - brain outputs leaving -1..1 (gas/steer past full lock)
 *   - progress going backwards or jumping at the start/finish line (cars
 *     scored wrongly, laps never completing)
 *   - the grip limit not binding at speed (cars could lap flat out, so
 *     nothing would ever learn to brake)
 *   - elites changing between generations (the best lap could be lost)
 *   - non-repeatable evolution for a given seed
 *
 * Run: `npm test` (node --test --experimental-strip-types).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { HERO_CIRCUITS } from "../src/data/heroCircuits.ts";
import { INPUTS, randomWeights, think, WEIGHT_COUNT } from "../src/lab/brain.ts";
import { CAR, stepCar, turnLimit } from "../src/lab/car.ts";
import { EVO, nextGeneration } from "../src/lab/evolution.ts";
import { createRng } from "../src/lab/rng.ts";
import { buildTrack, HALF_WIDTH, parsePath, project, unwrapDelta } from "../src/lab/track.ts";

test("brain outputs stay within -1..1 for random weights", () => {
  const rng = createRng(1);
  for (let trial = 0; trial < 500; trial++) {
    // Scaled well past the evolution clamp, to push tanh into saturation.
    const weights = randomWeights(rng).map((w) => w * 20);
    const inputs = Array.from({ length: INPUTS }, () => rng() * 2 - 1);
    for (const out of think(weights, inputs)) {
      assert.ok(out >= -1 && out <= 1, `output ${out} out of range`);
    }
  }
  assert.equal(randomWeights(rng).length, WEIGHT_COUNT);
});

test("progress rises monotonically along the centreline and wraps at start/finish", () => {
  for (const circuit of HERO_CIRCUITS) {
    const track = buildTrack(parsePath(circuit.path), HALF_WIDTH);
    const { points, cum, length } = track;
    let seg = 0;
    let lastS = 0;
    let progress = 0;
    let wrapped = false;
    let walked = 0;
    // Walk one full lap in 2-unit steps, then a little past the line.
    for (let d = 2; d <= length + 20; d += 2) {
      const along = d % length;
      let i = 0;
      while (cum[i + 1] < along) i++;
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const t = (along - cum[i]) / (cum[i + 1] - cum[i]);
      const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };

      const proj = project(track, p, seg);
      seg = proj.seg;
      if (proj.s < lastS) wrapped = true;
      const delta = unwrapDelta(lastS, proj.s, length);
      assert.ok(delta > 0, `${circuit.id}: progress fell by ${-delta} at ${d.toFixed(0)}`);
      progress += delta;
      lastS = proj.s;
      walked = d;
    }
    assert.ok(wrapped, `${circuit.id}: lap position never wrapped back to 0`);
    assert.ok(
      Math.abs(progress - walked) < 1e-6,
      `${circuit.id}: walked ${walked}, progress says ${progress}`,
    );
  }
});

test("at top speed the turn rate never exceeds the grip limit", () => {
  const gripLimit = CAR.GRIP / CAR.TOP_SPEED;
  // The limit must actually bite at top speed, or braking is never needed.
  assert.ok(gripLimit < CAR.MAX_STEER);
  assert.equal(turnLimit(CAR.TOP_SPEED), gripLimit);

  for (const steer of [1, -1, 5, -5]) {
    const car = { x: 0, y: 0, heading: 0, speed: CAR.TOP_SPEED, seg: 0 };
    for (let i = 0; i < 120; i++) {
      const before = car.heading;
      stepCar(car, 1, steer);
      assert.equal(car.speed, CAR.TOP_SPEED);
      const rate = Math.abs(car.heading - before) / CAR.DT;
      assert.ok(rate <= gripLimit + 1e-9, `turned at ${rate} rad/s, limit ${gripLimit}`);
    }
  }
});

function rankedPopulation(seed: number): number[][] {
  const rng = createRng(seed);
  return Array.from({ length: EVO.POPULATION }, () => randomWeights(rng));
}

test("elites survive a generation unchanged", () => {
  const ranked = rankedPopulation(7);
  // Mutation rate 1: every non-elite weight is nudged, so only copying can
  // leave a brain identical.
  const next = nextGeneration(ranked, createRng(8), 1);
  assert.equal(next.length, EVO.POPULATION);
  for (let i = 0; i < EVO.ELITES; i++) {
    assert.deepEqual(next[i], ranked[i]);
    assert.notEqual(next[i], ranked[i], "elite should be a copy, not the same array");
  }
  assert.notDeepEqual(next[EVO.ELITES], ranked[EVO.ELITES]);
});

test("the same seed gives the same next generation", () => {
  const ranked = rankedPopulation(3);
  const a = nextGeneration(ranked, createRng(42), EVO.MUTATION_RATE);
  const b = nextGeneration(ranked, createRng(42), EVO.MUTATION_RATE);
  const c = nextGeneration(ranked, createRng(43), EVO.MUTATION_RATE);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});
