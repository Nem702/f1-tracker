// Natural selection. The best few brains go through untouched; the rest of
// the next generation are children of the top few, mixed and mutated.

import { gaussian, type Rng } from "./rng.ts";

export const EVO = {
  POPULATION: 22,
  /** Copied unchanged, so the best lap so far is never lost. */
  ELITES: 3,
  /** Pool that parents are drawn from. */
  PARENTS: 8,
  /** Size of a mutation: standard deviation of the Gaussian nudge. */
  SIGMA: 0.5,
  /** Weights are kept within +-WEIGHT_CLAMP. */
  WEIGHT_CLAMP: 4,
  /** Default chance that any one weight mutates. */
  MUTATION_RATE: 0.2,
} as const;

/** `ranked` is this generation's brains, best first. */
export function nextGeneration(ranked: number[][], rng: Rng, mutationRate: number): number[][] {
  const next = ranked.slice(0, EVO.ELITES).map((w) => [...w]);
  const pool = ranked.slice(0, EVO.PARENTS);
  while (next.length < EVO.POPULATION) {
    const a = pool[Math.floor(rng() * pool.length)];
    const b = pool[Math.floor(rng() * pool.length)];
    next.push(
      a.map((wa, i) => {
        let w = rng() < 0.5 ? wa : b[i];
        if (rng() < mutationRate) w += gaussian(rng) * EVO.SIGMA;
        return Math.max(-EVO.WEIGHT_CLAMP, Math.min(EVO.WEIGHT_CLAMP, w));
      }),
    );
  }
  return next;
}
