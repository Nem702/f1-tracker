// Seedable random numbers, so a test (or a bug report) can replay a run.
// mulberry32: tiny, fast, and good enough for picking parents and noise.

export type Rng = () => number;

/** Returns a function giving floats in [0, 1), fully determined by `seed`. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (mean 0, sd 1) via Box-Muller. */
export function gaussian(rng: Rng): number {
  const u = 1 - rng(); // (0, 1], so the log is finite
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
