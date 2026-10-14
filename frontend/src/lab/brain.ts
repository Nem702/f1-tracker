// The driver: a feed-forward net, 7 inputs -> 8 hidden (tanh) -> 2 outputs
// (tanh), so both outputs are always in -1..1. The weights are one flat array
// so evolution can treat a brain as a plain list of numbers.
//
// Layout: [hidden weights 8x7][hidden biases 8][output weights 2x8][output biases 2]

import type { Rng } from "./rng.ts";

export const INPUTS = 7;
export const HIDDEN = 8;
export const OUTPUTS = 2;
export const WEIGHT_COUNT = HIDDEN * INPUTS + HIDDEN + OUTPUTS * HIDDEN + OUTPUTS;

/** Returns [gas/brake, steer], each in -1..1. */
export function think(weights: number[], inputs: number[]): [number, number] {
  const hidden = new Array<number>(HIDDEN);
  let w = 0;
  for (let h = 0; h < HIDDEN; h++) {
    let sum = 0;
    for (let i = 0; i < INPUTS; i++) sum += weights[w++] * inputs[i];
    hidden[h] = sum;
  }
  for (let h = 0; h < HIDDEN; h++) hidden[h] = Math.tanh(hidden[h] + weights[w++]);

  const out = [0, 0];
  for (let o = 0; o < OUTPUTS; o++) {
    let sum = 0;
    for (let h = 0; h < HIDDEN; h++) sum += weights[w++] * hidden[h];
    out[o] = sum;
  }
  return [Math.tanh(out[0] + weights[w++]), Math.tanh(out[1] + weights[w++])];
}

/** A fresh brain with every weight uniform in -1..1. */
export function randomWeights(rng: Rng): number[] {
  return Array.from({ length: WEIGHT_COUNT }, () => rng() * 2 - 1);
}
