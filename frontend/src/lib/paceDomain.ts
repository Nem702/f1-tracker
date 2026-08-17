/** Linearly-interpolated quantile of an already-sorted array. */
export function quantile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** LapTimeChart's Y domain: a contamination-aware pace range.
 *
 *  Written for a lap-chart hero that was built and then rejected; the circuit
 *  hero that shipped instead has no vertical axis and no pace encoding at all,
 *  so this now lives where an axis of lap times actually needs it. Every
 *  measured number below is real and was taken against the 11 raced sessions
 *  in the database.
 *
 *  Pit laps are ~20-25s slower than green-flag laps, so a min/max domain spends
 *  the entire vertical range on pit stops and flattens 60 laps of actual racing
 *  into a band at the bottom. Excluding pit in-laps and out-laps by name (as the
 *  rejected mockup did) does not survive safety cars, VSC, red
 *  flags or missing laps — and is measurably worse even on the mockup's own
 *  data, whose "green" set still contains the standing-start lap 1.
 *
 *  Two properties drive the rule below:
 *
 *  1. Contamination is entirely ONE-SIDED. Pit, SC, VSC, red-flag and traffic
 *     laps are all slower; nothing makes a lap spuriously fast. So low
 *     quantiles are immune — but the pooled MEDIAN is NOT. It only degrades
 *     more slowly than the max: at 33% contamination the pooled p50 IS green's
 *     p75. Anchoring the spread on it measured a +0.83s (flat deg) / +1.41s
 *     (wide deg) domain drift.
 *  2. Knowing where green racing ENDS requires reading a quantile high enough
 *     to be where contamination begins. A purely low-quantile rule cannot see
 *     the upper green tail: measured on real data it clipped 43% of Suzuka,
 *     cutting the entire p50-p80 band of genuine racing.
 *
 *  So: estimate the contamination fraction from immune quantiles first, then
 *  index into the green part. `hi` is self-correcting — more contamination
 *  pushes `c` up, which pushes the quantile index down by exactly the amount
 *  needed to stay inside green.
 *
 *  Measured drift at 33% contamination: +0.15s flat deg / +0.07s wide deg.
 *  Across all 11 real races in the DB the in-domain racing occupies 53-80% of
 *  plot height (mean 68%), with 10-26% of laps clipping off the top. */
export function paceDomain(pool: number[]): { lo: number; hi: number } {
  const s = [...pool].sort((a, b) => a - b);
  const med = quantile(s, 0.5);
  const half = Math.max(0.5, 0.006 * med);
  if (s.length < 8) return { lo: med - half, hi: med + half };

  const a = quantile(s, 0.05);
  const sp = quantile(s, 0.25) - a; // both anchors below any plausible contamination
  const gate = a + 6 * sp;
  const c = Math.min(0.6, s.filter((t) => t > gate).length / s.length);

  // `med * 1.5` was LapTimeChart's own previous censor threshold, kept as the
  // ceiling so the new domain can never be looser than the rule it replaces. On
  // real data it never binds — it is a safety rail for a red-flag "lap" (Monaco
  // records one of 2264s) rather than a working part of the rule.
  const hi = Math.min(quantile(s, (1 - c) * 0.96) + 0.15 * sp, med * 1.5);
  // Anchored on the fastest lap so the quickest laps are never bottom-clipped
  // (without this, Monaco clipped 2.6% of laps off the bottom), bounded against
  // a timing glitch dragging the floor away.
  const lo = Math.max(a - 3 * sp, Math.min(a - sp, s[0] - 0.04 * (hi - s[0])));

  return hi - lo < half ? { lo: med - half, hi: med + half } : { lo, hi };
}
