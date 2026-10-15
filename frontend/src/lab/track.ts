// A circuit as the cars see it: the centreline polyline from circuits.ts
// (0-1000 box, evenly spaced, start/finish at the first point, already in
// race direction), walls at a half-width either side, and "how far round the
// lap is this point".
//
// The walls are not stored as two offset polylines. On tight corners and
// close-running sections (Jeddah, Austin, Baku) an offset polyline folds
// back into the track, so a sensor would hit a wall the car can legally drive
// through. Instead the track is everything within HALF_WIDTH of the
// centreline, and the walls are its edge: exactly what isOffTrack tests, what
// the sensors measure to, and what render.ts draws.
//
// Everything here is in box units. Real metres are out of scope for v1.

export interface Point {
  x: number;
  y: number;
}

export interface Track {
  /** Centreline vertices, closed implicitly (last joins back to first). */
  points: Point[];
  /** cum[i] = distance along the centreline from points[0] to points[i];
   *  cum[points.length] is the full lap. */
  cum: number[];
  length: number;
  halfWidth: number;
  /** Runs of BLOCK segments with a circle around each, so distanceToWall can
   *  skip a whole run the sensor ray can't reach. */
  blocks: Block[];
}

interface Block {
  /** Segments first..last-1. */
  first: number;
  last: number;
  x: number;
  y: number;
  radius: number;
}

/** Where a point sits relative to the centreline. */
export interface Projection {
  /** Distance from the centreline. */
  dist: number;
  /** Distance along the lap, 0 <= s < length. */
  s: number;
  /** Index of the nearest centreline segment (points[seg] -> points[seg+1]). */
  seg: number;
}

/** One global track width for every circuit (per-circuit tuning is out of
 *  scope for v1). */
export const HALF_WIDTH = 14;

/** How many segments either side of a hint `project` searches. A car moves a
 *  few units per step, so it never skips this many; searching locally also
 *  stops progress jumping to a different part of the track that happens to
 *  pass nearby. */
const SEARCH_WINDOW = 6;

/** Segments per block in Track.blocks. */
const BLOCK = 16;

/** circuits.ts stores each outline as x0, y0, x1, y1, ... */
export function pointsFromFlat(flat: number[]): Point[] {
  const points: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) points.push({ x: flat[i], y: flat[i + 1] });
  return points;
}

/** Reads the M/L/Z polyline into points, dropping repeats and the closing
 *  point if it duplicates the first. */
export function parsePath(d: string): Point[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const points: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const p = { x: Number(nums[i]), y: Number(nums[i + 1]) };
    const prev = points[points.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) points.push(p);
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first.x === last.x && first.y === last.y) points.pop();
  return points;
}

export function buildTrack(points: Point[], halfWidth: number): Track {
  const n = points.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = points[i - 1];
    const b = points[i % n];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }

  const blocks: Block[] = [];
  for (let first = 0; first < n; first += BLOCK) {
    const last = Math.min(n, first + BLOCK);
    const ends = Array.from({ length: last - first + 1 }, (_, k) => points[(first + k) % n]);
    const x = ends.reduce((sum, p) => sum + p.x, 0) / ends.length;
    const y = ends.reduce((sum, p) => sum + p.y, 0) / ends.length;
    const radius = Math.max(...ends.map((p) => Math.hypot(p.x - x, p.y - y)));
    blocks.push({ first, last, x, y, radius });
  }

  return { points, cum, length: cum[n], halfWidth, blocks };
}

/** Nearest point on the centreline. With `hint` (the car's last segment) it
 *  searches only nearby segments; without it, the whole lap. */
export function project(track: Track, p: Point, hint?: number): Projection {
  const { points, cum, length } = track;
  const n = points.length;
  let best: Projection = { dist: Infinity, s: 0, seg: 0 };

  const check = (i: number) => {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = cum[i + 1] - cum[i];
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (segLen * segLen)));
    const dist = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (dist < best.dist) {
      const s = cum[i] + t * segLen;
      best = { dist, s: s >= length ? s - length : s, seg: i };
    }
  };

  if (hint === undefined) {
    for (let i = 0; i < n; i++) check(i);
  } else {
    for (let k = -SEARCH_WINDOW; k <= SEARCH_WINDOW; k++) check((((hint + k) % n) + n) % n);
  }
  return best;
}

/** Change in lap position from `prev` to `next`, taking the short way round,
 *  so crossing the start/finish line forwards is +small, not -length. */
export function unwrapDelta(prev: number, next: number, length: number): number {
  const d = next - prev;
  if (d > length / 2) return d - length;
  if (d < -length / 2) return d + length;
  return d;
}

export function isOffTrack(track: Track, proj: Projection): boolean {
  return proj.dist > track.halfWidth;
}

/** Direction of travel along segment `seg`, in radians. */
export function segmentAngle(track: Track, seg: number): number {
  const a = track.points[seg];
  const b = track.points[(seg + 1) % track.points.length];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Distance from `p` along direction `angle` to the wall (the edge of the
 *  track), capped at `range`. 0 if `p` is already off the track.
 *
 *  The track is a chain of capsules, one per segment (the segment widened by
 *  halfWidth, with round ends). Each capsule covers one stretch of the ray;
 *  starting at 0, the ray stays on track for as long as those stretches
 *  overlap, and the first gap is the wall.
 *
 *  Capsules (and whole blocks of them) that lie entirely to one side of the
 *  ray, behind it, or out of range are skipped: they can't add a stretch, so
 *  the answer is the same, only faster on finely spaced outlines. */
export function distanceToWall(track: Track, p: Point, angle: number, range: number): number {
  const { points, cum, halfWidth: r } = track;
  const n = points.length;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const spans: [number, number][] = [];

  const missesRay = (mx: number, my: number, pad: number) =>
    mx * mx + my * my > (range + pad) ** 2 || Math.abs(mx * dy - my * dx) > pad || mx * dx + my * dy < -pad;

  for (const block of track.blocks) {
    if (missesRay(block.x - p.x, block.y - p.y, block.radius + r)) continue;
    for (let i = block.first; i < block.last; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const len = cum[i + 1] - cum[i];
      if (missesRay((a.x + b.x) / 2 - p.x, (a.y + b.y) / 2 - p.y, len / 2 + r)) continue;

      // Inside the capsule = within r of the segment: the segment's own band
      // (a rectangle in its frame) plus a circle at each end.
      const fx = p.x - a.x;
      const fy = p.y - a.y;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      let lo = Infinity;
      let hi = -Infinity;

      for (let end = 0; end < 2; end++) {
        const cx = end === 0 ? fx : p.x - b.x;
        const cy = end === 0 ? fy : p.y - b.y;
        const proj = cx * dx + cy * dy;
        const disc = proj * proj - (cx * cx + cy * cy - r * r);
        if (disc >= 0) {
          const root = Math.sqrt(disc);
          lo = Math.min(lo, -proj - root);
          hi = Math.max(hi, -proj + root);
        }
      }

      // Band: 0 <= along <= len and -r <= across <= r, both linear in t.
      let t0 = -Infinity;
      let t1 = Infinity;
      const slabs: [number, number, number, number][] = [
        [fx * ux + fy * uy, dx * ux + dy * uy, 0, len],
        [fx * uy - fy * ux, dx * uy - dy * ux, -r, r],
      ];
      for (const [v0, rate, min, max] of slabs) {
        if (Math.abs(rate) < 1e-12) {
          if (v0 < min || v0 > max) t0 = Infinity;
        } else {
          const ta = (min - v0) / rate;
          const tb = (max - v0) / rate;
          t0 = Math.max(t0, Math.min(ta, tb));
          t1 = Math.min(t1, Math.max(ta, tb));
        }
      }
      if (t0 <= t1) {
        lo = Math.min(lo, t0);
        hi = Math.max(hi, t1);
      }

      if (hi > 0 && lo < range) spans.push([lo, hi]);
    }
  }

  spans.sort((s1, s2) => s1[0] - s2[0]);
  let reach = 0;
  for (const [t0, t1] of spans) {
    if (t0 > reach) break;
    reach = Math.max(reach, t1);
  }
  return Math.min(reach, range);
}
