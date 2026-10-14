// One generation on track: every car drives itself until it finishes a lap,
// crashes, stalls, turns back, or runs out of time. Then each gets a score.

import { think } from "./brain.ts";
import { CAR, senseInputs, spawnCar, stepCar, type CarState } from "./car.ts";
import { isOffTrack, project, unwrapDelta, type Point, type Track } from "./track.ts";

export const SIM = {
  /** Give up on a car after this many steps (90 sim seconds). */
  FRAME_CAP: 90 * 60,
  /** Stalled: less than STALL_GAIN of new progress in STALL_FRAMES steps. */
  STALL_FRAMES: 120,
  STALL_GAIN: 15,
  /** Turned back: this far behind its own furthest point. */
  BACKWARDS: 25,
  /** Minimum gap between recorded braking points, so the dots stay sparse. */
  BRAKE_DOT_SPACING: 8,
} as const;

export interface Runner extends CarState {
  weights: number[];
  inputs: number[];
  gas: number;
  steer: number;
  /** Last lap position (0..length) and the running total, which keeps
   *  counting past the start/finish line. */
  lastS: number;
  progress: number;
  maxProgress: number;
  gainMark: number;
  gainFrame: number;
  frames: number;
  done: boolean;
  /** Steps taken to complete the lap, or null if it never did. */
  lapFrames: number | null;
  /** Where this car braked, for drawing. */
  brakes: Point[];
}

export interface Generation {
  runners: Runner[];
  done: boolean;
}

export function createGeneration(track: Track, population: number[][]): Generation {
  const runners = population.map((weights): Runner => {
    const car = spawnCar(track);
    return {
      ...car,
      weights,
      inputs: senseInputs(track, car),
      gas: 0,
      steer: 0,
      lastS: 0,
      progress: 0,
      maxProgress: 0,
      gainMark: 0,
      gainFrame: 0,
      frames: 0,
      done: false,
      lapFrames: null,
      brakes: [],
    };
  });
  return { runners, done: runners.length === 0 };
}

/** Advances every running car by one sim step. */
export function stepGeneration(track: Track, gen: Generation): void {
  let running = false;
  for (const r of gen.runners) {
    if (r.done) continue;
    stepRunner(track, r);
    if (!r.done) running = true;
  }
  gen.done = !running;
}

function stepRunner(track: Track, r: Runner): void {
  // r.inputs were sensed at the end of the last step (or at spawn), so they
  // describe where the car is now.
  [r.gas, r.steer] = think(r.weights, r.inputs);
  stepCar(r, r.gas, r.steer);
  r.frames++;

  if (r.gas < 0) {
    const last = r.brakes[r.brakes.length - 1];
    if (!last || Math.hypot(r.x - last.x, r.y - last.y) >= SIM.BRAKE_DOT_SPACING) {
      r.brakes.push({ x: r.x, y: r.y });
    }
  }

  const proj = project(track, r, r.seg);
  r.seg = proj.seg;
  if (isOffTrack(track, proj)) {
    r.done = true;
    return;
  }

  r.progress += unwrapDelta(r.lastS, proj.s, track.length);
  r.lastS = proj.s;
  r.maxProgress = Math.max(r.maxProgress, r.progress);

  if (r.progress >= track.length) {
    r.lapFrames = r.frames;
    r.done = true;
    return;
  }
  if (r.progress > r.gainMark + SIM.STALL_GAIN) {
    r.gainMark = r.progress;
    r.gainFrame = r.frames;
  }
  if (
    r.progress < r.maxProgress - SIM.BACKWARDS ||
    r.frames - r.gainFrame > SIM.STALL_FRAMES ||
    r.frames >= SIM.FRAME_CAP
  ) {
    r.done = true;
    return;
  }
  r.inputs = senseInputs(track, r);
}

/** Any lap beats any non-lap, and a faster lap beats a slower one (1..2);
 *  without a lap, the share of the lap covered (0..1). */
export function fitness(r: Runner, length: number): number {
  if (r.lapFrames !== null) return 2 - r.lapFrames / SIM.FRAME_CAP;
  return Math.min(0.999999, Math.max(0, r.maxProgress / length));
}

/** Best first. */
export function rankByFitness(gen: Generation, length: number): Runner[] {
  return [...gen.runners].sort((a, b) => fitness(b, length) - fitness(a, length));
}

/** The car to follow on screen: the furthest-along car still running, or
 *  the best finisher once everyone has stopped. */
export function leaderOf(gen: Generation, length: number): Runner | null {
  let leader: Runner | null = null;
  for (const r of gen.runners) {
    if (!r.done && (!leader || r.progress > leader.progress)) leader = r;
  }
  return leader ?? rankByFitness(gen, length)[0] ?? null;
}

export function lapSeconds(frames: number): number {
  return frames * CAR.DT;
}
