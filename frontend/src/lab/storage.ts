// The best brain per circuit, kept in this browser's localStorage.
// Storage can be blocked or full (private windows, strict settings) and the
// stored text can be anything, so every call is guarded and every value is
// checked before use. The lab works the same without it, minus replays.

import { WEIGHT_COUNT } from "./brain.ts";

export interface SavedBrain {
  weights: number[];
  /** Comparable within one circuit; a new brain is saved only if higher. */
  fitness: number;
  /** Lap time in sim seconds, or null if it never finished a lap. */
  lapS: number | null;
}

// Bump the version if the physics, the brain shape or the circuits change, so
// old brains (tuned for different rules or roads) are ignored rather than
// replayed. 2: smooth outlines from circuits.ts.
const VERSION = 2;
const key = (circuitId: string) => `f1-lab:best:${circuitId}`;

export function loadBest(circuitId: string): SavedBrain | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key(circuitId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    const { v, weights, fitness, lapS } = data as Record<string, unknown>;
    if (v !== VERSION) return null;
    if (!Array.isArray(weights) || weights.length !== WEIGHT_COUNT) return null;
    if (!weights.every((w) => typeof w === "number" && Number.isFinite(w))) return null;
    if (typeof fitness !== "number" || !Number.isFinite(fitness)) return null;
    if (lapS !== null && (typeof lapS !== "number" || !Number.isFinite(lapS))) return null;
    return { weights, fitness, lapS };
  } catch {
    return null;
  }
}

/** Returns false if storage refused the write. */
export function saveBest(circuitId: string, brain: SavedBrain): boolean {
  try {
    localStorage.setItem(key(circuitId), JSON.stringify({ v: VERSION, ...brain }));
    return true;
  } catch {
    return false;
  }
}
