// The hero animation's race model: two drivers, one shared clock, a 12-lap
// window chosen from the data. Pure and DOM-free on purpose — everything here
// is reachable from `node --test --experimental-strip-types`, which runs
// without a DOM (tsconfig.scripts.json omits the DOM lib deliberately). No
// `getTotalLength`, no `getPointAtLength`; distances are in LAP UNITS and the
// component multiplies by the measured path length at the call site.

import type { Lap, PitStop, RaceControlRow } from "../api/types";

/** How many laps the looped window spans. */
export const HERO_WINDOW_LAPS = 12;

/** Below this many usable laps there is no animation worth showing — a
 *  cancelled race, a lap-3 DNF, a driver the session doesn't hold. The
 *  component falls back to the static outline. */
const MIN_USABLE_LAPS = 14;

/** `"unknown"` is NOT a synonym for `"green"`: it means the safety-car join
 *  could not be evaluated for this lap (no `date_start`, or no race-control
 *  feed yet). The narration stays silent on an unknown lap rather than
 *  asserting "Green flag racing." for a lap it cannot vouch for. */
export type LapKind = "green" | "pit" | "out" | "sc" | "unknown";

export interface HeroLapRow {
  /** Real `lap_number` from the API, not a row index. */
  lap: number;
  /** `lap_duration`, seconds. */
  t: number;
  /** The lap's on-track pace: `t` minus the stationary pit time. Equal to `t`
   *  on every non-pit lap. Approximate by construction. */
  green: number;
  kind: LapKind;
}

export interface HeroDriver {
  number: number;
  rows: HeroLapRow[];
  /** Race clock, seconds. `cum[i]` is the clock at the START of `rows[i]`, so
   *  it has `rows.length + 1` entries and `cum[i + 1]` ends lap `i`. */
  cum: number[];
}

/** Where a driver is at a given clock reading. */
export interface HeroPosition {
  /** Row index, 0-based. */
  index: number;
  /** Real lap number for the narration. */
  lap: number;
  /** Fraction through the current lap, 0..1. */
  frac: number;
  /** Position in LAP UNITS (`index + frac`). Multiply by the measured path
   *  length to get a distance along the SVG path. */
  dist: number;
  /** −1 on track · −2 on the out-lap · >= 0 = fraction through the in-lap
   *  crawl. Doubles as the "is this car in the pits" flag. */
  pit: number;
  kind: LapKind;
}

export interface HeroScDiagnostics {
  intervals: number;
  closedByMessage: number;
  closedByTrackClear: number;
  closedAtSessionEnd: number;
  /** Race-control rows dropped because `date` was null. */
  skippedNullDate: number;
  /** False when there was no race-control feed to join against. */
  joinAvailable: boolean;
}

export interface HeroRace {
  a: HeroDriver;
  b: HeroDriver;
  /** Inclusive row-index bounds of the looped window. */
  windowStart: number;
  windowEnd: number;
  /** Shared clock bounds, seconds — `t0` starts the window, `t1` ends it. */
  t0: number;
  t1: number;
  /** Pit laps inside the window; what the window was ranked on. */
  windowEvents: number;
  sc: HeroScDiagnostics;
}

/* ---------------------------------------------------------------------------
 * Safety car — real race-control flags only.
 *
 * There is deliberately NO lap-time heuristic and no fallback. The SC signal
 * drives exactly one thing: the narration's note string. It does not feed the
 * window selector, the placement maths, the gap arc or the draw-in. Putting a
 * guess behind one line of text, in a component where everything else is
 * measured, costs the component's honesty and buys nothing.
 * ------------------------------------------------------------------------- */

/** Shared with RaceControlFeed's "Safety car" filter — one predicate, one
 *  place. Matches the SafetyCar category and any message mentioning a safety
 *  car or VSC (including stewarding rows about infringements, which is why
 *  the interval opener below is narrower than this). */
export function isSafetyCarRow(row: RaceControlRow): boolean {
  const category = row.category?.toUpperCase() ?? "";
  const message = row.message?.toUpperCase() ?? "";
  return (
    category.includes("SAFETYCAR") ||
    category.includes("SAFETY CAR") ||
    /SAFETY CAR|VIRTUAL|VSC/.test(message)
  );
}

export interface ScInterval {
  /** Epoch ms. */
  start: number;
  end: number;
  closedBy: "message" | "trackClear" | "sessionEnd";
}

/**
 * Race control emits point-in-time messages, not intervals — a safety car is
 * a deployment row and, later, a clearing row — so intervals have to be built
 * before anything can be joined to them.
 *
 * THE OPEN-PATTERN TRAP. Real race control emits both "VIRTUAL SAFETY CAR
 * DEPLOYED" and "VIRTUAL SAFETY CAR ENDING". An opener of
 * /DEPLOYED|VIRTUAL SAFETY CAR/ matches BOTH, so every VSC *ending* would
 * open a spurious interval that never closes, falls through to the
 * session-end fallback, and marks the whole rest of the race as neutralised.
 * /DEPLOYED/ alone cannot do that — and evaluating the close predicate BEFORE
 * the open predicate on each row means an ambiguous message can never open
 * one either. Both details are load-bearing; see heroRace.test.ts.
 *
 * THE CLOSE PREDICATE IS NARROWER THAN A PLAIN "GREEN OR CLEAR FLAG", and
 * this is measured, not stylistic. In the live feed `CLEAR` is overwhelmingly
 * per-sector housekeeping ("CLEAR IN TRACK SECTOR 19", 188 rows across the 11
 * raced sessions) which marshals emit *while the safety car is still
 * circulating*, and `GREEN` is almost always "GREEN LIGHT - PIT EXIT OPEN".
 * Closing on any such row truncates real neutralisations savagely: Miami's
 * 712s safety car collapses to 28s, Spa's 427s to 12s, and two VSCs to 0s.
 * The rows that genuinely end a neutralisation are the SafetyCar-category
 * "... IN THIS LAP" / "... ENDING" messages, plus the single exact-match
 * "TRACK CLEAR" flag row. Across all 11 raced sessions that yields 23
 * intervals — 22 closed on the message, 1 on TRACK CLEAR (Monaco's second
 * safety car, which ended in a red flag and so has no "IN THIS LAP" row) and
 * zero hitting the session-end fallback.
 *
 * Accepted imprecision, do not "fix": "SAFETY CAR IN THIS LAP" warns that the
 * car is *about to* come in, so the interval ends roughly a lap early. Erring
 * short is the safe direction for a signal that only writes a caption.
 */
export function buildScIntervals(raceControl: RaceControlRow[]): {
  intervals: ScInterval[];
  skippedNullDate: number;
} {
  let skippedNullDate = 0;
  const dated: { at: number; message: string }[] = [];
  for (const row of raceControl) {
    if (!row.date) {
      skippedNullDate++;
      continue;
    }
    const at = Date.parse(row.date);
    if (Number.isNaN(at)) {
      skippedNullDate++;
      continue;
    }
    dated.push({ at, message: (row.message ?? "").toUpperCase().trim() });
  }
  dated.sort((x, y) => x.at - y.at);

  const intervals: ScInterval[] = [];
  let openAt: number | null = null;
  for (const row of dated) {
    // Close BEFORE open — see the trap note above.
    const closesByMessage = /IN THIS LAP|ENDING/.test(row.message);
    const closesByTrackClear = row.message === "TRACK CLEAR";
    if (openAt !== null && (closesByMessage || closesByTrackClear)) {
      intervals.push({
        start: openAt,
        end: row.at,
        closedBy: closesByMessage ? "message" : "trackClear",
      });
      openAt = null;
      continue;
    }
    if (openAt === null && /DEPLOYED/.test(row.message)) {
      // The opener is checked against the raw message rather than
      // isSafetyCarRow because `dated` has already dropped the other fields;
      // "DEPLOYED" only ever appears on safety-car rows in this feed.
      openAt = row.at;
    }
  }
  if (openAt !== null) {
    const sessionEnd = dated.length > 0 ? dated[dated.length - 1].at : openAt;
    intervals.push({ start: openAt, end: sessionEnd, closedBy: "sessionEnd" });
  }
  return { intervals, skippedNullDate };
}

/** Half-open lap window `[start, start + duration)` against the SC intervals.
 *  Start inclusive / end exclusive is the load-bearing detail: it makes the
 *  lap windows tile the race exactly once, so a flag landing precisely on a
 *  lap boundary is attributed to the LATER lap only and no instant is counted
 *  twice. A flag spanning a boundary marks both laps; a flag wholly inside
 *  one lap marks only that one. Both are intended. */
function lapIsNeutralised(
  lapStart: number,
  lapEnd: number,
  intervals: ScInterval[],
): boolean {
  return intervals.some((iv) => iv.start < lapEnd && iv.end > lapStart);
}

/* ------------------------------------------------------------------------ */

function buildDriver(
  laps: Lap[],
  pit: PitStop[],
  driverNumber: number,
  intervals: ScInterval[],
  joinAvailable: boolean,
): { rows: HeroLapRow[]; firstLapStart: number | null } | null {
  const mine = laps
    .filter((l) => l.driver_number === driverNumber && l.lap_duration !== null)
    .sort((a, b) => a.lap_number - b.lap_number);
  if (mine.length < MIN_USABLE_LAPS) return null;

  const pitByLap = new Map<number, PitStop>();
  for (const p of pit) {
    if (p.driver_number === driverNumber) pitByLap.set(p.lap_number, p);
  }

  const rows: HeroLapRow[] = mine.map((lap) => {
    const t = lap.lap_duration as number;
    const stop = pitByLap.get(lap.lap_number);

    // `green` is the lap minus the stationary time. Guard the pathological
    // case where a bad pit_duration would meet or exceed the whole lap — at()
    // divides by `green`, and a zero would produce Infinity.
    const stopSeconds = stop?.pit_duration ?? 0;
    const green = stopSeconds > 0 && stopSeconds < t ? t - stopSeconds : t;

    // First match wins, in this order.
    let kind: LapKind;
    if (stop) {
      kind = "pit";
    } else if (lap.is_pit_out_lap === true) {
      kind = "out";
    } else if (!joinAvailable || !lap.date_start) {
      // No feed to join against, or this lap cannot be placed on the clock —
      // withhold the classification rather than claiming green.
      kind = "unknown";
    } else {
      const lapStart = Date.parse(lap.date_start);
      if (Number.isNaN(lapStart)) {
        kind = "unknown";
      } else {
        kind = lapIsNeutralised(lapStart, lapStart + t * 1000, intervals)
          ? "sc"
          : "green";
      }
    }
    return { lap: lap.lap_number, t, green, kind };
  });

  const firstStart = mine[0].date_start;
  const parsed = firstStart ? Date.parse(firstStart) : NaN;
  return {
    rows,
    firstLapStart: Number.isNaN(parsed) ? null : parsed,
  };
}

/** Densest `HERO_WINDOW_LAPS`-row stretch by PIT laps only. First window wins
 *  ties, which makes it deterministic.
 *
 *  Safety-car laps are deliberately NOT counted, and this is the load-bearing
 *  reason the window is a pure function of `laps` + `pit`: those two are
 *  fetched together, while race control arrives on a separate, later request.
 *  If SC laps fed the ranking, a cold load would rank on pit laps alone, then
 *  re-rank when the feed resolved — moving the window, and therefore t0/t1,
 *  underneath a running loop, teleporting the lights mid-orbit. It is also
 *  simply the better ranking: a safety car slows both cars almost equally so
 *  it barely moves the gap arc, while a pit stop is the only thing that
 *  visibly does. */
export function selectWindow(
  a: HeroLapRow[],
  b: HeroLapRow[],
): { start: number; end: number; events: number } {
  // A DNF leaves the two drivers with different lap counts: clamp to the
  // shorter so the window never indexes past the retired car's last lap.
  const shared = Math.min(a.length, b.length);
  const span = Math.min(HERO_WINDOW_LAPS, shared);
  let bestStart = 0;
  let bestCount = -1;
  for (let start = 0; start + span <= shared; start++) {
    let count = 0;
    for (let i = start; i < start + span; i++) {
      if (a[i].kind === "pit" || b[i].kind === "pit") count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestStart = start;
    }
  }
  return { start: bestStart, end: bestStart + span - 1, events: bestCount };
}

/**
 * Where driver `d` is at shared clock `T` (seconds).
 *
 * THE PIT-LAP TIME REMAP IS THE POINT. One shared race clock, each driver
 * placed from their OWN cumulative time — so the car that pits is the car
 * that drops back — and a pit lap's extra ~21s spent INSIDE the pit window
 * rather than smeared across the whole lap: normal pace from the line to the
 * pit entry, then a crawl. Smearing it would make the car mysteriously slow
 * for a whole lap instead of stopping somewhere.
 */
export function positionAt(
  d: HeroDriver,
  T: number,
  pitEntryT: number,
  pitExitT: number,
): HeroPosition {
  const c = d.cum;
  const last = d.rows.length - 1;
  let i = 0;
  while (i < last && c[i + 1] <= T) i++;

  const row = d.rows[i];
  const elapsed = T - c[i];
  const lapT = c[i + 1] - c[i];
  let frac: number;
  let pit = -1;

  if (row.kind === "pit") {
    const z = pitEntryT;
    const toEntry = z * row.green; // normal-speed part: line -> pit entry
    if (elapsed <= toEntry) {
      frac = elapsed / row.green;
    } else {
      const p = (elapsed - toEntry) / (lapT - toEntry);
      frac = z + p * (1 - z);
      pit = p;
    }
  } else if (row.kind === "out") {
    const z = pitExitT;
    const release = z * row.green * 2.2; // slow release out of the pit exit
    if (elapsed <= release) {
      frac = (elapsed / release) * z;
      pit = -2;
    } else {
      frac = z + ((elapsed - release) / (lapT - release)) * (1 - z);
    }
  } else {
    frac = elapsed / lapT;
  }

  // Clamping is also what parks a retired car at the line instead of
  // extrapolating it off the end of its own data.
  frac = Math.max(0, Math.min(1, frac));
  if (!Number.isFinite(frac)) frac = 0;
  return { index: i, lap: row.lap, frac, dist: i + frac, pit, kind: row.kind };
}

/**
 * Build the whole model, or null when there is not enough real data (a
 * cancelled race, an early DNF, a driver absent from the session). Callers
 * render the static outline on null.
 */
export function buildHeroRace(
  laps: Lap[],
  pit: PitStop[],
  raceControl: RaceControlRow[],
  a: number,
  b: number,
): HeroRace | null {
  const joinAvailable = raceControl.length > 0;
  const { intervals, skippedNullDate } = buildScIntervals(raceControl);

  const rawA = buildDriver(laps, pit, a, intervals, joinAvailable);
  const rawB = buildDriver(laps, pit, b, intervals, joinAvailable);
  if (!rawA || !rawB) return null;

  // Anchor both drivers on the earlier of their two lap-1 starts so the real
  // starting gap survives into the animation. A missing date_start on either
  // side falls back to a zero anchor — placement still works, it just starts
  // both cars level. (That fallback does NOT make the SC join valid; kinds
  // are withheld per-lap above, independently of this.)
  let anchorA = 0;
  let anchorB = 0;
  if (rawA.firstLapStart !== null && rawB.firstLapStart !== null) {
    const origin = Math.min(rawA.firstLapStart, rawB.firstLapStart);
    anchorA = (rawA.firstLapStart - origin) / 1000;
    anchorB = (rawB.firstLapStart - origin) / 1000;
  }

  const accumulate = (rows: HeroLapRow[], anchor: number): number[] => {
    const cum = [anchor];
    for (let i = 0; i < rows.length; i++) cum.push(cum[i] + rows[i].t);
    return cum;
  };

  const driverA: HeroDriver = {
    number: a,
    rows: rawA.rows,
    cum: accumulate(rawA.rows, anchorA),
  };
  const driverB: HeroDriver = {
    number: b,
    rows: rawB.rows,
    cum: accumulate(rawB.rows, anchorB),
  };

  const win = selectWindow(driverA.rows, driverB.rows);
  const t0 = Math.min(driverA.cum[win.start], driverB.cum[win.start]);
  const t1 = Math.max(driverA.cum[win.end + 1], driverB.cum[win.end + 1]);

  let closedByMessage = 0;
  let closedByTrackClear = 0;
  let closedAtSessionEnd = 0;
  for (const iv of intervals) {
    if (iv.closedBy === "message") closedByMessage++;
    else if (iv.closedBy === "trackClear") closedByTrackClear++;
    else closedAtSessionEnd++;
  }

  return {
    a: driverA,
    b: driverB,
    windowStart: win.start,
    windowEnd: win.end,
    t0,
    t1,
    windowEvents: win.events,
    sc: {
      intervals: intervals.length,
      closedByMessage,
      closedByTrackClear,
      closedAtSessionEnd,
      skippedNullDate,
      joinAvailable,
    },
  };
}

/** Teammate gap in seconds at the end of the given row index — the figure the
 *  narration prints. Both cumulative arrays are anchored to the same origin,
 *  so this is a real difference of real lap times. */
export function gapAt(race: HeroRace, index: number): number {
  const i = Math.min(index + 1, race.a.cum.length - 1, race.b.cum.length - 1);
  return Math.abs(race.a.cum[i] - race.b.cum[i]);
}
