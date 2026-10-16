// Builds src/lab/circuits.ts: the AI Lab's own circuit outlines, smoother and
// more detailed than the homepage hero's (which stay in heroCircuits.ts).
// Run by hand from frontend/ (it is not part of `npm run build`):
//
//   node --experimental-strip-types --no-warnings scripts/build-lab-circuits.ts [--overlays <dir>]
//
// For each of the 24 circuits it:
//   1. downloads the bacinger/f1-circuits GeoJSON (OpenStreetMap, MIT),
//   2. projects lat/lon to metres and draws a smooth spline through it,
//   3. lines the result up with today's hero outline, so the lab keeps the
//      same box size and orientation,
//   4. resamples it evenly, SPACING box units apart,
//   5. sets start/finish and direction from the 2026 qualifying pole lap on
//      OpenF1 where there is one (and checks the outline against it), else
//      from the hero outline, and records that lap's time, driver and speed
//      at the line (the lab's target and flying-start speed),
//   6. finds where the road would merge with itself and where it crosses
//      itself (Suzuka's bridge),
// then prints one table row per circuit. With --overlays it also saves a
// PNG per circuit (real lap over our road) via Playwright.
//
// Network: raw.githubusercontent.com and api.openf1.org only. OpenF1 refuses
// every unauthenticated request while a session is live; run it outside one.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { HERO_CIRCUITS, HERO_CIRCUITS_ATTRIBUTION, type HeroCircuit } from "../src/data/heroCircuits.ts";
import { buildTrack, parsePath, project, unwrapDelta, type Point, type Track } from "../src/lab/track.ts";
import {
  alignLoops,
  applySimilarity,
  findCrossings,
  lonLatToMetres,
  loopLength,
  mergeSpots,
  pointAt,
  resampleEven,
  smoothLoop,
  type MergeSpot,
} from "./labGeometry.ts";

const OUT_FILE = "src/lab/circuits.ts";
const BACINGER = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits";
const OPENF1 = "https://api.openf1.org/v1";
/** Distance between centreline points, in box units (2.9 m at Monaco to 8.3 m
 *  at Jeddah): close enough that corners are arcs, few enough that 25x runs. */
const SPACING = 3;
/** A real F1 track is about 15 m wide; the lab's road is 14 box units each side. */
const REAL_HALF_WIDTH_M = 7.5;
/** The lab's road before real units (task 25): 14 box units each side. Still
 *  the bar for the pole-lap reality check and the ±14 merge spots, so the
 *  outlines this script writes don't change with the sim's road width. */
const BOX_HALF_WIDTH = 14;

/** 2026 qualifying session keys (OpenF1 /v1/sessions). Bahrain and Jeddah were
 *  cancelled. A session that hasn't run yet returns no laps, and the circuit
 *  falls back to the hero start/finish. */
const QUALIFYING: Record<string, number> = {
  "au-1953": 11230, "cn-2004": 11241, "jp-1962": 11249, "us-2022": 11276,
  "ca-1978": 11287, "mc-1929": 11295, "es-1991": 11303, "at-1969": 11311,
  "gb-1948": 11322, "be-1925": 11330, "hu-1986": 11338, "nl-1948": 11349,
  "it-1922": 11357, "es-2026": 11365, "az-2016": 11373, "sg-2008": 11384,
  "us-2012": 11392, "mx-1962": 11400, "br-1940": 11408, "us-2023": 11416,
  "qa-2004": 11424, "ae-2009": 11432,
};

interface Sample extends Point {
  t: number;
  z: number;
}

interface PoleLap {
  driver: number;
  /** Three-letter code, e.g. NOR. */
  driverCode: string;
  seconds: number;
  /** Speed at the start/finish line as the lap began, m/s. */
  lineSpeedMs: number;
  /** Samples from the line to the line. */
  path: Sample[];
  /** Car position interpolated at the moment the lap started. */
  start: Point;
}

/** OpenF1's free tier allows about 30 requests a minute. */
const OPENF1_GAP_MS = 2100;
let lastOpenF1 = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** null for OpenF1's "No results found" 404; retries rate limits and 5xx. */
async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    if (url.startsWith(OPENF1)) {
      await sleep(lastOpenF1 + OPENF1_GAP_MS - Date.now());
      lastOpenF1 = Date.now();
    }
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 404 && url.startsWith(OPENF1)) return null;
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(10_000 * attempt);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
}

async function fetchOutline(id: string): Promise<[number, number][]> {
  const geo = (await fetchJson(`${BACINGER}/${id}.geojson`)) as {
    features: { geometry: { type: string; coordinates: [number, number][] } }[];
  };
  const { type, coordinates } = geo.features[0].geometry;
  if (type !== "LineString") throw new Error(`${id}: expected a LineString, got ${type}`);
  const out = coordinates.filter((c, i) => i === 0 || c[0] !== coordinates[i - 1][0] || c[1] !== coordinates[i - 1][1]);
  const [first, last] = [out[0], out[out.length - 1]];
  if (first[0] === last[0] && first[1] === last[1]) out.pop();
  return out;
}

async function fetchPoleLap(sessionKey: number): Promise<PoleLap | null> {
  const laps = (await fetchJson(`${OPENF1}/laps?session_key=${sessionKey}`)) as
    | { driver_number: number; lap_duration: number | null; date_start: string | null }[]
    | null;
  const timed = (laps ?? []).filter((l) => typeof l.lap_duration === "number" && l.date_start);
  if (timed.length === 0) return null;
  const pole = timed.reduce((a, b) => (b.lap_duration! < a.lap_duration! ? b : a));
  const t0 = Date.parse(pole.date_start!);
  const t1 = t0 + pole.lap_duration! * 1000;
  // Comparison operators must sit in the URL as-is; only the values are encoded.
  const iso = (t: number) => encodeURIComponent(new Date(t).toISOString());
  const rows = (await fetchJson(
    `${OPENF1}/location?session_key=${sessionKey}&driver_number=${pole.driver_number}` +
      `&date>=${iso(t0 - 2000)}&date<=${iso(t1 + 2000)}`,
  )) as { date: string; x: number; y: number; z: number }[] | null;
  const samples = (rows ?? [])
    .map((r) => ({ t: Date.parse(r.date), x: r.x, y: r.y, z: r.z }))
    .sort((a, b) => a.t - b.t);
  const after = samples.findIndex((s) => s.t >= t0);
  if (after < 1) return null;
  const [a, b] = [samples[after - 1], samples[after]];
  const f = (t0 - a.t) / (b.t - a.t);

  const drivers = (await fetchJson(
    `${OPENF1}/drivers?session_key=${sessionKey}&driver_number=${pole.driver_number}`,
  )) as { name_acronym: string }[] | null;
  const driverCode = drivers?.[0]?.name_acronym;
  if (typeof driverCode !== "string" || !/^[A-Z]{3}$/.test(driverCode)) {
    throw new Error(`session ${sessionKey}: no three-letter code for car ${pole.driver_number}`);
  }
  // Speed (km/h) either side of the lap start, interpolated to the moment it began.
  const speeds = ((await fetchJson(
    `${OPENF1}/car_data?session_key=${sessionKey}&driver_number=${pole.driver_number}` +
      `&date>=${iso(t0 - 2000)}&date<=${iso(t0 + 2000)}`,
  )) ?? []) as { date: string; speed: number }[];
  const telemetry = speeds.map((r) => ({ t: Date.parse(r.date), v: r.speed })).sort((p, q) => p.t - q.t);
  const next = telemetry.findIndex((s) => s.t >= t0);
  if (next < 1) throw new Error(`session ${sessionKey}: no car_data around the lap start`);
  const [u, w] = [telemetry[next - 1], telemetry[next]];
  const lineSpeedKmh = u.v + ((w.v - u.v) * (t0 - u.t)) / (w.t - u.t);

  return {
    driver: pole.driver_number,
    driverCode,
    seconds: pole.lap_duration!,
    lineSpeedMs: lineSpeedKmh / 3.6,
    path: samples.filter((s) => s.t >= t0 && s.t <= t1),
    start: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
  };
}

/** +1 if `path` runs the same way round as the track, -1 if the other way. */
function directionOn(track: Track, path: Point[]): number {
  let total = 0;
  let prev = project(track, path[0]).s;
  for (const p of path.slice(1)) {
    const s = project(track, p).s;
    total += unwrapDelta(prev, s, track.length);
    prev = s;
  }
  return Math.sign(total);
}

const percentile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

interface Built {
  hero: HeroCircuit;
  points: Point[];
  crossings: { x: number; y: number; over: number; under: number; zKnown: boolean }[];
  rawPoints: number;
  lengthM: number;
  boxRatio: number;
  metresPerBox: number;
  heroFitMeanM: number;
  start: string;
  merge14: MergeSpot[];
  mergeReal: MergeSpot[];
  realRoadWidth: number;
  pole: { lap: PoleLap; box: (Sample & Point)[]; p95: number; within: number; withinReal: number; pass: boolean } | null;
}

async function buildCircuit(hero: HeroCircuit): Promise<Built> {
  const coords = await fetchOutline(hero.id);
  const metres = smoothLoop(lonLatToMetres(coords), 0.5);
  const lengthM = loopLength(metres);

  // Into the hero's box: same place, orientation and size as today.
  const heroPoints = parsePath(hero.path);
  const toBox = alignLoops(metres, heroPoints, false);
  let dense = metres.map((p) => applySimilarity(toBox, p));
  const metresPerBox = lengthM / loopLength(dense);
  const denseTrack = buildTrack(dense, BOX_HALF_WIDTH);
  const heroFitMeanM =
    (heroPoints.reduce((sum, p) => sum + project(denseTrack, p).dist, 0) / heroPoints.length) * metresPerBox;

  // Start/finish and direction: the pole lap if it fits, else the hero's.
  const heroStartS = project(denseTrack, heroPoints[0]).s;
  let startS = heroStartS;
  let dir = directionOn(denseTrack, heroPoints);
  let start = "hero";
  let pole: Built["pole"] = null;
  const sessionKey = QUALIFYING[hero.id];
  const lap = sessionKey === undefined ? null : await fetchPoleLap(sessionKey);
  if (lap) {
    const toTrack = alignLoops(lap.path, dense, true);
    const box = lap.path.map((s) => ({ ...s, ...applySimilarity(toTrack, s) }));
    const dists = box.map((p) => project(denseTrack, p).dist);
    const p95 = percentile(dists, 0.95);
    const realHalf = REAL_HALF_WIDTH_M / metresPerBox;
    pole = {
      lap,
      box,
      p95,
      within: dists.filter((d) => d <= BOX_HALF_WIDTH).length / dists.length,
      withinReal: dists.filter((d) => d <= realHalf).length / dists.length,
      pass: p95 <= BOX_HALF_WIDTH,
    };
    if (pole.pass) {
      startS = project(denseTrack, applySimilarity(toTrack, lap.start)).s;
      dir = directionOn(denseTrack, box);
      const offsetM = unwrapDelta(heroStartS, startS, denseTrack.length) * metresPerBox;
      start = `pole (${offsetM >= 0 ? "+" : ""}${offsetM.toFixed(0)} m vs hero${dirAgrees(denseTrack, heroPoints, dir)})`;
    } else {
      start = "hero (pole fit failed)";
    }
  }

  if (dir < 0) {
    const startPoint = pointAt(denseTrack, startS);
    dense = [...dense].reverse();
    startS = project(buildTrack(dense, BOX_HALF_WIDTH), startPoint).s;
  }
  const points = resampleEven(dense, SPACING, startS);
  const track = buildTrack(points, BOX_HALF_WIDTH);

  const crossings = findCrossings(points).map((c) => {
    const z1 = pole ? zNear(pole.box, track, c.s1) : null;
    const z2 = pole ? zNear(pole.box, track, c.s2) : null;
    const zKnown = z1 !== null && z2 !== null;
    const secondOver = !zKnown || z2! > z1!;
    return { x: c.x, y: c.y, over: secondOver ? c.s2 : c.s1, under: secondOver ? c.s1 : c.s2, zKnown };
  });

  const realRoadWidth = (2 * REAL_HALF_WIDTH_M) / metresPerBox;
  return {
    hero,
    points,
    crossings,
    rawPoints: coords.length,
    lengthM,
    boxRatio: track.length / buildTrack(heroPoints, BOX_HALF_WIDTH).length,
    metresPerBox,
    heroFitMeanM,
    start,
    merge14: mergeSpots(points, 2 * BOX_HALF_WIDTH),
    mergeReal: mergeSpots(points, realRoadWidth),
    realRoadWidth,
    pole,
  };
}

function dirAgrees(track: Track, heroPoints: Point[], dir: number): string {
  return directionOn(track, heroPoints) === dir ? "" : ", REVERSED vs hero";
}

/** Elevation of the pass at lap distance s: the median z of the pole-lap
 *  samples within 30 box units of it along the lap. A median, because OpenF1
 *  can report one sample with the other level's height right at a crossover
 *  (Suzuka: one 800 among the 863s). */
function zNear(samples: Sample[], track: Track, s: number): number | null {
  const zs = samples
    .filter((p) => Math.abs(unwrapDelta(s, project(track, p).s, track.length)) <= 30)
    .map((p) => p.z);
  return zs.length === 0 ? null : percentile(zs, 0.5);
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (i: number, n: number) => ((100 * (((i % n) + n) % n)) / n).toFixed(1);
const spotText = (s: MergeSpot, n: number, mpb: number) =>
  `lap ${pct(s.a[0], n)}–${pct(s.a[1], n)}% ↔ ${pct(s.b[0], n)}–${pct(s.b[1], n)}%, ` +
  `gap ${s.minGap.toFixed(1)} box (${(s.minGap * mpb).toFixed(0)} m)`;

function moduleText(built: Built[]): string {
  const entries = built.map((b) => {
    // Only a pole lap that passed the reality check set this start/finish.
    const pole = b.pole?.pass ? b.pole.lap : null;
    const flat = b.points.flatMap((p) => [r1(p.x), r1(p.y)]);
    const lines: string[] = [];
    for (let i = 0; i < flat.length; i += 16) lines.push(`      ${flat.slice(i, i + 16).join(", ")},`);
    const crossings = b.crossings.map(
      (c) => `{ x: ${r1(c.x)}, y: ${r1(c.y)}, over: ${r1(c.over)}, under: ${r1(c.under)} }`,
    );
    return [
      "  {",
      `    id: ${JSON.stringify(b.hero.id)},`,
      `    name: ${JSON.stringify(b.hero.name)},`,
      `    round2026: ${b.hero.round2026},`,
      `    lengthM: ${b.hero.lengthM},`,
      `    poleS: ${pole ? pole.seconds : null},`,
      `    poleDriver: ${pole ? JSON.stringify(pole.driverCode) : null},`,
      `    lineSpeedMs: ${pole ? Math.round(pole.lineSpeedMs * 100) / 100 : null},`,
      `    crossings: [${crossings.join(", ")}],`,
      "    points: [",
      ...lines,
      "    ],",
      "  },",
    ].join("\n");
  });
  return `// GENERATED by scripts/build-lab-circuits.ts. Do not edit; re-run the script.
//
// The AI Lab's circuit outlines: bacinger/f1-circuits (MIT, OpenStreetMap
// geometry) smoothed and evenly resampled, in the same 0-1000 box as the
// homepage's heroCircuits.ts. The sim scales each one to metres by lengthM
// (track.ts labTrack). Start/finish is the first point and the points run in
// race direction.

export interface LabCircuit {
  id: string;
  name: string;
  round2026: number;
  /** Official lap length in metres. */
  lengthM: number;
  /** The 2026 qualifying pole lap (fastest OpenF1 lap of the session): time
   *  in seconds, driver code, and speed at the start/finish line in m/s.
   *  All null where there is no pole lap yet. */
  poleS: number | null;
  poleDriver: string | null;
  lineSpeedMs: number | null;
  /** Where the track passes over itself (Suzuka's bridge): the point, and the
   *  lap distance (box units from start/finish) of the upper and lower pass. */
  crossings: { x: number; y: number; over: number; under: number }[];
  /** Centreline as x0, y0, x1, y1, ... in box units, ${SPACING} apart. */
  points: number[];
}

/** OpenStreetMap's licence requires credit wherever these outlines render. */
export const LAB_CIRCUITS_ATTRIBUTION = ${JSON.stringify(HERO_CIRCUITS_ATTRIBUTION)};

export const LAB_CIRCUITS: LabCircuit[] = [
${entries.join("\n")}
];
`;
}

function overlaySvg(b: Built): string {
  const xs = b.points.map((p) => p.x);
  const ys = b.points.map((p) => p.y);
  const pad = 40;
  const [x0, y0] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
  const [w, h] = [Math.max(...xs) - x0 + pad, Math.max(...ys) - y0 + pad];
  const poly = (pts: Point[]) => pts.map((p) => `${r1(p.x)},${r1(p.y)}`).join(" ");
  const n = b.points.length;
  const [s0, s1] = [b.points[0], b.points[Math.round(30 / SPACING)]];
  const font = Math.max(w, h) / 45;
  const title = b.pole
    ? `${b.hero.name}: ${b.pole.lap.seconds.toFixed(3)} s pole lap (car ${b.pole.lap.driver}), p95 ${b.pole.p95.toFixed(1)} box / ${(b.pole.p95 * b.metresPerBox).toFixed(1)} m`
    : `${b.hero.name}: no 2026 pole lap yet, outline only`;
  const marks = b.merge14.flatMap((s) =>
    [s.a, s.b].map((r) => {
      const p = b.points[Math.round((r[0] + r[1]) / 2) % n];
      return `<circle cx="${r1(p.x)}" cy="${r1(p.y)}" r="${BOX_HALF_WIDTH * 1.4}" fill="none" stroke="#f08c00" stroke-width="2"/>`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${Math.round((1000 * h) / w)}" viewBox="${r1(x0)} ${r1(y0)} ${r1(w)} ${r1(h)}">
<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(w)}" height="${r1(h)}" fill="#fff"/>
<polygon points="${poly(b.points)}" fill="none" stroke="#e3e3e3" stroke-width="${2 * BOX_HALF_WIDTH}" stroke-linejoin="round"/>
<polygon points="${poly(b.points)}" fill="none" stroke="#b9b9b9" stroke-width="${r1(b.realRoadWidth)}" stroke-linejoin="round"/>
<polygon points="${poly(parsePath(b.hero.path))}" fill="none" stroke="#1f6feb" stroke-width="1" stroke-dasharray="6 4"/>
<polygon points="${poly(b.points)}" fill="none" stroke="#222" stroke-width="0.8"/>
${b.pole ? `<polyline points="${poly(b.pole.box)}" fill="none" stroke="#e5202e" stroke-width="1.4"/>` : ""}
${marks.join("\n")}
${b.crossings.map((c) => `<circle cx="${r1(c.x)}" cy="${r1(c.y)}" r="12" fill="none" stroke="#c026d3" stroke-width="2.5"/>`).join("\n")}
<circle cx="${r1(s0.x)}" cy="${r1(s0.y)}" r="6" fill="#2b8a3e"/>
<line x1="${r1(s0.x)}" y1="${r1(s0.y)}" x2="${r1(s0.x + (s1.x - s0.x) * 1.5)}" y2="${r1(s0.y + (s1.y - s0.y) * 1.5)}" stroke="#2b8a3e" stroke-width="3"/>
<text x="${r1(x0 + 10)}" y="${r1(y0 + font * 1.3)}" font-family="sans-serif" font-size="${r1(font)}">${title}</text>
<text x="${r1(x0 + 10)}" y="${r1(y0 + font * 2.5)}" font-family="sans-serif" font-size="${r1(font * 0.7)}" fill="#555">light grey: lab road (±14 box) · darker grey: real ±7.5 m · black: new centreline · blue dashed: old hero outline</text>
<text x="${r1(x0 + 10)}" y="${r1(y0 + font * 3.4)}" font-family="sans-serif" font-size="${r1(font * 0.7)}" fill="#555">red: real pole lap · orange: merge spots at ±14 box · purple: crossing · green: start + direction</text>
</svg>`;
}

async function saveOverlays(built: Built[], dir: string): Promise<void> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const b of built) {
      await page.setContent(`<body style="margin:0">${overlaySvg(b)}</body>`);
      const file = join(dir, `24-${b.pole ? "overlay" : "outline"}-${b.hero.id}.png`);
      await page.locator("svg").screenshot({ path: file });
    }
  } finally {
    await browser.close();
  }
}

const overlayArg = process.argv.indexOf("--overlays");
const overlayDir = overlayArg >= 0 ? process.argv[overlayArg + 1] : null;

const built: Built[] = [];
for (const hero of [...HERO_CIRCUITS].sort((a, b) => a.round2026 - b.round2026)) {
  built.push(await buildCircuit(hero));
  console.error(`built ${hero.id}`);
}
writeFileSync(OUT_FILE, moduleText(built));

console.log(
  "| Circuit | Raw pts → points | Length vs official | Box length vs today | Hero fit (mean) | Start/finish | Merge spots ±14 box | Merge spots ±7.5 m | Pole lap p95 (box / m) | Within ±14 box / ±7.5 m | Reality check |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const b of built) {
  const off = ((b.lengthM / b.hero.lengthM - 1) * 100).toFixed(1);
  const p = b.pole;
  console.log(
    `| ${b.hero.id} | ${b.rawPoints} → ${b.points.length} | ${b.lengthM.toFixed(0)} / ${b.hero.lengthM} m (${off}%) | ` +
      `${((b.boxRatio - 1) * 100).toFixed(1)}% | ${b.heroFitMeanM.toFixed(1)} m | ${b.start} | ${b.merge14.length} | ${b.mergeReal.length} | ` +
      (p
        ? `${p.p95.toFixed(1)} / ${(p.p95 * b.metresPerBox).toFixed(1)} | ${(p.within * 100).toFixed(0)}% / ${(p.withinReal * 100).toFixed(0)}% | ${p.pass ? "PASS" : "FAIL"} |`
        : "— | — | no pole lap |"),
  );
}
console.log("\nMerge spots and crossings (lap % from start/finish, in race direction):");
for (const b of built) {
  const n = b.points.length;
  const lapPct = (s: number) => ((100 * s) / loopLength(b.points)).toFixed(1);
  console.log(`\n${b.hero.id} (1 box = ${b.metresPerBox.toFixed(2)} m)`);
  for (const s of b.merge14) console.log(`  ±14 box: ${spotText(s, n, b.metresPerBox)}`);
  for (const s of b.mergeReal) console.log(`  ±7.5 m:  ${spotText(s, n, b.metresPerBox)}`);
  for (const c of b.crossings) {
    console.log(
      `  crossing at (${r1(c.x)}, ${r1(c.y)}): over at ${lapPct(c.over)}%, under at ${lapPct(c.under)}%` +
        (c.zKnown ? " (from pole-lap elevation)" : " (no elevation data: over/under is a guess)"),
    );
  }
}

if (overlayDir) await saveOverlays(built, overlayDir);
