/**
 * The hero's race model: window selection, pit-lap placement, and the
 * safety-car join.
 *
 * THE THREE BUGS THIS FILE EXISTS FOR, all of which are silent in the app:
 *
 *  1. THE MID-ORBIT TELEPORT. The 12-lap window must be a pure function of
 *     `laps` + `pit`. Race control arrives on a separate, later fetch; if
 *     safety-car laps fed the ranking, the window — and therefore the shared
 *     clock bounds t0/t1 — would change underneath a running animation and
 *     the lights would jump to a different part of the race mid-orbit.
 *     `window stability` pins this.
 *
 *  2. THE OPEN-PATTERN TRAP. Race control emits both "VSC DEPLOYED" and "VSC
 *     ENDING". An opener matching /VIRTUAL SAFETY CAR/ matches both, so every
 *     ENDING opens a spurious interval that never closes and marks the rest
 *     of the race neutralised. Only /DEPLOYED/ can't do that — and only if
 *     the close predicate is evaluated BEFORE the open predicate on each row.
 *
 *  3. "unknown" REPORTED AS GREEN. A lap whose safety-car status cannot be
 *     evaluated must not claim to be green flag racing.
 *
 * Run: `npm test` (node --test --experimental-strip-types).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildHeroRace,
  buildScIntervals,
  isSafetyCarRow,
  positionAt,
  selectWindow,
  HERO_WINDOW_LAPS,
  type HeroLapRow,
} from "../src/lib/heroRace.ts";
import type { Lap, PitStop, RaceControlRow } from "../src/api/types.ts";

/* -------------------------------------------------------------- fixtures -- */

const T0 = Date.parse("2026-07-26T13:00:00+00:00");
const LAP_SECONDS = 80;

/** A driver's laps, one every 80s from T0, with real date_starts so the
 *  safety-car join has something to bite on. */
function laps(
  driverNumber: number,
  count: number,
  opts: { pitLaps?: number[]; outLaps?: number[]; nullStartLaps?: number[] } = {},
): Lap[] {
  const { pitLaps = [], outLaps = [], nullStartLaps = [] } = opts;
  const rows: Lap[] = [];
  let clock = T0;
  for (let n = 1; n <= count; n++) {
    const duration = pitLaps.includes(n) ? LAP_SECONDS + 21 : LAP_SECONDS;
    rows.push({
      session_key: 1,
      driver_number: driverNumber,
      lap_number: n,
      date_start: nullStartLaps.includes(n) ? null : new Date(clock).toISOString(),
      lap_duration: duration,
      duration_sector_1: null,
      duration_sector_2: null,
      duration_sector_3: null,
      i1_speed: null,
      i2_speed: null,
      st_speed: null,
      is_pit_out_lap: outLaps.includes(n),
    });
    clock += duration * 1000;
  }
  return rows;
}

function pits(driverNumber: number, lapNumbers: number[]): PitStop[] {
  return lapNumbers.map((lap_number) => ({
    session_key: 1,
    driver_number: driverNumber,
    lap_number,
    pit_duration: 21,
    date: null,
  }));
}

let rcId = 0;
function rc(offsetSeconds: number | null, message: string, flag?: string): RaceControlRow {
  return {
    id: ++rcId,
    session_key: 1,
    date: offsetSeconds === null ? null : new Date(T0 + offsetSeconds * 1000).toISOString(),
    category: "SafetyCar",
    flag: flag ?? null,
    scope: null,
    sector: null,
    driver_number: null,
    message,
  };
}

/** Lap n runs [T0 + (n-1)*80s, T0 + n*80s) in the fixtures above. */
const lapStartOffset = (n: number) => (n - 1) * LAP_SECONDS;

function rowsOf(kinds: string[]): HeroLapRow[] {
  return kinds.map((kind, i) => ({
    lap: i + 1,
    t: LAP_SECONDS,
    green: LAP_SECONDS,
    kind: kind as HeroLapRow["kind"],
  }));
}

/* ---------------------------------------------------------------- window -- */

test("window selection picks the densest stretch of pit laps", () => {
  // Pit laps clustered at 20-25 — the window containing them must win.
  const a = rowsOf(Array.from({ length: 40 }, () => "green"));
  const b = rowsOf(Array.from({ length: 40 }, () => "green"));
  for (const i of [19, 21, 23]) a[i].kind = "pit";
  for (const i of [20, 24]) b[i].kind = "pit";

  const win = selectWindow(a, b);
  assert.equal(win.events, 5);
  assert.ok(win.start <= 19 && win.end >= 24, `window ${win.start}..${win.end}`);
  assert.equal(win.end - win.start + 1, HERO_WINDOW_LAPS);
});

test("window selection is deterministic on ties — first window wins", () => {
  // No pit laps at all: every window scores 0, so the first must be chosen.
  const a = rowsOf(Array.from({ length: 30 }, () => "green"));
  const b = rowsOf(Array.from({ length: 30 }, () => "green"));
  const win = selectWindow(a, b);
  assert.equal(win.start, 0);
  assert.equal(win.events, 0);

  // Two equally dense stretches: the earlier one wins.
  a[5].kind = "pit";
  a[25].kind = "pit";
  assert.equal(selectWindow(a, b).start, 0);
});

test("window clamps to the shorter driver when a DNF shortens one side", () => {
  const a = rowsOf(Array.from({ length: 40 }, () => "green"));
  const b = rowsOf(Array.from({ length: 18 }, () => "green"));
  const win = selectWindow(a, b);
  assert.ok(win.end <= 17, `window end ${win.end} indexes past the retired car`);
});

test("WINDOW STABILITY: race control cannot move the window", () => {
  // The regression test for the mid-orbit teleport. Same laps + pit either
  // way; the only difference is a safety car sitting in a DIFFERENT 12-lap
  // stretch from the pit stops. If SC laps fed the ranking, the window would
  // move when the feed resolved.
  const lapRows = [...laps(1, 40, { pitLaps: [30] }), ...laps(2, 40, { pitLaps: [32] })];
  const pitRows = [...pits(1, [30]), ...pits(2, [32])];

  const cold = buildHeroRace(lapRows, pitRows, [], 1, 2);
  const warm = buildHeroRace(
    lapRows,
    pitRows,
    [
      // A safety car early in the race, far from the pit stops at lap 30/32.
      rc(lapStartOffset(4) + 10, "SAFETY CAR DEPLOYED"),
      rc(lapStartOffset(8) + 10, "SAFETY CAR IN THIS LAP"),
    ],
    1,
    2,
  );

  assert.ok(cold && warm);
  assert.equal(cold.windowStart, warm.windowStart, "windowStart moved");
  assert.equal(cold.windowEnd, warm.windowEnd, "windowEnd moved");
  assert.equal(cold.t0, warm.t0, "t0 moved — the animation clock would jump");
  assert.equal(cold.t1, warm.t1, "t1 moved — the animation clock would jump");

  // …and the feed really did classify laps, so the test isn't vacuous.
  assert.equal(cold.sc.joinAvailable, false);
  assert.equal(warm.sc.joinAvailable, true);
  assert.equal(warm.sc.intervals, 1);
  assert.ok(
    warm.a.rows.some((r) => r.kind === "sc"),
    "no lap was classified sc — the stability assertion would prove nothing",
  );
});

/* ------------------------------------------------------------- placement -- */

const straightDriver = () => {
  const race = buildHeroRace(
    [...laps(1, 30, { pitLaps: [10], outLaps: [11] }), ...laps(2, 30)],
    pits(1, [10]),
    [],
    1,
    2,
  );
  assert.ok(race);
  return race;
};

test("positionAt runs at normal pace to the pit entry, then crawls", () => {
  const race = straightDriver();
  const entry = 0.9041; // Hungaroring
  const exit = 0.0685;
  const d = race.a;
  const lapIndex = 9; // lap 10, the pit lap
  const start = d.cum[lapIndex];
  const green = d.rows[lapIndex].green; // 80s of actual running
  assert.equal(d.rows[lapIndex].kind, "pit");
  assert.equal(green, 80);

  // Halfway through the green part of the lap: still at normal pace, so the
  // fraction is just elapsed/green and the car is NOT flagged as pitting.
  const mid = positionAt(d, start + green * 0.45, entry, exit);
  assert.ok(Math.abs(mid.frac - 0.45) < 1e-9, `frac ${mid.frac}`);
  assert.equal(mid.pit, -1);

  // Exactly at the pit entry.
  const atEntry = positionAt(d, start + entry * green, entry, exit);
  assert.ok(Math.abs(atEntry.frac - entry) < 1e-6, `frac ${atEntry.frac}`);

  // Past it, the car is in the pit window and barely moves: the remaining
  // ~9.6% of track now takes the whole 21s stop plus the rest of the lap.
  const crawl = positionAt(d, start + entry * green + 10, entry, exit);
  assert.ok(crawl.pit >= 0, "expected in-pit flag");
  assert.ok(crawl.frac > entry && crawl.frac < 1, `frac ${crawl.frac}`);
  // 10 seconds into the crawl it has covered far less than 10s of a normal
  // lap would have (that would be 0.125 of the lap).
  assert.ok(crawl.frac - entry < 0.06, `crawl covered ${crawl.frac - entry}`);
});

test("positionAt flags the out-lap and is monotonic in T within a lap", () => {
  const race = straightDriver();
  const entry = 0.9041;
  const exit = 0.0685;
  const d = race.a;

  const outIndex = 10; // lap 11
  assert.equal(d.rows[outIndex].kind, "out");
  const outStart = d.cum[outIndex];
  assert.equal(positionAt(d, outStart + 0.5, entry, exit).pit, -2);

  // Monotonic across the whole pit lap, crawl included.
  const lapStart = d.cum[9];
  const lapEnd = d.cum[10];
  let previous = -Infinity;
  for (let s = 0; s <= 1; s += 1 / 256) {
    const p = positionAt(d, lapStart + (lapEnd - lapStart) * s, entry, exit);
    assert.ok(p.dist >= previous - 1e-9, `dist went backwards at s=${s}`);
    previous = p.dist;
  }
});

test("positionAt parks a retired car at its last lap instead of extrapolating", () => {
  const race = buildHeroRace([...laps(1, 20), ...laps(2, 40)], [], [], 1, 2);
  assert.ok(race);
  const far = positionAt(race.a, race.a.cum[race.a.cum.length - 1] + 10_000, 0.9, 0.07);
  assert.equal(far.index, race.a.rows.length - 1);
  assert.ok(far.frac <= 1 && far.frac >= 0);
  assert.ok(Number.isFinite(far.dist));
});

test("a driver with too few laps yields null", () => {
  assert.equal(buildHeroRace([...laps(1, 3), ...laps(2, 40)], [], [], 1, 2), null);
  assert.equal(buildHeroRace([], [], [], 1, 2), null, "cancelled race");
  assert.equal(buildHeroRace([...laps(1, 40)], [], [], 1, 99), null, "absent driver");
});

/* ------------------------------------------------------------- SC INTERVALS */

test("SC INTERVALS: [VSC DEPLOYED, VSC ENDING] yields exactly ONE interval", () => {
  // The regression test for the open-pattern trap. A naive opener matching
  // /VIRTUAL SAFETY CAR|DEPLOYED/ would open a second interval on the
  // ENDING row, which would never close.
  const { intervals } = buildScIntervals([
    rc(100, "VIRTUAL SAFETY CAR DEPLOYED"),
    rc(200, "VIRTUAL SAFETY CAR ENDING"),
  ]);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].closedBy, "message");
  assert.equal(intervals[0].end - intervals[0].start, 100_000);
});

test("SC INTERVALS: back-to-back deployments stay separate", () => {
  // Real Silverstone shape: IN THIS LAP then a fresh DEPLOYED 8s later.
  const { intervals } = buildScIntervals([
    rc(100, "SAFETY CAR DEPLOYED"),
    rc(200, "SAFETY CAR IN THIS LAP"),
    rc(208, "SAFETY CAR DEPLOYED"),
    rc(300, "SAFETY CAR IN THIS LAP"),
  ]);
  assert.equal(intervals.length, 2);
  assert.deepEqual(
    intervals.map((i) => [(i.start - T0) / 1000, (i.end - T0) / 1000]),
    [
      [100, 200],
      [208, 300],
    ],
  );
});

test("SC INTERVALS: a deployment with no clear row closes at session end", () => {
  const { intervals } = buildScIntervals([
    rc(100, "SAFETY CAR DEPLOYED"),
    rc(400, "DRS ENABLED"),
  ]);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].closedBy, "sessionEnd");
  assert.equal(intervals[0].end, T0 + 400_000);
});

test("SC INTERVALS: per-sector CLEAR flags do not close an interval", () => {
  // MEASURED, not hypothetical. In the live feed marshals emit "CLEAR IN
  // TRACK SECTOR n" while the safety car is still circulating (188 such rows
  // across the 11 raced sessions). Closing on any CLEAR flag collapses
  // Miami's real 712s safety car to 28s and two VSCs to 0s. Only the exact
  // "TRACK CLEAR" message ends a neutralisation.
  const { intervals } = buildScIntervals([
    rc(100, "SAFETY CAR DEPLOYED"),
    rc(128, "CLEAR IN TRACK SECTOR 19", "CLEAR"),
    rc(150, "GREEN LIGHT - PIT EXIT OPEN", "GREEN"),
    rc(812, "SAFETY CAR IN THIS LAP"),
  ]);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].closedBy, "message");
  assert.equal((intervals[0].end - intervals[0].start) / 1000, 712);
});

test("SC INTERVALS: TRACK CLEAR closes an otherwise orphaned deployment", () => {
  // Monaco's second safety car: red-flagged, so it has no "IN THIS LAP" row.
  const { intervals } = buildScIntervals([
    rc(100, "SAFETY CAR DEPLOYED"),
    rc(120, "CLEAR IN TRACK SECTOR 18", "CLEAR"),
    rc(300, "TRACK CLEAR", "CLEAR"),
  ]);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].closedBy, "trackClear");
  assert.equal((intervals[0].end - intervals[0].start) / 1000, 200);
});

test("SC INTERVALS: a null date is skipped without throwing", () => {
  const { intervals, skippedNullDate } = buildScIntervals([
    rc(null, "SAFETY CAR DEPLOYED"),
    rc(100, "SAFETY CAR DEPLOYED"),
    rc(200, "SAFETY CAR IN THIS LAP"),
  ]);
  assert.equal(skippedNullDate, 1);
  assert.equal(intervals.length, 1);
});

test("isSafetyCarRow matches the category and message vocabularies", () => {
  assert.ok(isSafetyCarRow(rc(0, "VSC DEPLOYED")));
  assert.ok(isSafetyCarRow({ ...rc(0, "LAPPED CARS MAY NOW OVERTAKE THE SAFETY CAR"), category: "Other" }));
  assert.ok(!isSafetyCarRow({ ...rc(0, "DRS ENABLED"), category: "Other" }));
});

/* ------------------------------------------------------------- THE SC JOIN */

/** Classify one driver's laps against a race-control feed. */
function kinds(feed: RaceControlRow[], lapOpts = {}): string[] {
  const race = buildHeroRace(
    [...laps(1, 30, lapOpts), ...laps(2, 30)],
    [],
    feed,
    1,
    2,
  );
  assert.ok(race);
  return race.a.rows.map((r) => r.kind);
}

test("SC JOIN: a flag spanning a lap boundary marks BOTH laps", () => {
  // Lap 5 runs [320, 400); lap 6 runs [400, 480). Straddle the boundary.
  const k = kinds([rc(390, "SAFETY CAR DEPLOYED"), rc(410, "SAFETY CAR IN THIS LAP")]);
  assert.equal(k[4], "sc", "lap 5");
  assert.equal(k[5], "sc", "lap 6");
  assert.equal(k[3], "green", "lap 4 must be untouched");
  assert.equal(k[6], "green", "lap 7 must be untouched");
});

test("SC JOIN: a flag wholly inside one lap marks ONLY that lap", () => {
  const k = kinds([rc(330, "SAFETY CAR DEPLOYED"), rc(390, "SAFETY CAR IN THIS LAP")]);
  assert.equal(k[4], "sc", "lap 5");
  assert.equal(k[3], "green");
  assert.equal(k[5], "green");
});

test("SC JOIN: the lap window is half-open — a boundary hit lands on the LATER lap", () => {
  // An interval that starts exactly at lap 6's start (offset 400) and ends
  // inside lap 6 must not touch lap 5, whose window is [320, 400).
  const k = kinds([rc(400, "SAFETY CAR DEPLOYED"), rc(450, "SAFETY CAR IN THIS LAP")]);
  assert.equal(k[4], "green", "lap 5 ends exactly where the flag starts");
  assert.equal(k[5], "sc", "lap 6");
});

test('SC JOIN: a null date_start yields "unknown", never "green"', () => {
  const k = kinds(
    [rc(330, "SAFETY CAR DEPLOYED"), rc(390, "SAFETY CAR IN THIS LAP")],
    { nullStartLaps: [8] },
  );
  assert.equal(k[7], "unknown", "lap 8 cannot be placed on the clock");
  // …and the unplaceable lap did not swallow the flag from its neighbours.
  assert.equal(k[4], "sc", "lap 5 still classified");
  assert.equal(k[6], "green");
  assert.equal(k[8], "green");
});

test('SC JOIN: no feed at all means "unknown", not "green flag racing"', () => {
  const k = kinds([]);
  // Order matters only for the typechecker: `every` is a type guard, so
  // asserting it first narrows `k` to "unknown"[] and makes the second line
  // a comparison TS considers impossible.
  assert.equal(k.filter((x) => x === "green").length, 0, "no lap may claim green");
  assert.ok(k.every((x) => x === "unknown"), "an unjoinable lap must not claim green");
});

test("SC JOIN: pit and out-lap outrank the safety car classification", () => {
  const race = buildHeroRace(
    [...laps(1, 30, { pitLaps: [5], outLaps: [6] }), ...laps(2, 30)],
    pits(1, [5]),
    [rc(300, "SAFETY CAR DEPLOYED"), rc(520, "SAFETY CAR IN THIS LAP")],
    1,
    2,
  );
  assert.ok(race);
  assert.equal(race.a.rows[4].kind, "pit", "lap 5 pitted during the safety car");
  assert.equal(race.a.rows[5].kind, "out", "lap 6 is the out-lap");
});

test("diagnostics count how each interval closed", () => {
  const race = buildHeroRace(
    [...laps(1, 30), ...laps(2, 30)],
    [],
    [
      rc(100, "SAFETY CAR DEPLOYED"),
      rc(200, "SAFETY CAR IN THIS LAP"),
      rc(300, "SAFETY CAR DEPLOYED"),
      rc(400, "TRACK CLEAR", "CLEAR"),
      rc(null, "SAFETY CAR DEPLOYED"),
    ],
    1,
    2,
  );
  assert.ok(race);
  assert.deepEqual(race.sc, {
    intervals: 2,
    closedByMessage: 1,
    closedByTrackClear: 1,
    closedAtSessionEnd: 0,
    skippedNullDate: 1,
    joinAvailable: true,
  });
});

test("the starting gap survives into the model", () => {
  // Driver 2 starts 6.4s behind driver 1.
  const a = laps(1, 30);
  const b = laps(2, 30).map((l) => ({
    ...l,
    date_start: new Date(Date.parse(l.date_start as string) + 6400).toISOString(),
  }));
  const race = buildHeroRace([...a, ...b], [], [], 1, 2);
  assert.ok(race);
  assert.equal(race.a.cum[0], 0);
  assert.ok(Math.abs(race.b.cum[0] - 6.4) < 1e-9, `anchor ${race.b.cum[0]}`);
});
