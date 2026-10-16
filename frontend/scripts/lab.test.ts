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
 *   - circuit outlines (circuits.ts, scripts/labGeometry.ts) that aren't
 *     closed, evenly spaced and the right length, a merge check that misses
 *     a close pair, or a generated circuit the sim can't drive
 *   - real units: a lab track not the official length in metres, a car that
 *     passes 340 km/h or brakes in the wrong distance, cars not starting on
 *     the line at the pole lap's speed, GRIP_SCALE drifting from the
 *     Hungaroring calibration, or pole data missing from circuits.ts
 *
 * Run: `npm test` (node --test --experimental-strip-types).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { HERO_CIRCUITS } from "../src/data/heroCircuits.ts";
import { INPUTS, randomWeights, think, WEIGHT_COUNT } from "../src/lab/brain.ts";
import { brakeDecel, CAR, latAccel, spawnCar, stepCar, turnLimit } from "../src/lab/car.ts";
import { LAB_CIRCUITS } from "../src/lab/circuits.ts";
import { EVO, gridTeam, nextGeneration, type Seat } from "../src/lab/evolution.ts";
import { createRng, type Rng } from "../src/lab/rng.ts";
import { curvatures, gripFor, referenceLap } from "../src/lab/reference.ts";
import { createGeneration, recordSectors, stepGeneration } from "../src/lab/sim.ts";
import { formatLap, sectorTimes, towerOrder } from "../src/lab/timing.ts";
import { TEAM_ORDER } from "../src/teams.ts";
import { buildTrack, HALF_WIDTH, labTrack, parsePath, pointsFromFlat, project, unwrapDelta, type Point } from "../src/lab/track.ts";
import { loopLength, mergeSpots, resampleEven, smoothLoop } from "./labGeometry.ts";

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
  for (const circuit of LAB_CIRCUITS) {
    const track = labTrack(circuit);
    const { points, cum, length } = track;
    let seg = 0;
    let lastS = 0;
    let progress = 0;
    let wrapped = false;
    let walked = 0;
    // Walk one full lap in 2 m steps, then a little past the line.
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
  const gripLimit = latAccel(CAR.TOP_SPEED) / CAR.TOP_SPEED;
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
  const circuit = LAB_CIRCUITS[0];
  const track = labTrack(circuit);
  const r = { progress: 0, frames: 0, sectorFrames: [null, null, null] as (number | null)[] };
  let seg = 0;
  let lastS = 0;
  let wrapFrame: number | null = null;
  // Same centreline walk as the progress test, one 2 m step per frame.
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
  // Each third is length/3 metres of 2 m steps.
  for (const time of sectorTimes(r)) {
    assert.ok(time !== null && Math.abs(time - track.length / 3 / 2) <= 1, `sector took ${time}`);
  }
  assert.equal(sectorTimes(r).reduce<number>((sum, x) => sum + (x ?? 0), 0), s3);
});

test("tower order: finishers by lap time, then the rest by distance", () => {
  const cars = [
    { id: "far", lapS: null, maxProgress: 900 },
    { id: "slowLap", lapS: 80.5, maxProgress: 1000 },
    { id: "near", lapS: null, maxProgress: 100 },
    { id: "fastLap", lapS: 80.49, maxProgress: 1000 },
    { id: "far2", lapS: null, maxProgress: 900 },
  ];
  assert.deepEqual(
    towerOrder(cars).map((c) => c.id),
    ["fastLap", "slowLap", "far", "far2", "near"],
  );
});

/** Gaps between consecutive points, including last back to first. */
function gaps(points: Point[]): number[] {
  return points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
}

test("a smoothed, resampled circle is closed, evenly spaced and the right length", () => {
  // 12 corners of a radius-100 circle: a polygon whose kinks the spline must round off.
  const corners = Array.from({ length: 12 }, (_, i) => ({
    x: 100 * Math.cos((i * Math.PI) / 6),
    y: 100 * Math.sin((i * Math.PI) / 6),
  }));
  const points = resampleEven(smoothLoop(corners, 0.5), 3);
  const g = gaps(points);
  const mean = loopLength(points) / points.length;
  // Closed: the last point joins the first at the same spacing as the rest.
  assert.ok(Math.abs(g[g.length - 1] - mean) < 0.01, `closing gap ${g[g.length - 1]} vs ${mean}`);
  assert.ok(Math.max(...g) - Math.min(...g) < 0.01, "evenly spaced");
  assert.ok(Math.abs(mean - 3) < 0.05, `spacing ${mean}`);
  assert.ok(Math.abs(loopLength(points) / (2 * Math.PI * 100) - 1) < 0.001, `length ${loopLength(points)}`);
  // Round, not a 12-gon: every point sits on the circle.
  for (const p of points) assert.ok(Math.abs(Math.hypot(p.x, p.y) - 100) < 0.5, `radius ${Math.hypot(p.x, p.y)}`);
});

test("every lab circuit is evenly spaced", () => {
  assert.equal(LAB_CIRCUITS.length, 24);
  for (const c of LAB_CIRCUITS) {
    const points = pointsFromFlat(c.points);
    // Points are 3 apart along the curve. The straight-line gaps wobble a
    // little: coordinates are stored to 0.1, and a chord across the tightest
    // bends (Albert Park, Madring) is up to 0.2 shorter than the arc.
    for (const gap of gaps(points)) assert.ok(Math.abs(gap - 3) < 0.25, `${c.id}: gap ${gap}`);
  }
});

test("lab circuits keep today's box scale: lap length within 2% of the hero outline's", () => {
  // The hero outline's lap length in box units is what HALF_WIDTH and the car
  // were tuned on; the builder fits the new outline onto it.
  for (const c of LAB_CIRCUITS) {
    const hero = HERO_CIRCUITS.find((h) => h.id === c.id)!;
    const ratio = loopLength(pointsFromFlat(c.points)) / loopLength(parsePath(hero.path));
    assert.ok(Math.abs(ratio - 1) < 0.02, `${c.id}: ${ratio}`);
  }
});

test("the merge check finds parallel legs closer than the road width, but not a tight knot", () => {
  // A long thin loop: two straights 20 apart joined by tight semicircles.
  const loop: Point[] = [];
  for (let x = 0; x <= 200; x += 2) loop.push({ x, y: 0 });
  for (let a = 1; a < 30; a++) loop.push({ x: 200 + 10 * Math.sin((a * Math.PI) / 30), y: 10 - 10 * Math.cos((a * Math.PI) / 30) });
  for (let x = 200; x >= 0; x -= 2) loop.push({ x, y: 20 });
  for (let a = 1; a < 30; a++) loop.push({ x: -10 * Math.sin((a * Math.PI) / 30), y: 10 + 10 * Math.cos((a * Math.PI) / 30) });
  const points = resampleEven(loop, 2);

  const spots = mergeSpots(points, 28);
  assert.equal(spots.length, 1, JSON.stringify(spots));
  assert.ok(Math.abs(spots[0].minGap - 20) < 0.5, `gap ${spots[0].minGap}`);
  // Narrower than the gap: no merge.
  assert.equal(mergeSpots(points, 18).length, 0);
  // A tight knot (a full turn of radius 9, like a hairpin whose legs linger)
  // is a long way round but never a road width from where it started: it is
  // one stretch of road, not two, so it doesn't count.
  const knot: Point[] = [];
  for (let x = -200; x < 0; x += 2) knot.push({ x, y: 0 });
  for (let a = 0; a < 360; a += 10) knot.push({ x: 9 * Math.sin((a * Math.PI) / 180), y: -9 + 9 * Math.cos((a * Math.PI) / 180) });
  for (let x = 0; x <= 200; x += 2) knot.push({ x, y: 0 });
  knot.push({ x: 200, y: 200 }, { x: -200, y: 200 });
  assert.equal(mergeSpots(resampleEven(knot, 2), 28).length, 0);
});

test("a generated circuit loads and runs a generation step", () => {
  const circuit = LAB_CIRCUITS.find((c) => c.id === "hu-1986")!;
  const track = labTrack(circuit);
  const rng = createRng(1);
  const gen = createGeneration(
    track,
    Array.from({ length: 4 }, () => ({ weights: randomWeights(rng), team: null })),
    circuit.lineSpeedMs!,
  );
  for (let i = 0; i < 60; i++) stepGeneration(track, gen);
  for (const r of gen.runners) {
    assert.ok([r.x, r.y, r.speed, r.progress, ...r.inputs].every(Number.isFinite), "finite state");
  }
  const suzuka = LAB_CIRCUITS.find((c) => c.id === "jp-1962")!;
  assert.equal(suzuka.crossings.length, 1, "Suzuka's bridge is marked");
});

test("a lab track is the official lap length in metres, with a 15 m road", () => {
  for (const c of LAB_CIRCUITS) {
    const track = labTrack(c);
    assert.ok(Math.abs(track.length - c.lengthM) < 1e-6, `${c.id}: ${track.length} m vs ${c.lengthM} m`);
    assert.equal(track.halfWidth, 7.5);
  }
});

test("full gas reaches 340 km/h and never passes it", () => {
  const car = { x: 0, y: 0, heading: 0, speed: 0, seg: 0 };
  let top = 0;
  for (let i = 0; i < 60 / CAR.DT; i++) {
    stepCar(car, 1, 0);
    top = Math.max(top, car.speed);
  }
  assert.ok(top <= 340 / 3.6 + 1e-9, `${top * 3.6} km/h`);
  assert.ok(car.speed > 0.999 * (340 / 3.6), `only ${car.speed * 3.6} km/h after a minute`);
});

test("braking from 340 to 100 km/h takes the distance the model says (about 111 m)", () => {
  // Deceleration is B + K·v², so d = ln((B + K·v0²) / (B + K·v1²)) / 2K.
  const [v0, v1] = [340 / 3.6, 100 / 3.6];
  const B = brakeDecel(0);
  const K = (brakeDecel(v0) - B) / v0 ** 2;
  const expected = Math.log((B + K * v0 * v0) / (B + K * v1 * v1)) / (2 * K);
  const car = { x: 0, y: 0, heading: 0, speed: v0, seg: 0 };
  while (car.speed > v1) stepCar(car, -1, 0);
  assert.ok(Math.abs(car.x - expected) / expected < 0.01, `${car.x} m vs ${expected} m`);
  assert.ok(expected > 100 && expected < 125, `${expected} m`);
  // 5 g at top speed, as task 23's car.
  assert.ok(Math.abs(brakeDecel(v0) / 9.81 - 5) < 1e-9);
});

test("flying start: every car starts on the line, pointing along the track, at the pole lap's speed", () => {
  const circuit = LAB_CIRCUITS.find((c) => c.id === "hu-1986")!;
  const track = labTrack(circuit);
  const rng = createRng(3);
  const gen = createGeneration(
    track,
    Array.from({ length: 3 }, () => ({ weights: randomWeights(rng), team: null })),
    circuit.lineSpeedMs!,
  );
  const start = spawnCar(track, 0);
  for (const r of gen.runners) {
    assert.equal(r.speed, circuit.lineSpeedMs);
    assert.deepEqual([r.x, r.y, r.heading, r.progress], [start.x, start.y, start.heading, 0]);
  }
  // One step later every car has covered about speed × DT of track.
  stepGeneration(track, gen);
  for (const r of gen.runners) {
    assert.ok(Math.abs(r.progress - circuit.lineSpeedMs! * CAR.DT) < 0.2, `moved ${r.progress} m`);
  }
});

test("GRIP_SCALE is the one that puts Hungaroring's centreline lap on pole", () => {
  // Curvature over a chord is exact on a circle: radius 50 m -> 0.02 per m.
  const circle = buildTrack(
    Array.from({ length: 400 }, (_, i) => ({ x: 50 * Math.cos((i * Math.PI) / 200), y: 50 * Math.sin((i * Math.PI) / 200) })),
    HALF_WIDTH,
  );
  for (const k of curvatures(circle)) assert.ok(Math.abs(k - 0.02) < 1e-4, `curvature ${k}`);

  const hu = LAB_CIRCUITS.find((c) => c.id === "hu-1986")!;
  const track = labTrack(hu);
  const grip = gripFor(track, hu.poleS!, hu.lineSpeedMs);
  assert.ok(Math.abs(grip - CAR.GRIP_SCALE) < 0.001, `recalibrate: GRIP_SCALE should be ${grip.toFixed(3)}`);
  const lap = referenceLap(track, hu.lineSpeedMs).seconds;
  assert.ok(Math.abs(lap - hu.poleS!) < 0.05, `centreline lap ${lap} s vs pole ${hu.poleS} s`);
});

test("pole data: time, driver and line speed come together, and Hungaroring is Norris's 1:17.207", () => {
  const withPole = LAB_CIRCUITS.filter((c) => c.poleS !== null);
  assert.ok(withPole.length >= 16, `${withPole.length} circuits with a pole`);
  for (const c of LAB_CIRCUITS) {
    if (c.poleS === null) {
      assert.deepEqual([c.poleDriver, c.lineSpeedMs], [null, null], c.id);
    } else {
      assert.match(c.poleDriver ?? "", /^[A-Z]{3}$/, c.id);
      assert.ok(c.poleS > 55 && c.poleS < 120, `${c.id}: ${c.poleS} s`);
      assert.ok(c.lineSpeedMs !== null && c.lineSpeedMs > 30 && c.lineSpeedMs <= 340 / 3.6, `${c.id}: ${c.lineSpeedMs} m/s`);
    }
  }
  const hu = LAB_CIRCUITS.find((c) => c.id === "hu-1986")!;
  assert.deepEqual([hu.poleS, hu.poleDriver], [77.207, "NOR"]);
  assert.equal(formatLap(hu.poleS!), "1:17.207");
  assert.equal(formatLap(59.9996), "1:00.000");
});
