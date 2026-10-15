// Natural selection. The best few brains go through untouched; the rest of
// the next generation are children of the top few, mixed and mutated.
// Every car carries a team, inherited along with its weights, so the grid
// shows which "family" is taking over.

import { TEAM_ORDER, type TeamSlug } from "../teams.ts";
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

/** One car's brain and the team it races for. */
export interface Seat {
  weights: number[];
  team: TeamSlug;
}

/** Generation 1: the real grid, two cars per team in TEAM_ORDER. */
export function gridTeam(seat: number): TeamSlug {
  return TEAM_ORDER[Math.floor(seat / 2)];
}

/** `ranked` is this generation's seats, best first. Elites keep their team;
 *  a child races for the parent it copied more weights from (a on a tie).
 *  Mutation never changes the team. */
export function nextGeneration(ranked: Seat[], rng: Rng, mutationRate: number): Seat[] {
  const next = ranked.slice(0, EVO.ELITES).map((s) => ({ weights: [...s.weights], team: s.team }));
  const pool = ranked.slice(0, EVO.PARENTS);
  while (next.length < EVO.POPULATION) {
    const a = pool[Math.floor(rng() * pool.length)];
    const b = pool[Math.floor(rng() * pool.length)];
    let fromA = 0;
    const weights = a.weights.map((wa, i) => {
      const takeA = rng() < 0.5;
      if (takeA) fromA++;
      let w = takeA ? wa : b.weights[i];
      if (rng() < mutationRate) w += gaussian(rng) * EVO.SIGMA;
      return Math.max(-EVO.WEIGHT_CLAMP, Math.min(EVO.WEIGHT_CLAMP, w));
    });
    next.push({ weights, team: fromA * 2 >= weights.length ? a.team : b.team });
  }
  return next;
}
