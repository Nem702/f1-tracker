// The reference lap: the car driven along the centreline at its grip limit,
// with no brain. It is the yardstick, not something the cars follow:
//   - GRIP_SCALE is calibrated so Hungaroring's reference lap equals pole,
//   - circuits with no pole lap start at the reference speed at the line.
//
// Quasi-steady: each point gets the fastest speed its curvature allows, then
// a forward pass caps it by how hard the car can accelerate and a backward
// pass by how hard it can brake (task 23's method). DOM-free for the tests.

import { brakeDecel, CAR, driveAccel } from "./car.ts";
import { HALF_WIDTH, type Point, type Track } from "./track.ts";

/** Curvature is measured over a chord this far either side of each point, in
 *  metres: one half-width, so the span is about the road's width. A car on a
 *  15 m road can't feel bends finer than that. Set by distance, not point
 *  count, so it doesn't move if the outline spacing changes. */
export const CURVATURE_HALF_SPAN = HALF_WIDTH;

export interface ReferenceLap {
  seconds: number;
  /** Speed at each centreline point, m/s; speeds[points.length] is the
   *  finish (the line again). */
  speeds: number[];
}

function pointAtS(track: Track, s: number): Point {
  const { points, cum, length } = track;
  const at = ((s % length) + length) % length;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  const a = points[lo];
  const b = points[(lo + 1) % points.length];
  const t = (at - cum[lo]) / (cum[lo + 1] - cum[lo]);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Curvature (1/m) at each centreline point: the turn between the chord in
 *  and the chord out, each `halfSpan` long, divided by `halfSpan`. Exact on
 *  a circle. */
export function curvatures(track: Track, halfSpan = CURVATURE_HALF_SPAN): number[] {
  return track.points.map((p, i) => {
    const a = pointAtS(track, track.cum[i] - halfSpan);
    const b = pointAtS(track, track.cum[i] + halfSpan);
    let turn = Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x);
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    return Math.abs(turn) / halfSpan;
  });
}

/** `v0`: speed at the line (a flying lap that ends wherever the car is free
 *  to be). Null: a rolling lap, where the speed at the line is whatever the
 *  previous lap left it. */
export function referenceLap(
  track: Track,
  v0: number | null,
  gripScale: number = CAR.GRIP_SCALE,
  kappa: number[] = curvatures(track),
): ReferenceLap {
  const n = track.points.length;
  const step = (i: number) => track.cum[i + 1] - track.cum[i];

  // Corner limit: v^2 * kappa = grip * (LAT + LAT_AERO * v^2), and the
  // steering ceiling. Node n is the line again.
  const limit = Array.from({ length: n + 1 }, (_, i) => {
    const k = kappa[i % n];
    const room = k - gripScale * CAR.LAT_AERO;
    let v = room <= 0 ? CAR.TOP_SPEED : Math.sqrt((gripScale * CAR.LAT) / room);
    if (k > 0) v = Math.min(v, CAR.MAX_STEER / k);
    return Math.min(v, CAR.TOP_SPEED);
  });

  const v = [...limit];
  const passes = v0 === null ? 2 : 1;
  for (let pass = 0; pass < passes; pass++) {
    v[0] = v0 === null ? (pass === 0 ? limit[0] : v[n]) : Math.min(limit[0], v0);
    for (let i = 1; i <= n; i++) {
      v[i] = Math.min(limit[i], Math.sqrt(Math.max(0, v[i - 1] ** 2 + 2 * driveAccel(v[i - 1]) * step(i - 1))));
    }
  }
  for (let pass = 0; pass < passes; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * brakeDecel(v[i + 1]) * step(i)));
    }
    if (v0 === null) v[n] = v[0];
  }

  let seconds = 0;
  for (let i = 0; i < n; i++) seconds += (2 * step(i)) / (v[i] + v[i + 1]);
  return { seconds, speeds: v };
}

/** The GRIP_SCALE whose reference lap from `v0` takes `targetS` seconds. */
export function gripFor(track: Track, targetS: number, v0: number | null): number {
  const kappa = curvatures(track);
  let lo = 0.05;
  let hi = 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (referenceLap(track, v0, mid, kappa).seconds > targetS) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
