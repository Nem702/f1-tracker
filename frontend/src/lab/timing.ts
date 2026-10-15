// The timing tower's numbers: sector times, running order and sector colours.
// Pure and DOM-free so scripts/lab.test.ts can run it in Node.
//
// Sectors are the lap split into three equal lengths of track, not real
// sector lines. Times are kept in sim steps (frames) so ties are exact.

import { lapSeconds, type Runner } from "./sim.ts";

export type SectorBests = (number | null)[];
export type SectorColour = "purple" | "green" | "yellow";

/** Each sector's time in frames, null until the car has completed it. */
export function sectorTimes(r: Pick<Runner, "sectorFrames">): (number | null)[] {
  return r.sectorFrames.map((end, i) => {
    if (end === null) return null;
    const start = i === 0 ? 0 : r.sectorFrames[i - 1];
    return start === null ? null : end - start;
  });
}

/** Fastest time per sector across `runners`. */
export function bestSectors(runners: Pick<Runner, "sectorFrames">[]): SectorBests {
  let best: SectorBests = [null, null, null];
  for (const r of runners) best = foldBest(best, sectorTimes(r));
  return best;
}

/** Element-wise fastest of two sets of sector times. */
export function foldBest(a: SectorBests, b: SectorBests): SectorBests {
  return a.map((x, i) => {
    const y = b[i];
    if (x === null) return y;
    if (y === null) return x;
    return Math.min(x, y);
  });
}

/** Purple: fastest this run. Green: fastest this generation but not purple.
 *  Yellow: the rest. `runBest` must already include this generation. */
export function sectorColour(frames: number, genBest: number | null, runBest: number | null): SectorColour {
  if (frames === runBest) return "purple";
  if (frames === genBest) return "green";
  return "yellow";
}

/** Finished cars by lap time, then everyone else by how far they got.
 *  Stable, so equal cars keep seat order. */
export function towerOrder<R extends Pick<Runner, "lapFrames" | "maxProgress">>(runners: R[]): R[] {
  return [...runners].sort((a, b) => {
    if (a.lapFrames !== null && b.lapFrames !== null) return a.lapFrames - b.lapFrames;
    if (a.lapFrames !== null) return -1;
    if (b.lapFrames !== null) return 1;
    return b.maxProgress - a.maxProgress;
  });
}

/** Last column: lap time, share of the lap while running, or why it stopped.
 *  Turning back counts as STALL: the car stopped making progress. */
export function statusLabel(r: Pick<Runner, "lapFrames" | "stop" | "progress">, length: number): string {
  if (r.lapFrames !== null) return lapSeconds(r.lapFrames).toFixed(2);
  switch (r.stop) {
    case "off":
      return "OUT";
    case "back":
    case "stall":
      return "STALL";
    case "time":
      return "TIME";
    default:
      return `${Math.max(0, Math.floor((r.progress / length) * 100))}%`;
  }
}
