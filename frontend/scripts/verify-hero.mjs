// Hero screenshot + console-error harness.
//
// Both modes × desktop and mobile, a mid-draw-in frame as well as the settled
// state, the reduced-motion state, three extra circuits driven through the race
// picker, a per-capture console-error COUNT (not just non-empty logs), a
// configurable output dir, and a requestAnimationFrame audit that proves the
// loop actually stops.
//
//   node scripts/verify-hero.mjs [outDir] [baseUrl]
//
// Needs the FastAPI backend on :8000 and `npm run dev` on :5173 (dev.ps1 starts
// both; ALLOW_DEV_ORIGINS=1 is load-bearing for CORS).
//
// REPORTING UNITS. `rate()` divides by its window and returns a RATE (per
// second). Phase 1's column is a raw COUNT over a stated window. An earlier
// report printed a count as "frames/s"; the two are labelled distinctly here so
// that cannot happen again.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outDir = resolve(process.argv[2] ?? "./hero-shots");
const baseUrl = process.argv[3] ?? "http://localhost:5173";
mkdirSync(outDir, { recursive: true });

// "Is a loop still running" is measured, not eyeballed. Two probes:
//
//  __rafCount   every rAF callback on the page. Necessary but NOT sufficient:
//               framer-motion's whileInView reveals fire as you scroll, so a
//               non-zero reading here does not mean the hero is animating.
//  __heroFrames DOM mutations on the elements only the hero's loop writes to —
//               the two light <g>s' `transform`, and the `style` attribute on
//               the track and the two gap arcs (the loop writes dash geometry
//               and opacity through .style). This is the number that actually
//               attributes work to the hero.
const RAF_PROBE = `
  window.__rafCount = 0;
  const _raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => _raf((t) => { window.__rafCount++; return cb(t); });

  window.__heroFrames = 0;
  window.__heroWatch = () => {
    const svg = document.querySelector(".hero-circuit__svg");
    if (!svg) return false;
    const lights = svg.querySelectorAll(".hero-circuit__light");
    const painted = svg.querySelectorAll(".hero-circuit__track, .hero-circuit__arc");
    // The guard is the point of this harness: attaching to nothing would make
    // every later measurement vacuously zero, which reads as a PASS.
    if (lights.length === 0 || painted.length === 0) return false;
    const mo = new MutationObserver((recs) => { window.__heroFrames += recs.length; });
    lights.forEach((el) =>
      mo.observe(el, { attributes: true, attributeFilter: ["transform", "style"] }));
    painted.forEach((el) =>
      mo.observe(el, { attributes: true, attributeFilter: ["style"] }));
    return true;
  };
`;

const browser = await chromium.launch();
const results = [];

// One shared API response cache across every capture. Without it, a dozen fresh
// contexts × ~12 calls each blows through the backend's 120-req/60s rate limit
// partway through the run and the later captures render with no lap data. It
// also makes every mode/width capture show the SAME race, which is what you
// want when comparing them.
const apiCache = new Map();
async function cacheApi(context) {
  await context.route("**/api/**", async (route) => {
    const key = route.request().url();
    if (!apiCache.has(key)) {
      const res = await route.fetch();
      apiCache.set(key, {
        status: res.status(),
        headers: res.headers(),
        body: await res.body(),
      });
    }
    await route.fulfill(apiCache.get(key));
  });
}

async function openPage({ width, height, colorScheme, reducedMotion = "no-preference" }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme, reducedMotion });
  await context.addInitScript(RAF_PROBE);
  // The app's mode store prefers an explicit localStorage choice over
  // prefers-color-scheme, so clear it and let colorScheme decide.
  await context.addInitScript(() => { try { localStorage.removeItem("f1-tracker-mode"); } catch {} });
  await cacheApi(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  return { context, page, errors };
}

async function waitForHero(page, name, errors) {
  try {
    await page.waitForSelector(".hero-circuit__svg", { timeout: 15000 });
  } catch (err) {
    // A bare timeout hides WHY the stage is missing (usually: the race did not
    // resolve to a circuit). Say which, so the failure is diagnosable.
    const state = await page.evaluate(() => ({
      stage: !!document.querySelector(".hero-circuit__stage"),
      narration: document.querySelector(".hero-circuit__narration")?.textContent ?? "no narration",
    }));
    throw new Error(
      `${name}: circuit never rendered — ${JSON.stringify(state)}; console: ${errors.slice(0, 3).join(" | ") || "clean"}`,
      { cause: err },
    );
  }
}

/** The hero's own race picker is the first GlassSelect on the page (#hero is
 *  the first section); Telemetry has a second one further down. */
async function pickRace(page, locationPrefix) {
  await page.click(".hero-body__race .glass-select__trigger");
  await page.waitForSelector('[role="option"]');
  await page.locator('[role="option"]', { hasText: locationPrefix }).first().click();
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function capture(name, opts) {
  const { midDraw = false, race = null } = opts;
  const { context, page, errors } = await openPage(opts);
  await waitForHero(page, name, errors);
  if (race) {
    await pickRace(page, race);
    await page.waitForTimeout(1200);
  }
  // The stage fades in on the landing cascade at 0.35s and the rAF draw-in
  // runs 1300ms after that, so "settled" is ~1.7s; 4200ms is comfortable.
  await page.waitForTimeout(midDraw ? 900 : 4200);
  await page.screenshot({ path: `${outDir}/${name}.png` });

  const rafAfterSettle = await page.evaluate(() => window.__rafCount);
  await page.waitForTimeout(1500);
  const rafLater = await page.evaluate(() => window.__rafCount);

  results.push({ name, errors: errors.length, rafDelta: rafLater - rafAfterSettle, sample: errors[0] ?? "" });
  await context.close();
}

for (const mode of ["dark", "light"]) {
  for (const [tier, width, height] of [["desktop", 1400, 900], ["mobile", 390, 844]]) {
    await capture(`${mode}-${tier}-settled`, { width, height, colorScheme: mode });
    await capture(`${mode}-${tier}-middraw`, { width, height, colorScheme: mode, midDraw: true });
  }
  await capture(`${mode}-desktop-reduced`, { width: 1400, height: 900, colorScheme: mode, reducedMotion: "reduce" });
}

// Extra circuits. The ten captures above all render Budapest (hu-1986) because
// `selected` defaults to races.data[0] and /api/races is newest-first — which is
// a useful case (narrowest raced circuit, aspect 0.88, unrotated) but only one.
// These three are chosen to isolate the pit-normal corrections:
//
//   Montreal ca-1978  aspect 3.08  rotated 90°  pit side OUTER  — rotation AND
//                                                                 outer in one
//   Miami    us-2022  aspect 2.52  unrotated    pit side OUTER  — the side flip
//                                                                 without the
//                                                                 rotation
//   Monaco   mc-1929  aspect 1.32  rotated 90°  pit side inner  — self-crossing
//                                                                 path; its side
//                                                                 was wrong in an
//                                                                 earlier guess
//
// All three are among the 11 races that HAVE lap data. Jeddah and Sakhir are
// cancelled (no laps), so they can only ever render a static outline and belong
// in the manual degradation check, not here.
for (const [name, location] of [
  ["dark-desktop-montreal", "Montréal"],
  ["dark-desktop-miami", "Miami"],
  ["dark-desktop-monaco", "Monte Carlo"],
]) {
  await capture(name, { width: 1400, height: 900, colorScheme: "dark", race: location });
}

console.log("\ncapture                      console errors   rAF CALLBACKS counted in a later 1.5s window");
for (const r of results) {
  console.log(
    `${r.name.padEnd(28)} ${String(r.errors).padStart(6)}   ${String(r.rafDelta).padStart(6)}` +
    (r.sample ? `   first: ${r.sample.slice(0, 90)}` : ""),
  );
}
const totalErrors = results.reduce((a, r) => a + r.errors, 0);
console.log(`\ntotal console errors across ${results.length} captures: ${totalErrors}`);
console.log(`screenshots: ${outDir}`);

// ---- phase 2: does the loop actually stop? -------------------------------
async function open(reducedMotion = "no-preference") {
  const { context, page, errors } = await openPage({ width: 1400, height: 900, colorScheme: "dark", reducedMotion });
  await waitForHero(page, "phase2", errors);
  if (!(await page.evaluate(() => window.__heroWatch()))) {
    throw new Error("hero watcher failed to attach — the measurement would be vacuously zero");
  }
  return { ctx: context, page };
}
/** [all rAF callbacks/s, hero-attributable mutations/s] — a RATE, divided by
 *  the sampling window. */
async function rate(page, ms = 2000) {
  const a = await page.evaluate(() => [window.__rafCount, window.__heroFrames]);
  await page.waitForTimeout(ms);
  const b = await page.evaluate(() => [window.__rafCount, window.__heroFrames]);
  return [((b[0] - a[0]) / ms) * 1000, ((b[1] - a[1]) / ms) * 1000];
}

const rm = await open("reduce");
await rm.page.waitForTimeout(6000);
const baseline = await rate(rm.page);
await rm.ctx.close();

const s = await open();
await s.page.waitForTimeout(6000); // stage fade 350ms + draw-in 1300ms
const visible = await rate(s.page);
await s.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await s.page.waitForTimeout(800);
const offscreen = await rate(s.page);
await s.page.evaluate(() => window.scrollTo(0, 0));
await s.page.waitForTimeout(800);
const back = await rate(s.page);
await s.page.evaluate(() => {
  Object.defineProperty(document, "hidden", { value: true, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
await s.page.waitForTimeout(600);
const hidden = await rate(s.page);

console.log("\nrAF audit — RATES (per second). 'hero mutations/s' is the attributable");
console.log("column; the raw rAF column includes framer-motion's scroll reveals.\n");
const row = (k, v) => console.log(`  ${k.padEnd(32)} ${v[0].toFixed(1).padStart(7)} rAF/s ${v[1].toFixed(1).padStart(9)} hero mutations/s`);
row("reduced motion (baseline)", baseline);
row("visible, 6s after load", visible);
row("scrolled out of view", offscreen);
row("scrolled back into view", back);
row("tab hidden", hidden);

const fails = [];
// The circuit hero is a CONTINUOUS loop, not a one-shot draw-in: while it is
// visible and un-hidden it must always be moving. The predecessor legitimately
// stopped once its draw-in finished, and this block used to treat a zero here
// as "idle sweep off — PASS". That branch is deliberately gone: for this hero a
// zero while visible means the loop is dead (or the watcher attached to
// elements nothing writes to), and reporting it as a PASS is exactly the
// vacuous measurement the watcher's guard exists to prevent. It has already
// caught one real bug — a ResizeObserver that never attached, which left the
// frame loop returning early on a zero path length.
if (visible[1] <= 0) fails.push("visible hero is NOT animating (0/s) — loop dead or watcher blind");
if (baseline[1] !== 0) fails.push(`reduced motion animates (${baseline[1]}/s)`);
if (offscreen[1] !== 0) fails.push(`offscreen animates (${offscreen[1]}/s)`);
if (hidden[1] !== 0) fails.push(`tab-hidden animates (${hidden[1]}/s)`);
if (back[1] <= 0) fails.push("did not resume on scroll back");
console.log(
  fails.length
    ? `  FAIL: ${fails.join("; ")}`
    : "  PASS: animates only while visible and un-hidden, and resumes",
);

// ---- phase 3: a race switch replays the draw-in with no stale state ------
// Undo phase 2's tab-hidden simulation first: leaving it set would (correctly)
// keep the loop paused, and phase 3 would then measure the pause, not the replay.
await s.page.evaluate(() => {
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
await s.page.waitForTimeout(400);

const before = await s.page.locator(".hero-circuit__svg").getAttribute("aria-label");
await s.page.click(".hero-body__race .glass-select__trigger");
await s.page.waitForSelector('[role="option"]');
const opts = s.page.locator('[role="option"]');
// Pick a race that is not the current one.
await opts.nth((await opts.count()) > 3 ? 3 : 1).click();
// Playwright scrolls the option into view to click it, which pushes the hero
// off-screen — and the IntersectionObserver then (correctly) holds the loop.
// Scroll back so what we measure is the replay, not the pause.
await s.page.evaluate(() => window.scrollTo(0, 0));
await s.page.waitForTimeout(700);
// The draw-in holds both lights at opacity 0 until the track has finished
// drawing itself, so the lowest light opacity seen is the replay probe: 0 means
// the draw-in re-ran, and a settled value above 0 means it completed.
const drawState = () => s.page.evaluate(() => {
  const svg = document.querySelector(".hero-circuit__svg");
  const track = svg.querySelector(".hero-circuit__track");
  const lights = [...svg.querySelectorAll(".hero-circuit__light")];
  return {
    dashoffset: Number(track.style.strokeDashoffset || 0),
    light: lights.length ? Math.min(...lights.map((g) => Number(g.style.opacity || 0))) : null,
  };
});
// The new race's laps are a fresh ~650KB fetch, so the model swaps at an
// unpredictable moment. Poll for the LOWEST light opacity seen rather than
// point-sampling and hoping to land inside the ~1.3s draw window.
let minLight = 1;
for (let i = 0; i < 90; i++) {
  const l = await drawState();
  if (l.light !== null) minLight = Math.min(minLight, l.light);
  await s.page.waitForTimeout(100);
}
const after = await s.page.locator(".hero-circuit__svg").getAttribute("aria-label");
const settled = await drawState();
await s.page.locator(".hero-circuit").screenshot({ path: `${outDir}/after-race-switch.png` });
console.log("\nrace switch");
console.log(`  aria-label before : ${before}`);
console.log(`  aria-label after  : ${after}`);
console.log(`  re-modelled       : ${before !== after ? "yes" : "SAME LABEL — check the switch landed"}`);
console.log(`  lowest light opacity seen during the switch: ${minLight}`);
console.log(`  settled state     : ${JSON.stringify(settled)}`);
const replayed = before !== after && minLight === 0 && settled.light > 0;
console.log(`  ${replayed ? "PASS" : "FAIL"}: draw-in ${replayed ? "re-ran from scratch and completed" : "did not replay cleanly"}`);

await s.ctx.close();
await browser.close();
