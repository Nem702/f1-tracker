// One generation on track: every car drives itself until it finishes a lap,
// crashes, stalls, turns back, or runs out of time. Then each gets a score.

import type { TeamSlug } from "../teams.ts";
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

/** Why a car stopped: finished the lap, left the track, turned back, made no
 *  progress, or hit the time cap. */
export type StopReason = "lap" | "off" | "back" | "stall" | "time";

export interface Runner extends CarState {
  weights: number[];
  /** Null for the replayed saved brain (storage v1 has no team). */
  team: TeamSlug | null;
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
  /** Step on which progress first reached 1/3, 2/3 and a full lap: the ends
   *  of three equal-length sectors. */
  sectorFrames: (number | null)[];
  stop: StopReason | null;
  /** Where this car braked, for drawing. */
  brakes: Point[];
}

export interface Generation {
  runners: Runner[];
  done: boolean;
}

export function createGeneration(
  track: Track,
  seats: { weights: number[]; team: TeamSlug | null }[],
): Generation {
  const runners = seats.map(({ weights, team }): Runner => {
    const car = spawnCar(track);
    return {
      ...car,
      weights,
      team,
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
      sectorFrames: [null, null, null],
      stop: null,
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
    stopRunner(r, "off");
    return;
  }

  r.progress += unwrapDelta(r.lastS, proj.s, track.length);
  r.lastS = proj.s;
  r.maxProgress = Math.max(r.maxProgress, r.progress);
  recordSectors(r, track.length);

  if (r.progress >= track.length) {
    r.lapFrames = r.frames;
    stopRunner(r, "lap");
    return;
  }
  if (r.progress > r.gainMark + SIM.STALL_GAIN) {
    r.gainMark = r.progress;
    r.gainFrame = r.frames;
  }
  if (r.progress < r.maxProgress - SIM.BACKWARDS) {
    stopRunner(r, "back");
    return;
  }
  if (r.frames - r.gainFrame > SIM.STALL_FRAMES) {
    stopRunner(r, "stall");
    return;
  }
  if (r.frames >= SIM.FRAME_CAP) {
    stopRunner(r, "time");
    return;
  }
  r.inputs = senseInputs(track, r);
}

function stopRunner(r: Runner, reason: StopReason): void {
  r.done = true;
  r.stop = reason;
}

/** Marks the step on which `progress` (which keeps counting past the
 *  start/finish line) first reaches each sector end. A car that dips back
 *  over a boundary keeps its first crossing. */
export function recordSectors(
  r: Pick<Runner, "progress" | "frames" | "sectorFrames">,
  length: number,
): void {
  const n = r.sectorFrames.length;
  for (let i = 0; i < n; i++) {
    // The last end is exactly `length`, so S3 closes on the lap's own step.
    const end = i === n - 1 ? length : (length * (i + 1)) / n;
    if (r.sectorFrames[i] === null && r.progress >= end) r.sectorFrames[i] = r.frames;
  }
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
