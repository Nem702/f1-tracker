// Geometry for the AI Lab's circuit builder (build-lab-circuits.ts) and its
// tests: smooth a closed outline, resample it evenly, line two outlines up,
// and find the places where the road would merge with itself.
//
// Every outline here is closed implicitly: the last point joins back to the
// first, and no point is repeated.

import { buildTrack, project, type Point } from "../src/lab/track.ts";

/** Length of a closed outline. */
export function loopLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** [lon, lat] to local metres, x east and y south (screen down), using an
 *  equirectangular projection around the outline's centre. Over a few km the
 *  error is far below a metre. */
export function lonLatToMetres(coords: [number, number][]): Point[] {
  const R = 6_371_008.8;
  const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  return coords.map(([lon, lat]) => ({
    x: (((lon - lon0) * Math.PI) / 180) * R * k,
    y: (-(lat - lat0) * Math.PI * R) / 180,
  }));
}

/** A closed centripetal Catmull-Rom spline through every point, as a dense
 *  polyline (about `step` apart). Centripetal parameterisation never
 *  overshoots into loops or cusps, so a sharp corner becomes a tight arc
 *  rather than a kink or a knot. */
export function smoothLoop(points: Point[], step: number): Point[] {
  const n = points.length;
  const out: Point[] = [];
  const lerp = (p: Point, q: Point, ta: number, tb: number, t: number): Point => {
    const f = tb === ta ? 0 : (t - ta) / (tb - ta);
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
  };
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const t0 = 0;
    const t1 = t0 + Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y));
    const t2 = t1 + Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y));
    const t3 = t2 + Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y));
    const count = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
    for (let k = 0; k < count; k++) {
      const t = t1 + ((t2 - t1) * k) / count;
      const a1 = lerp(p0, p1, t0, t1, t);
      const a2 = lerp(p1, p2, t1, t2, t);
      const a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, t0, t2, t);
      const b2 = lerp(a2, a3, t1, t3, t);
      out.push(lerp(b1, b2, t1, t2, t));
    }
  }
  return out;
}

/** `count` points evenly spaced along a closed outline, the first at lap
 *  distance `offset`. */
export function resampleCount(points: Point[], count: number, offset = 0): Point[] {
  const track = buildTrack(points, 0);
  const { cum, length } = track;
  const out: Point[] = [];
  let seg = 0;
  const start = ((offset % length) + length) % length;
  for (let k = 0; k < count; k++) {
    let s = start + (length * k) / count;
    if (s >= length) s -= length;
    if (s < cum[seg]) seg = 0;
    while (cum[seg + 1] < s) seg++;
    const a = points[seg];
    const b = points[(seg + 1) % points.length];
    const segLen = cum[seg + 1] - cum[seg];
    const f = segLen === 0 ? 0 : (s - cum[seg]) / segLen;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

/** Evenly spaced points about `spacing` apart. The spacing is nudged so the
 *  lap divides exactly, which makes the closing segment the same length as
 *  the rest. */
export function resampleEven(points: Point[], spacing: number, offset = 0): Point[] {
  return resampleCount(points, Math.max(3, Math.round(loopLength(points) / spacing)), offset);
}

/** A similarity transform: optional mirror (y → -y), then rotate and scale
 *  by (c, s), then shift. */
export interface Similarity {
  c: number;
  s: number;
  tx: number;
  ty: number;
  mirror: boolean;
}

export function applySimilarity(t: Similarity, p: Point): Point {
  const y = t.mirror ? -p.y : p.y;
  return { x: t.c * p.x - t.s * y + t.tx, y: t.s * p.x + t.c * y + t.ty };
}

export const scaleOf = (t: Similarity): number => Math.hypot(t.c, t.s);

/** Least-squares similarity taking src[i] onto dst[i]. */
export function fitSimilarity(src: Point[], dst: Point[], mirror: boolean): Similarity {
  const n = src.length;
  const a = src.map((p) => ({ x: p.x, y: mirror ? -p.y : p.y }));
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (let i = 0; i < n; i++) {
    ax += a[i].x; ay += a[i].y; bx += dst[i].x; by += dst[i].y;
  }
  ax /= n; ay /= n; bx /= n; by /= n;
  let dot = 0, cross = 0, norm = 0;
  for (let i = 0; i < n; i++) {
    const px = a[i].x - ax, py = a[i].y - ay;
    const qx = dst[i].x - bx, qy = dst[i].y - by;
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
    norm += px * px + py * py;
  }
  const c = dot / norm;
  const s = cross / norm;
  return { c, s, tx: bx - (c * ax - s * ay), ty: by - (s * ax + c * ay), mirror };
}

function rms(t: Similarity, src: Point[], dst: Point[]): number {
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    const p = applySimilarity(t, src[i]);
    sum += (p.x - dst[i].x) ** 2 + (p.y - dst[i].y) ** 2;
  }
  return Math.sqrt(sum / src.length);
}

/** Lines `src` (a closed outline, or a lap path) up with the closed outline
 *  `dst` without knowing where either starts or which way it runs: both are
 *  resampled to `n` even points, every cyclic shift and both directions are
 *  tried (and a mirror, if allowed), then nearest-point passes (ICP) refine
 *  the best one against the real `src` points. */
export function alignLoops(src: Point[], dst: Point[], allowMirror: boolean, n = 256): Similarity {
  const a = resampleCount(src, n);
  const b = resampleCount(dst, n);
  let best: { t: Similarity; err: number } | null = null;
  for (const mirror of allowMirror ? [false, true] : [false]) {
    for (const dir of [1, -1]) {
      for (let shift = 0; shift < n; shift++) {
        const pairs = a.map((_, i) => a[(((shift + dir * i) % n) + n) % n]);
        const t = fitSimilarity(pairs, b, mirror);
        const err = rms(t, pairs, b);
        if (!best || err < best.err) best = { t, err };
      }
    }
  }
  let t = best!.t;
  const target = buildTrack(dst, 0);
  for (let pass = 0; pass < 8; pass++) {
    const nearest = src.map((p) => pointAt(target, project(target, applySimilarity(t, p)).s));
    t = fitSimilarity(src, nearest, t.mirror);
  }
  return t;
}

/** The point at lap distance `s` on a built track. */
export function pointAt(track: ReturnType<typeof buildTrack>, s: number): Point {
  const { points, cum } = track;
  let seg = 0;
  while (seg < points.length - 1 && cum[seg + 1] < s) seg++;
  const a = points[seg];
  const b = points[(seg + 1) % points.length];
  const f = (s - cum[seg]) / (cum[seg + 1] - cum[seg]);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Where two non-neighbouring stretches of an evenly spaced outline run closer
 *  than `roadWidth`, so their roads would merge. A pair of points counts when
 *  they are that close and the track between them (the shorter way round)
 *  goes more than `roadWidth` away from both before coming back; a hairpin's
 *  two legs near the apex therefore don't count, but long parallel legs and
 *  crossings do. Close pairs that touch are grouped into one spot. */
export interface MergeSpot {
  /** Index ranges of the two stretches, first < second in lap order. */
  a: [number, number];
  b: [number, number];
  minGap: number;
}

export function mergeSpots(points: Point[], roadWidth: number): MergeSpot[] {
  const n = points.length;
  const d = (i: number, j: number) => Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
  const spacing = loopLength(points) / n;
  const hits: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const gap = d(i, j);
      if (gap >= roadWidth) continue;
      // Walk the shorter way round from i to j.
      const fwd = j - i;
      const [from, steps] = fwd <= n - fwd ? [i, fwd] : [j, n - fwd];
      if (steps * spacing <= 2 * roadWidth) continue;
      let away = false;
      for (let k = 1; k < steps && !away; k++) {
        const m = (from + k) % n;
        away = Math.min(d(m, i), d(m, j)) > roadWidth;
      }
      if (away) hits.push([i, j, gap]);
    }
  }

  // Group hits whose indices are within 2 of each other on both stretches.
  const near = (x: number, y: number) => Math.min(Math.abs(x - y), n - Math.abs(x - y)) <= 2;
  const group = hits.map((_, k) => k);
  const root = (k: number): number => (group[k] === k ? k : (group[k] = root(group[k])));
  for (let p = 0; p < hits.length; p++) {
    for (let q = p + 1; q < hits.length; q++) {
      if (near(hits[p][0], hits[q][0]) && near(hits[p][1], hits[q][1])) group[root(p)] = root(q);
    }
  }
  const spots = new Map<number, [number, number, number][]>();
  hits.forEach((h, k) => spots.set(root(k), [...(spots.get(root(k)) ?? []), h]));
  return [...spots.values()]
    .map((hs) => ({
      a: cyclicRange(hs.map((h) => h[0]), n),
      b: cyclicRange(hs.map((h) => h[1]), n),
      minGap: Math.min(...hs.map((h) => h[2])),
    }))
    .sort((x, y) => x.a[0] - y.a[0]);
}

/** Smallest [start, end] index range covering `idx` on a loop of n (end may
 *  be past n when the range wraps the start/finish line). */
function cyclicRange(idx: number[], n: number): [number, number] {
  const sorted = [...new Set(idx)].sort((x, y) => x - y);
  let gapAt = sorted.length - 1;
  let gap = sorted[0] + n - sorted[sorted.length - 1];
  for (let k = 0; k + 1 < sorted.length; k++) {
    if (sorted[k + 1] - sorted[k] > gap) {
      gap = sorted[k + 1] - sorted[k];
      gapAt = k;
    }
  }
  const start = sorted[(gapAt + 1) % sorted.length];
  const end = sorted[gapAt];
  return [start, end >= start ? end : end + n];
}

/** Places where the outline crosses itself (a bridge, like Suzuka's): the
 *  point and the lap distance of each pass, first pass first. */
export interface Crossing {
  x: number;
  y: number;
  s1: number;
  s2: number;
}

export function findCrossings(points: Point[]): Crossing[] {
  const track = buildTrack(points, 0);
  const n = points.length;
  const out: Crossing[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // neighbours across the wrap
      const c = points[j];
      const e = points[(j + 1) % n];
      const den = (b.x - a.x) * (e.y - c.y) - (b.y - a.y) * (e.x - c.x);
      if (den === 0) continue;
      const u = ((c.x - a.x) * (e.y - c.y) - (c.y - a.y) * (e.x - c.x)) / den;
      const v = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      out.push({
        x: a.x + u * (b.x - a.x),
        y: a.y + u * (b.y - a.y),
        s1: track.cum[i] + u * (track.cum[i + 1] - track.cum[i]),
        s2: track.cum[j] + v * (track.cum[j + 1] - track.cum[j]),
      });
    }
  }
  return out;
}
