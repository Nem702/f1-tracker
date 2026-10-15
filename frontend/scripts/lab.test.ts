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
 *   - team lineage: gen-1 grid, a child's team, elites keeping theirs
 *   - sector times wrong at the start/finish wrap, and tower order
 *
 * Run: `npm test` (node --test --experimental-strip-types).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { HERO_CIRCUITS } from "../src/data/heroCircuits.ts";
import { INPUTS, randomWeights, think, WEIGHT_COUNT } from "../src/lab/brain.ts";
import { CAR, stepCar, turnLimit } from "../src/lab/car.ts";
import { EVO, gridTeam, nextGeneration, type Seat } from "../src/lab/evolution.ts";
import { createRng, type Rng } from "../src/lab/rng.ts";
import { recordSectors } from "../src/lab/sim.ts";
import { sectorTimes, towerOrder } from "../src/lab/timing.ts";
import { TEAM_ORDER } from "../src/teams.ts";
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

function rankedPopulation(seed: number): Seat[] {
  const rng = createRng(seed);
  return Array.from({ length: EVO.POPULATION }, (_, i) => ({
    weights: randomWeights(rng),
    team: gridTeam(i),
  }));
}

test("elites survive a generation unchanged", () => {
  const ranked = rankedPopulation(7);
  // Mutation rate 1: every non-elite weight is nudged, so only copying can
  // leave a brain identical.
  const next = nextGeneration(ranked, createRng(8), 1);
  assert.equal(next.length, EVO.POPULATION);
  for (let i = 0; i < EVO.ELITES; i++) {
    assert.deepEqual(next[i], ranked[i], "elite keeps its weights and its team");
    assert.notEqual(next[i].weights, ranked[i].weights, "elite should be a copy, not the same array");
  }
  assert.notDeepEqual(next[EVO.ELITES].weights, ranked[EVO.ELITES].weights);
});

test("the same seed gives the same next generation", () => {
  const ranked = rankedPopulation(3);
  const a = nextGeneration(ranked, createRng(42), EVO.MUTATION_RATE);
  const b = nextGeneration(ranked, createRng(42), EVO.MUTATION_RATE);
  const c = nextGeneration(ranked, createRng(43), EVO.MUTATION_RATE);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("generation 1 is the real grid: two cars per team, in TEAM_ORDER", () => {
  const teams = Array.from({ length: EVO.POPULATION }, (_, i) => gridTeam(i));
  assert.equal(EVO.POPULATION, TEAM_ORDER.length * 2);
  assert.deepEqual(teams, TEAM_ORDER.flatMap((t) => [t, t]));
});

test("a child races for the parent it copied more weights from", () => {
  // Every weight of parent k is (k + 1) / 10 (inside the weight clamp), and
  // the mutation rate is 0, so each child weight names its parent.
  const ranked: Seat[] = Array.from({ length: EVO.POPULATION }, (_, k) => ({
    weights: Array.from({ length: WEIGHT_COUNT }, () => (k + 1) / 10),
    team: TEAM_ORDER[k % TEAM_ORDER.length],
  }));
  const next = nextGeneration(ranked, createRng(5), 0);
  let mixed = 0;
  for (const child of next.slice(EVO.ELITES)) {
    const counts = new Map<number, number>();
    for (const w of child.weights) {
      const k = Math.round(w * 10) - 1;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const [majority, n] = [...counts].sort((x, y) => y[1] - x[1])[0];
    if (counts.size > 1) {
      mixed++;
      if (n * 2 === WEIGHT_COUNT) continue; // a tie: covered by the next test
    }
    assert.equal(child.team, ranked[majority].team);
  }
  assert.ok(mixed > 0, "no child mixed two parents, so the test proved nothing");
});

test("a child with an even split of weights takes parent a's team", () => {
  const a: Seat = { weights: Array.from({ length: WEIGHT_COUNT }, () => 1), team: "haas" };
  const b: Seat = { weights: Array.from({ length: WEIGHT_COUNT }, () => 2), team: "williams" };
  const ranked = [a, b, b, ...Array.from({ length: EVO.POPULATION - 3 }, () => b)];
  // Scripted rng: pick a then b, then per weight alternate a/b with no
  // mutation, which gives exactly half from each.
  let call = 0;
  let weight = 0;
  const rng: Rng = () => {
    call++;
    if (call === 1) return 0; // a = pool[0]
    if (call === 2) return 1 / EVO.PARENTS; // b = pool[1]
    if ((call - 3) % 2 === 1) return 0.99; // mutation roll: never at rate 0
    return weight++ % 2 === 0 ? 0.1 : 0.9; // crossover: a, b, a, b, ...
  };
  const child = nextGeneration(ranked, rng, 0)[EVO.ELITES];
  assert.equal(child.weights.filter((w) => w === 1).length, WEIGHT_COUNT / 2);
  assert.equal(child.team, "haas");
});

test("sector times are recorded across the start/finish wrap", () => {
  const circuit = HERO_CIRCUITS[0];
  const track = buildTrack(parsePath(circuit.path), HALF_WIDTH);
  const r = { progress: 0, frames: 0, sectorFrames: [null, null, null] as (number | null)[] };
  let seg = 0;
  let lastS = 0;
  let wrapFrame: number | null = null;
  // Same centreline walk as the progress test, one 2-unit step per frame.
  for (let d = 2; d <= track.length + 20; d += 2) {
    const along = d % track.length;
    let i = 0;
    while (track.cum[i + 1] < along) i++;
    const a = track.points[i];
    const b = track.points[(i + 1) % track.points.length];
    const t = (along - track.cum[i]) / (track.cum[i + 1] - track.cum[i]);
    const proj = project(track, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, seg);
    seg = proj.seg;
    if (proj.s < lastS && wrapFrame === null) wrapFrame = r.frames + 1;
    r.progress += unwrapDelta(lastS, proj.s, track.length);
    lastS = proj.s;
    r.frames++;
    recordSectors(r, track.length);
  }
  const [s1, s2, s3] = r.sectorFrames;
  assert.ok(s1 !== null && s2 !== null && s3 !== null, "every sector closed");
  assert.ok(s1 < s2 && s2 < s3);
  assert.equal(s3, wrapFrame, "S3 closes on the step that crosses the line");
  // Each third is length/3 units of 2-unit steps.
  for (const time of sectorTimes(r)) {
    assert.ok(time !== null && Math.abs(time - track.length / 3 / 2) <= 1, `sector took ${time}`);
  }
  assert.equal(sectorTimes(r).reduce<number>((sum, x) => sum + (x ?? 0), 0), s3);
});

test("tower order: finishers by lap time, then the rest by distance", () => {
  const cars = [
    { id: "far", lapFrames: null, maxProgress: 900 },
    { id: "slowLap", lapFrames: 1600, maxProgress: 1000 },
    { id: "near", lapFrames: null, maxProgress: 100 },
    { id: "fastLap", lapFrames: 1400, maxProgress: 1000 },
    { id: "far2", lapFrames: null, maxProgress: 900 },
  ];
  assert.deepEqual(
    towerOrder(cars).map((c) => c.id),
    ["fastLap", "slowLap", "far", "far2", "near"],
  );
});
