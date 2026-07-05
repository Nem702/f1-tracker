import type { Lap } from "../api/types";

/** One row per lap both paired drivers completed with a recorded time.
 *  `delta = b_duration - a_duration`, so positive = driver A was faster
 *  that lap (B's lap took longer). For the Ferrari duo (A = Leclerc,
 *  B = Hamilton) this is numerically identical to the retired /api/delta
 *  endpoint's `hamilton_duration - leclerc_duration`. */
export interface PairDelta {
  lap_number: number;
  a_duration: number;
  b_duration: number;
  delta: number;
}

/**
 * Client-side replacement for the old /api/delta join — the endpoint only
 * ever joined-and-subtracted rows the frontend already has in `laps`, so a
 * pair switch needs no refetch.
 *
 * A pit cycle puts ±20s on the in-lap and out-lap and buries the actual
 * pace story (±1s), so those laps are excluded here (moved from DeltaChart).
 * A pit-out flag marks the out-lap; the lap before it is the in-lap. Only
 * the PAIR's pit laps count — `laps` carries every tracked driver since the
 * four-team expansion, and a rival's stop says nothing about this pair's
 * pace. The raw times stay reachable in the lap-times chart and its table.
 */
export function deriveDelta(
  laps: Lap[],
  aNumber: number | null,
  bNumber: number | null,
): PairDelta[] {
  if (aNumber === null || bNumber === null) return [];

  const excluded = new Set<number>();
  const byLap = new Map<number, { a?: number; b?: number }>();
  for (const lap of laps) {
    const isA = lap.driver_number === aNumber;
    const isB = lap.driver_number === bNumber;
    if (!isA && !isB) continue;
    if (lap.is_pit_out_lap) {
      excluded.add(lap.lap_number);
      excluded.add(lap.lap_number - 1);
    }
    if (lap.lap_duration === null) continue;
    const row = byLap.get(lap.lap_number) ?? {};
    if (isA) row.a = lap.lap_duration;
    else row.b = lap.lap_duration;
    byLap.set(lap.lap_number, row);
  }

  const rows: PairDelta[] = [];
  for (const [lapNumber, { a, b }] of byLap) {
    if (a === undefined || b === undefined) continue;
    if (excluded.has(lapNumber)) continue;
    rows.push({
      lap_number: lapNumber,
      a_duration: a,
      b_duration: b,
      delta: b - a,
    });
  }
  return rows.sort((x, y) => x.lap_number - y.lap_number);
}
