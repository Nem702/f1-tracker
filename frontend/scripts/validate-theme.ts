/**
 * Validates the shipped theme against the numeric claims theme.ts's header
 * makes. Run it: `npm run validate:theme`.
 *
 * For a digest instead of the full report: `npm run validate:theme -- --summary`.
 * The bare `--` is REQUIRED. Without it npm parses `--summary` as one of its own
 * config flags, never passes it through, and silently prints the full report —
 * which looks exactly like the flag not being implemented.
 *
 * It imports `src/theme.ts` DIRECTLY (node --experimental-strip-types) rather
 * than re-declaring any colour, so there is exactly one source of truth and the
 * checks can never drift from what renders. Every surface below is COMPOSITED
 * from the tokens — flattening the translucent fills is most of the point, so a
 * later nudge to `pageBase` re-derives every denominator automatically instead
 * of silently invalidating a hardcoded one.
 *
 * Colour maths is ported from the dataviz skill's validate_palette.js so the
 * numbers stay comparable to the ones the header cites: OKLab ΔE ×100, CVD via
 * Machado-Oliveira-Fernandes (2009) at severity 1.0, WCAG relative-luminance
 * contrast. Alpha compositing is plain source-over in gamma-encoded sRGB, which
 * is what browsers do for ordinary blending.
 *
 * Statuses:
 *   PASS  clear
 *   THIN  passes, but within 0.1 of its floor — deliberately called out so a
 *         thin margin never looks identical to a comfortable one, and so the
 *         next person to nudge a token can see what they're eating into
 *   WARN  inside a documented relief/floor band: legal only because the
 *         mandated secondary encoding is present
 *   FAIL  below the floor — the only status that exits non-zero
 *
 * A status may carry a LABEL, rendered inside the cell as `[WARN drift]`. It
 * sub-classes a status without being one: counting and the exit code switch on
 * the status alone, so a label can never move a total.
 *
 * BRAND SEEDS. Everything above compares derived colours against other DERIVED
 * colours, which cannot see a team's plate landing on another team's real-world
 * brand. `src/theme.seeds.ts` records the OpenF1 `team_colour` each palette was
 * seeded off so two more things can be measured — see `checkBrandSeeds` and
 * `checkSeedIsolation`. That module is validator-only, and the `provenance`
 * check FAILs if anything under src/ ever imports it.
 *
 * TWO ΔE METRICS LIVE HERE, ON PURPOSE. Driver/swatch separation uses worst-of-
 * protan/deutan, because those colours render side by side and the task is
 * telling them apart. Plate-vs-rival-seed uses PLAIN OKLab, because the task is
 * brand confusion for ordinary colour vision and the seed is never rendered at
 * all. Both numbers print on every seed row.
 *
 * The concrete trap: Ferrari against Audi is ΔE 1.7 plain and 0.9 CVD. This
 * script prints 1.7; PLAN-full-grid-and-logos.md §3 records 0.9. Both are right
 * — same pair, two metrics. Do not "reconcile" them by changing one.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { BADGE_INK, BADGE_PLATE, BADGE_RING, getTheme, teamSwatch, tintForPair } from "../src/theme.ts";
import type { Mode, Theme, Tint } from "../src/theme.ts";
import { TEAM_SEEDS } from "../src/theme.seeds.ts";
import { TEAM_ORDER } from "../src/teams.ts";
import type { DriverRef, TeamSlug } from "../src/teams.ts";

// ---- thresholds -------------------------------------------------------------

const AA = 4.5; // WCAG AA, normal text
const AA_LARGE = 3.0; // WCAG AA, >=24px or >=18.66px bold
const NON_TEXT = 3.0; // WCAG non-text / graphical object
const THIN_MARGIN = 0.1; // "passing, but only just"

// ONE floor governs driver-colour separation: ΔE 8 (OKLab ×100, worst of
// protan/deutan). It is what theme.ts's CVD_COLLISIONS table has always used as
// its inclusion criterion, and it matches the dataviz categorical CVD target.
//
// 12 is a TARGET, not a second floor, and it applies to ONE case: a team's own
// two drivers, the pair the default view shows. That pair cannot be remedied by
// the collision table — a team's drivers must wear their team's two slot
// colours — so 8-12 reports WARN and leans on the secondary encoding every
// chart carries (legend + acronym end-labels + tooltip + table).
//
// Cross-team (head-to-head) pairs have a remedy, so they get no relief band:
// below 8 the pair belongs in CVD_COLLISIONS, which routes it through the
// documented slot-swap. Nothing in this project uses a floor of 6.
const CVD_FLOOR = 8;
const CVD_TEAM_TARGET = 12;

/** Same ΔE 8, different metric and different consequence: how close a team's
 *  plate may come to a RIVAL's brand seed before it starts reading as that
 *  rival's colour. Plain OKLab (see the header), and WARN-only — the seeds
 *  collide with each other at source, so no derivation can clear this for every
 *  pair and a FAIL would be unsatisfiable. */
const SEED_FLOOR = 8;

/** Hero3D's pace ramp: how far a driver colour must travel between the ramp's
 *  two alpha endpoints for the ramp to still encode pace. Named because the
 *  THIN threshold is now load-bearing twice — it sets the status band AND
 *  decides which colours get named in the check's key (see checkHero3D). */
const RAMP_FLOOR = 2.5;
const RAMP_THIN = 2.0;

/** Failures the project has explicitly accepted, keyed `<group>|<check>`. Each
 *  carries its measured value at acceptance and the reason. A FAIL listed here
 *  reports WARN and does not fail the run.
 *
 *  This exists so an accepted exception is DECLARED rather than remembered —
 *  the alternative is a number someone silently re-breaks later. Entries that
 *  stop firing are reported as stale below, so a fixed exception gets deleted
 *  instead of quietly outliving the problem it excused. */
const ACCEPTED: Record<string, string> = {
  "dark · ink|inkMuted on chip":
    "4.42:1, pre-existing. --glass2 over the dark page gives inkMuted too little to work with, " +
    "and the dark palette is frozen by the light-mode pass. Outstanding work, logged in docs/DESIGN-DECISIONS.md.",

  // Scoped to these two colours BY NAME — see checkHero3D for why the check
  // builds its own key. Exempting `pace ramp perceptible` as a bare check name
  // would pass every future near-page-value colour silently, and near-neutral
  // brands are exactly what trips it.
  "light · hero3D pace ramp|pace ramp perceptible (audi1 #d69493, haas0 #a1a5aa)":
    "ΔE 1.62 (haas0) and 1.79 (audi1) across the 0.03–0.13 light ramp. Both sit close to the light " +
    "page (#dedcd9) in value, so compositing them at the ramp's two alphas barely moves them — Haas's " +
    "near-neutral silver and Audi's pale rose are light BY BRAND, so darkening them to satisfy a " +
    "secondary encoding would trade the thing being encoded for the encoding. Widening the ramp was " +
    "rejected too: heroGlowMax is a shared mode token, so it would change Hero3D for the four shipped " +
    "teams and reopen the light-mode pass's decision to compress the ramp rather than flatten it. " +
    "Pace still reads from the line's shape and the hero legend. Logged in docs/STATE.md.",

  "dark · badge ring|ring vs chip on stacked aurora blobs (worst: astonmartin)":
    "2.71:1, below the 3:1 floor. `.aurora` is position:fixed, so its three 920px blob circles are glued " +
    "to the viewport, not to page content, and geometrically overlap on an ordinary laptop viewport — the " +
    "switcher chip can pass under all three cores stacked. Aston Martin's green pushes the composited " +
    "background's luminance closest to the ring's own, of all 11 teams. No token fix: darkening the ring " +
    "moves it off its Round 5 derivation (a settled translucent-over-page composite), and the blobs are " +
    "core to the dark identity. Logged in docs/STATE.md; if the worst team ever changes this key stops " +
    "matching and the FAIL stands, by design.",
};

// ---- colour maths (ported from dataviz validate_palette.js) -----------------

type RGB = [number, number, number];

const MACHADO: Record<string, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

function parseHex(hex: string): RGB {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

/** Any CSS colour this theme actually uses: #rgb/#rrggbb or rgb()/rgba(). */
function parseColor(css: string): { rgb: RGB; a: number } {
  const s = css.trim();
  if (s.startsWith("#")) return { rgb: parseHex(s), a: 1 };
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`unparseable colour: ${css}`);
  const p = m[1].split(/[,/]/).map((x) => parseFloat(x.trim()));
  return { rgb: [p[0], p[1], p[2]], a: p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1 };
}

const toHex = (c: RGB): string =>
  "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** Source-over composite of a (possibly translucent) fill onto an opaque hex. */
function over(fill: string, bgHex: string): string {
  const { rgb, a } = parseColor(fill);
  const bg = parseHex(bgHex);
  return toHex([0, 1, 2].map((i) => rgb[i] * a + bg[i] * (1 - a)) as RGB);
}

/** CSS color-mix(in srgb, top p%, bottom) — premultiplied, alpha preserved.
 *  Needed because the tinted chip/insight fills mix a solid accent into an
 *  already-translucent fill, so the naive "wash over card" number is wrong. */
function colorMix(top: string, pct: number, bottom: string): string {
  const t = parseColor(top);
  const b = parseColor(bottom);
  const q = 1 - pct;
  const a = pct * t.a + q * b.a;
  if (a === 0) return "rgba(0, 0, 0, 0)";
  const rgb = [0, 1, 2].map((i) => (pct * t.a * t.rgb[i] + q * b.a * b.rgb[i]) / a) as RGB;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const linearOf = (hex: string): RGB => parseHex(hex).map((v) => srgbToLinear(v / 255)) as RGB;

function relLuminance(hex: string): number {
  const [r, g, b] = linearOf(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function oklab([r, g, b]: RGB): RGB {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklch(hex: string): { L: number; C: number } {
  const [L, a, b] = oklab(linearOf(hex));
  return { L, C: Math.hypot(a, b) };
}

function simulate(hex: string, kind: string): RGB {
  const [r, g, b] = linearOf(hex);
  const M = MACHADO[kind];
  const clamp = (c: number) => Math.max(0, Math.min(1, c));
  return [
    clamp(M[0][0] * r + M[0][1] * g + M[0][2] * b),
    clamp(M[1][0] * r + M[1][1] * g + M[1][2] * b),
    clamp(M[2][0] * r + M[2][1] * g + M[2][2] * b),
  ];
}

function deltaE(a: string, b: string, kind?: string): number {
  const x = oklab(kind ? simulate(a, kind) : linearOf(a));
  const y = oklab(kind ? simulate(b, kind) : linearOf(b));
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Worst of protan/deutan — the number the header quotes. */
const cvdDeltaE = (a: string, b: string): number =>
  Math.min(deltaE(a, b, "protan"), deltaE(a, b, "deutan"));

// ---- report -----------------------------------------------------------------

type Status = "PASS" | "THIN" | "WARN" | "FAIL";

interface Row {
  group: string;
  check: string;
  value: string;
  status: Status;
  /** Optional sub-class, rendered inside the status cell as `[WARN drift]`.
   *  Deliberately a label rather than a Status member: two kinds of WARN need
   *  telling apart in the report, but neither the counts nor the exit code
   *  should have to learn a new case to do it. */
  label?: string;
}

const rows: Row[] = [];
const acceptedFired = new Set<string>();

function add(group: string, check: string, value: string, status: Status, label?: string): void {
  const id = `${group}|${check}`;
  if (status === "FAIL" && id in ACCEPTED) {
    acceptedFired.add(id);
    rows.push({ group, check, value: `${value} — ACCEPTED: ${ACCEPTED[id]}`, status: "WARN", label });
    return;
  }
  rows.push({ group, check, value, status, label });
}

/** Every contrast margin seen, so the tightest can be reported at the end.
 *  A check that passes at 4.52 and one that passes at 17.2 read identically in
 *  the table; the difference is which one the next token nudge breaks. */
const margins: { id: string; value: number; floor: number }[] = [];

/** How far each plate sits from its OWN brand seed. Collected, not checked:
 *  there is no floor and no status, because drift is the BILL for clearing the
 *  contrast and CVD floors, not a defect. McLaren's light accent is 0.8 off its
 *  brand; Mercedes' is 13.3. Printed so that bill stays visible rather than
 *  accumulating silently, one palette pass at a time. */
const drift: { mode: Mode; team: TeamSlug; plate: string; seed: string; value: number }[] = [];

/** How tintForPair actually ROUTED every cross-team ordering, per mode.
 *
 *  These counts used to live in theme.ts's header as prose ("2 fall through to
 *  neutral") and drifted, because nothing recomputed them. They are the
 *  honest measure of how much work the collision table is doing: at 4 teams
 *  the reassignment was a rare exception, and the header's "colour follows the
 *  entity" invariant read as true. Printing the numbers is what keeps that
 *  claim answerable instead of remembered. */
const routing: {
  mode: Mode; total: number; swapped: number; neutral: number; unchanged: number;
  worst: number; worstId: string;
}[] = [];

/** Contrast against a floor, with the "passing but only just" band. */
function ratio(group: string, check: string, fg: string, bg: string, floor = AA): number {
  const v = contrast(fg, bg);
  const status: Status = v < floor ? "FAIL" : v < floor + THIN_MARGIN ? "THIN" : "PASS";
  add(group, check, `${v.toFixed(2)}:1 vs ${bg}`, status);
  margins.push({ id: `${group} · ${check}`, value: v, floor });
  return v;
}

/** A non-text MARK (chart series, compound, flag, swatch) against its ground.
 *  Sub-3:1 is the documented relief band rather than a failure: it is legal
 *  precisely because the mandated secondary encoding is present — every chart
 *  carries legend + acronym end-labels + tooltip + table, and every swatch sits
 *  beside its own team name. Reported so the relief stays visible, not silent. */
function mark(group: string, check: string, fg: string, bg: string): void {
  const v = contrast(fg, bg);
  add(group, check, `${v.toFixed(2)}:1 (${fg})`,
    v >= NON_TEXT + THIN_MARGIN ? "PASS" : v >= NON_TEXT ? "THIN" : "WARN");
}

/** Separation against target/floor bands. THIN doesn't apply — a 0.1 margin is
 *  meaningless on the ΔE scale; the WARN band is the equivalent signal. */
function separation(group: string, check: string, a: string, b: string, target = CVD_TEAM_TARGET, floor = CVD_FLOOR): number {
  const v = cvdDeltaE(a, b);
  const status: Status = v < floor ? "FAIL" : v < target ? "WARN" : "PASS";
  add(group, check, `ΔE ${v.toFixed(1)} (${a} ↔ ${b})`, status);
  return v;
}

// ---- the surfaces every check is measured against ---------------------------

/** Every opaque ground a colour can actually land on, composited from tokens.
 *  Order matters: the plate sits INSIDE a card, not on the page, and a card can
 *  sit on either band — so the worst case is a card on the darker band. */
function surfacesOf(t: Theme) {
  // The page wash runs pageLift (top) → pageBase (bottom); pageBase is
  // therefore the darker stop and the worst-case ground for dark-on-light ink.
  const page = t.pageBase;
  const pageTop = t.pageLift;
  const pageBand = over(t.bandVeil, page); // alternating [data-band="b"] sections
  // In light the veil darkens, in dark it lightens — so "worst" is whichever
  // ground the ink has least contrast against, not a fixed one.
  const worstPage = contrast(t.inkMuted, pageBand) < contrast(t.inkMuted, page) ? pageBand : page;

  const card = over(t.glass, worstPage); // .glass on the page
  const cardSolid = over(t.cardSolid, worstPage); // .card--solid (chart cards)
  const cardOpaque = over(t.glassOpaque, worstPage); // @supports fallback
  const plate = over(t.plate, cardSolid); // .card__plate, inside a chart card
  const chip = over(t.glass2, worstPage); // .glass2 pills / active chips
  const menu = over(t.glassMenu, card); // GlassSelect popup, over a card

  return { page, pageTop, pageBand, worstPage, card, cardSolid, cardOpaque, plate, chip, menu };
}

type Surfaces = ReturnType<typeof surfacesOf>;

const tintFor = (slug: TeamSlug): Tint => ({
  teamSlug: slug,
  a: { team: slug, slot: 0 },
  b: { team: slug, slot: 1 },
});

const NEUTRAL_TINT: Tint = { teamSlug: null, a: "neutral", b: "neutral" };

/** A stand-in driver for a (team, slot) — tintForPair only reads teamSlug and
 *  slot, so the identity fields just have to be present and distinct. */
const driverRef = (teamSlug: TeamSlug, slot: 0 | 1): DriverRef => ({
  number: 0,
  acronym: `${teamSlug}${slot}`,
  lastName: teamSlug,
  fullName: teamSlug,
  teamSlug,
  slot,
});

// ---- checks -----------------------------------------------------------------

function checkStack(mode: Mode, t: Theme, s: Surfaces): void {
  const g = `${mode} · layer stack`;
  // The two modes separate surfaces by DIFFERENT mechanisms, so holding them to
  // one value-step floor would be wrong in both directions. Light carries the
  // separation in value (that is the whole point of this stack), so it is held
  // to a floor where a large flat area still reads as a distinct surface. Dark
  // carries it in the EDGE — a bright hairline plus glow — with value as a
  // supporting cue only, so its floor is just "not literally identical".
  const stepFloor = mode === "light" ? 0.045 : 0.015;
  const insetFloor = mode === "light" ? 0.03 : 0.012;

  const step = oklch(s.card).L - oklch(s.worstPage).L;
  add(g, "page → card step", `ΔL ${step.toFixed(3)} (${s.worstPage} → ${s.card})`,
    Math.abs(step) >= stepFloor ? "PASS" : Math.abs(step) >= stepFloor * 0.67 ? "THIN" : "FAIL");

  const inset = oklch(s.cardSolid).L - oklch(s.plate).L;
  add(g, "card → plate step", `ΔL ${inset.toFixed(3)} (${s.cardSolid} → ${s.plate})`,
    Math.abs(inset) >= insetFloor ? "PASS" : Math.abs(inset) >= insetFloor * 0.67 ? "THIN" : "FAIL");

  // The tier that got collapsed: cardSolid/glassOpaque/glass must NOT read as
  // three separate levels. Anything above ~0.02 is a fourth tier sneaking back.
  const spread = Math.max(oklch(s.card).L, oklch(s.cardSolid).L, oklch(s.cardOpaque).L)
    - Math.min(oklch(s.card).L, oklch(s.cardSolid).L, oklch(s.cardOpaque).L);
  add(g, "card tier is ONE tier", `ΔL spread ${spread.toFixed(3)} across glass/glassOpaque/cardSolid`,
    spread <= 0.02 ? "PASS" : spread <= 0.03 ? "THIN" : "FAIL");

  add(g, "page wash spread", `ΔL ${(oklch(s.pageTop).L - oklch(s.page).L).toFixed(3)} (${s.pageTop} → ${s.page})`, "PASS");
  add(g, "band veil", `${t.bandVeil} → ${s.pageBand} (ΔL ${(oklch(s.pageBand).L - oklch(s.page).L).toFixed(3)})`, "PASS");
}

function checkInk(mode: Mode, t: Theme, s: Surfaces): void {
  const g = `${mode} · ink`;
  const grounds: [string, string][] = [
    ["page", s.worstPage], ["card", s.card], ["cardSolid", s.cardSolid], ["plate", s.plate], ["chip", s.chip],
  ];
  for (const [name, ink] of [["inkPrimary", t.inkPrimary], ["inkSecondary", t.inkSecondary], ["inkMuted", t.inkMuted]] as const) {
    for (const [gname, ground] of grounds) ratio(g, `${name} on ${gname}`, ink, ground);
  }
  // Chart chrome should be neutral: a warm gridline over a neutral plate reads
  // as a yellow cast across the largest flat area in the card.
  for (const [name, hex] of [["grid", t.grid], ["axis", t.axis], ["inkMuted", t.inkMuted]] as const) {
    const { C } = oklch(hex);
    add(g, `${name} chroma`, `C ${C.toFixed(4)} (${hex})`, C <= 0.008 ? "PASS" : C <= 0.012 ? "THIN" : "FAIL");
  }
}

/** Everywhere `--accent-ink` renders, with the floor each one actually earns.
 *  Keyed by selector so a reader can go look at the rule. Adding a consumer to
 *  index.css means adding it here — that is the point: the floor is decided
 *  once, at the place the text is specified, not inherited from the token. */
const ACCENT_INK_CONSUMERS: {
  selector: string;
  ground: (s: Surfaces) => string;
  floor: number;
}[] = [
  // .rotating-word inside the hero h1 — clamp(2.2rem, …, 3.75rem) at display
  // weight, comfortably past 24px, so it takes the large-text floor. It is the
  // ONLY accent-ink text that sits on the bare page.
  { selector: ".rotating-word (hero h1, ≥35px)", ground: (s) => s.worstPage, floor: AA_LARGE },
  // :focus-visible outline — a graphical object, not text, and it can land on
  // any surface, so it is measured against the worst one.
  { selector: ":focus-visible outline (non-text)", ground: (s) => s.worstPage, floor: NON_TEXT },
  // Small uppercase eyebrows, ~0.75rem. Both sit on a glass card.
  { selector: ".overview__insight-eyebrow (12px)", ground: (s) => s.card, floor: AA },
  { selector: ".weekend-schedule__eyebrow (12px)", ground: (s) => s.card, floor: AA },
  { selector: ".circuit-card eyebrow (12px)", ground: (s) => s.card, floor: AA },
  // Chart-card chrome sits on the non-blurred card fill.
  { selector: ".navbar__nav-item--active icon", ground: (s) => s.cardSolid, floor: NON_TEXT },
  { selector: ".glass-select option check icon", ground: (s) => s.menu, floor: NON_TEXT },
];

function checkAccent(mode: Mode, s: Surfaces): void {
  const g = `${mode} · accent`;
  const entries: [string, Tint][] = [...TEAM_ORDER.map((x): [string, Tint] => [x, tintFor(x)]), ["neutral", NEUTRAL_TINT]];
  for (const [name, tint] of entries) {
    const th = getTheme(mode, tint);
    ratio(g, `${name} onAccent on accent`, th.onAccent, th.accent);
    // --accent-ink is checked PER CONSUMER, never as "accentInk on <surface>".
    // A relaxed floor is a property of the rendered text — its size and weight —
    // not of the token, so it has to be attached to the one consumer that earns
    // it. Stated generally, the next small-text consumer added on the bare page
    // would silently inherit a large-text allowance it doesn't qualify for.
    for (const c of ACCENT_INK_CONSUMERS) {
      ratio(g, `${name} ${c.selector}`, th.accentInk, c.ground(s), c.floor);
    }
    // Ferrari and Red Bull used to collapse these to one hex, which is what
    // forced a single value to serve as fill, border, glow, text and mark.
    add(g, `${name} accent/accentInk split`, `${th.accent} vs ${th.accentInk}`,
      th.accent === th.accentInk ? "WARN" : "PASS");
  }
}

function checkTintedFills(mode: Mode, t: Theme, s: Surfaces): void {
  const g = `${mode} · tinted fills`;
  const wash = parseFloat(t.accentWashPct) / 100;
  const well = parseFloat(t.wellPct) / 100;
  if (!(wash > 0) && !(well > 0)) {
    add(g, "accent washes", "0% in this mode — nothing tinted to check", "PASS");
    return;
  }
  // The active team chip tints with --chip-color (its OWN swatch, inline from
  // TeamSwitcher). All four chips render at once, so all four get checked —
  // not just the active team's accent.
  for (const slug of TEAM_ORDER) {
    const swatch = teamSwatch(mode, slug);
    const ground = over(colorMix(swatch, wash, t.glass2), s.worstPage);
    ratio(g, `chip ${slug}: inkPrimary`, t.inkPrimary, ground);
    ratio(g, `chip ${slug}: inkSecondary`, t.inkSecondary, ground);
  }
  // .overview__insight and the stat-tile/pipeline wells follow the ACTIVE
  // accent, and the wells carry an --accent-ink glyph.
  for (const slug of TEAM_ORDER) {
    const th = getTheme(mode, tintFor(slug));
    const insight = over(colorMix(th.accent, wash, t.glass), s.worstPage);
    ratio(g, `insight ${slug}: eyebrow (accentInk)`, th.accentInk, insight);
    ratio(g, `insight ${slug}: body (inkPrimary)`, th.inkPrimary, insight);
    const wellBg = over(colorMix(th.accent, well, "rgba(0, 0, 0, 0)"), s.card);
    ratio(g, `stat-tile well ${slug}: glyph`, th.accentInk, wellBg, NON_TEXT);
  }
}

function checkDrivers(mode: Mode, s: Surfaces): void {
  const g = `${mode} · driver colours`;
  const all: [string, string][] = [];
  for (const slug of TEAM_ORDER) {
    const th = getTheme(mode, tintFor(slug));
    separation(g, `${slug} pair`, th.driver1, th.driver2);
    all.push([`${slug}0`, th.driver1], [`${slug}1`, th.driver2]);
  }
  // Head-to-head puts any two of the eight on one chart, so what matters is not
  // the raw palette but what a user can actually END UP LOOKING AT. Drive the
  // real remedy — tintForPair's CVD_COLLISIONS slot-swap — over every reachable
  // cross-team pairing and measure the colours that survive it. This tests the
  // table's completeness behaviourally rather than trusting it.
  //
  // Cross-team pairs get NO relief band: unlike a team's own duo they have a
  // remedy, so the single floor of 8 applies and anything under it belongs in
  // CVD_COLLISIONS. Both directions are walked because tintForPair only ever
  // moves driver B — which of the two the user picks first changes the result.
  const unresolved: string[] = [];
  let swapped = 0, neutral = 0, unchanged = 0, total = 0;
  let worst = Infinity, worstId = "";
  for (const ta of TEAM_ORDER) {
    for (const tb of TEAM_ORDER) {
      if (ta === tb) continue;
      for (const sa of [0, 1] as const) {
        for (const sb of [0, 1] as const) {
          const tint = tintForPair(driverRef(ta, sa), driverRef(tb, sb));
          const rendered = getTheme(mode, tint);
          // How driver B was routed. A tells us nothing — tintForPair never
          // moves A — so the routing IS what happened to B.
          total++;
          if (tint.b === "neutral") neutral++;
          else if (tint.b.slot !== sb) swapped++;
          else unchanged++;
          const d = cvdDeltaE(rendered.driver1, rendered.driver2);
          if (d < worst) { worst = d; worstId = `${ta}${sa}+${tb}${sb}`; }
          if (d < CVD_FLOOR) unresolved.push(`${ta}${sa}+${tb}${sb} ΔE ${d.toFixed(1)}`);
        }
      }
    }
  }
  routing.push({ mode, total, swapped, neutral, unchanged, worst, worstId });
  // Dedupe the a↔b / b↔a reporting so the count reads as pairs, not orderings.
  const uniq = [...new Set(unresolved)];
  add(g, "H2H pairs after slot-swap",
    uniq.length
      ? `${uniq.length} orderings below ΔE ${CVD_FLOOR} — CVD_COLLISIONS is missing entries: ${uniq.join(", ")}`
      : `all ${TEAM_ORDER.length * (TEAM_ORDER.length - 1) * 4} orderings clear ΔE ${CVD_FLOOR}`,
    uniq.length ? "FAIL" : "PASS");

  // Marks must be findable against the plate they're drawn on.
  for (const [name, hex] of all) mark(g, `${name} on plate`, hex, s.plate);
}

function checkDataColours(mode: Mode, t: Theme, s: Surfaces): void {
  const g = `${mode} · data colours`;
  // These were last measured against the OLD plate. The plate moved, so they
  // are re-asserted here rather than inherited from the header.
  for (const [name, hex] of Object.entries(t.compounds)) mark(g, `compound ${name}`, hex, s.plate);
  for (const [name, hex] of [["good", t.flagGood], ["warning", t.flagWarning], ["serious", t.flagSerious], ["critical", t.flagCritical]] as const) {
    mark(g, `flag ${name}`, hex, s.card);
  }
  // Track/air are a related-measure pair — one hue, two steps — so they need to
  // be findable AND tellable apart.
  mark(g, "tempTrack on plate", t.tempTrack, s.plate);
  mark(g, "tempAir on plate", t.tempAir, s.plate);
  separation(g, "tempTrack ↔ tempAir", t.tempTrack, t.tempAir);

  // The four switcher swatches render as 12px dots side by side.
  const swatches = TEAM_ORDER.map((slug): [string, string] => [slug, teamSwatch(mode, slug)]);
  for (let i = 0; i < swatches.length; i++) {
    for (let j = i + 1; j < swatches.length; j++) {
      separation(g, `swatch ${swatches[i][0]} ↔ ${swatches[j][0]}`, swatches[i][1], swatches[j][1]);
    }
  }
  for (const [slug, hex] of swatches) mark(g, `swatch ${slug} on chip`, hex, s.chip);
}

/** A team's plate must not land on ANOTHER team's real-world brand colour.
 *
 *  "Plate" here is the team's BADGE GROUND — `teamSwatch()`, i.e. the team
 *  accent — NOT `s.plate`, the chart inset surface every other check in this
 *  file measures ink against. Same word, two things; this is the badge one.
 *  (The badge itself is still a design proposal; the accent is what stands in
 *  for its ground until then, which is what the design project measures too.)
 *
 *  WARN, never FAIL, because the check is not satisfiable as a failure: the
 *  seeds collide with EACH OTHER before any derivation happens, so a plate
 *  sitting exactly on its own brand can already violate this against a rival's.
 *
 *  Which is why the WARN is SPLIT. `seedsApart` — the distance between the two
 *  teams' own seeds — separates two populations that look identical in a list:
 *    drift     the plates collide but the BRANDS do not. Derivation moved a
 *              plate onto a brand it started clear of. Fixable, and the only
 *              reason this check is worth running.
 *    inherent  the brands themselves collide. No derivation fixes it; the
 *              letterform on the badge has to carry the distinction. */
function checkBrandSeeds(mode: Mode): void {
  const g = `${mode} · team plate vs rival seed`;
  type Found = { check: string; value: string; status: Status; label?: string; rank: number; v: number };
  const found: Found[] = [];

  for (const team of TEAM_ORDER) {
    const plate = teamSwatch(mode, team);
    for (const rival of TEAM_ORDER) {
      if (rival === team) continue; // distance to its OWN seed is drift, below
      const seed = TEAM_SEEDS[rival];
      const v = deltaE(plate, seed);
      const seedsApart = deltaE(TEAM_SEEDS[team], seed);
      const label = v >= SEED_FLOOR ? undefined : seedsApart >= SEED_FLOOR ? "drift" : "inherent";
      found.push({
        check: `${team} ↔ ${rival} seed`,
        value:
          `ΔE ${v.toFixed(1)} · cvd ${cvdDeltaE(plate, seed).toFixed(1)} (${plate} ↔ ${seed})` +
          (label ? ` — seeds ${seedsApart.toFixed(1)} apart at source` : ""),
        status: label ? "WARN" : "PASS",
        label,
        rank: label === "drift" ? 0 : label === "inherent" ? 1 : 2,
        v,
      });
    }
    drift.push({ mode, team, plate, seed: TEAM_SEEDS[team], value: deltaE(plate, TEAM_SEEDS[team]) });
  }

  // Actionable first, then unfixable, then clear — each ascending by ΔE. At 11
  // teams this one group is 220 rows, and nobody reads 220 rows: the handful
  // worth acting on have to be at the top of it, not scattered through it.
  found.sort((a, b) => a.rank - b.rank || a.v - b.v);
  for (const f of found) add(g, f.check, f.value, f.status, f.label);
}

/** The seeds are raw brand hexes: no contrast check, no CVD check, no
 *  compositing. They exist for THIS script to measure against, and rendering one
 *  would put an unvalidated colour on screen while bypassing every check in this
 *  file — the precise failure the file was written to prevent.
 *
 *  Keeping that module out of the app is therefore a real invariant, and this is
 *  what makes it one instead of a comment somebody has to notice in a diff. It
 *  is also the only FAIL this pass adds: an unvalidated hex reaching the screen
 *  is a defect, where a brand-fidelity collision is a warning.
 *
 *  `scripts/` is outside the scan, so this file's own import is out of scope by
 *  construction rather than by exemption. */
const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const SEEDS_MODULE = /(?:\bfrom|\bimport)\s*\(?\s*["'][^"']*theme\.seeds/;

function walkSource(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkSource(join(dir, e.name)) : [join(dir, e.name)],
  );
}

function checkSeedIsolation(): void {
  const g = "provenance";
  const check = "theme.seeds.ts is validator-only";

  let scanned: string[];
  try {
    scanned = walkSource(SRC_DIR).filter(
      (f) => /\.tsx?$/.test(f) && !f.endsWith("theme.seeds.ts"),
    );
  } catch (err) {
    add(g, check, `could not read ${SRC_DIR} — ${(err as Error).message}`, "FAIL");
    return;
  }

  // A scan that matched nothing proves nothing. Without this, a moved directory
  // or a broken path reports a clean bill of health for a check that never ran,
  // which is worse than having no check at all.
  if (scanned.length === 0) {
    add(g, check, `scanned 0 files under ${SRC_DIR} — the scan did not run, so this is not a pass`, "FAIL");
    return;
  }

  const leaks = scanned.filter((f) => SEEDS_MODULE.test(readFileSync(f, "utf8")));
  add(g, check,
    leaks.length
      ? `imported by ${leaks.map((f) => relative(SRC_DIR, f)).join(", ")}` +
        " — a brand seed has passed no contrast, CVD or compositing check"
      : `no import across ${scanned.length} files under src/`,
    leaks.length ? "FAIL" : "PASS");
}

function checkHero3D(mode: Mode, t: Theme, s: Surfaces): void {
  const g = `${mode} · hero3D pace ramp`;
  // The glow duplicate sits UNDER and AROUND the crisp line, so the crisp
  // line's immediate surround is the ground tinted toward its own colour. The
  // check is therefore not "is the mark visible" (that is unchanged by the
  // ramp) but "does the glow PUSH a line that cleared 3:1 below it". A line
  // already under 3:1 bare is the pre-existing relief band and is reported
  // separately by checkDrivers.
  const pushed: string[] = [];
  const ramps: { id: string; hex: string; value: number }[] = [];
  for (const slug of TEAM_ORDER) {
    const th = getTheme(mode, tintFor(slug));
    for (const [i, d] of [th.driver1, th.driver2].entries()) {
      const bare = contrast(d, s.page);
      const glowed = contrast(d, colorMixOpaque(d, t.heroGlowMax, s.page));
      if (bare >= NON_TEXT && glowed < NON_TEXT) {
        pushed.push(`${slug}${i} ${bare.toFixed(2)}→${glowed.toFixed(2)}`);
      }
      ramps.push({
        id: `${slug}${i}`,
        hex: d,
        value: deltaE(colorMixOpaque(d, t.heroGlowMin, s.page), colorMixOpaque(d, t.heroGlowMax, s.page)),
      });
    }
  }
  add(g, "glow pushes a mark below 3:1", pushed.length ? pushed.join(", ") : "none",
    pushed.length ? "WARN" : "PASS");

  // The ramp encodes pace, so it has to stay readable as a ramp. ~2.5 ΔE is
  // about where a slow-vs-fast segment stops being tellable apart.
  //
  // THE CHECK NAME CARRIES ITS OFFENDERS, and that is what makes this
  // exemptible without being disableable. `add()` matches ACCEPTED on
  // `<group>|<check>`, so a check whose name is a constant string can only be
  // exempted WHOLESALE — accepting today's two pale colours would silently
  // pass every future colour that lands near page value too, which for a check
  // that near-neutral brands trip is a live risk rather than a hypothetical.
  // Naming the offending slots AND their hexes means the accepted key stops
  // matching the moment the set changes: a third offender, or either of these
  // two changing colour, produces a key that is not in ACCEPTED and the FAIL
  // stands. (An entry that stops firing is reported as stale, so the exemption
  // cannot quietly outlive the colours it was granted for either.)
  //
  // Built from the FAIL threshold, not the PASS floor: a colour landing in the
  // 2.0–2.5 THIN band is not a FAIL, so it must not perturb the key.
  const worstRamp = Math.min(...ramps.map((r) => r.value));
  const offenders = ramps
    .filter((r) => r.value < RAMP_THIN)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  add(
    g,
    offenders.length
      ? `pace ramp perceptible (${offenders.map((r) => `${r.id} ${r.hex}`).join(", ")})`
      : "pace ramp perceptible",
    `worst ΔE ${worstRamp.toFixed(1)} across ${t.heroGlowMin}–${t.heroGlowMax}` +
      (offenders.length ? ` — ${offenders.map((r) => `${r.id} ${r.value.toFixed(2)}`).join(", ")}` : ""),
    worstRamp >= RAMP_FLOOR ? "PASS" : worstRamp >= RAMP_THIN ? "THIN" : "FAIL",
  );
}

/** Composite an opaque colour onto an opaque ground at a given alpha. */
function colorMixOpaque(fg: string, alpha: number, bg: string): string {
  return over(`rgba(${parseHex(fg).join(", ")}, ${alpha})`, bg);
}

// ---- badge checks -------------------------------------------------------
//
// BADGE_PLATE/BADGE_INK are mode-independent (see theme.ts), so checks 1-3
// below run ONCE, not per mode. Check 4 (ring vs page) and the two roll-ups
// (5, 6) are per-mode because their grounds are.

/** Check 1: the ink ratio each plate row in theme.ts's comment cites, to 2dp.
 *  Reproducing the CITED number (not just clearing 4.5) is the point — a
 *  mistyped hex can still clear 4.5 while landing on the wrong number, and
 *  this is the fastest signal that a hex was mistyped rather than derived. */
const BADGE_INK_RATIO: Record<TeamSlug, number> = {
  mclaren: 6.71, ferrari: 4.51, redbull: 4.80, mercedes: 10.28,
  astonmartin: 5.29, williams: 5.20, audi: 5.96, alpine: 6.92,
  haas: 7.12, racingbulls: 6.83, cadillac: 4.55,
};

/** Check 2 allow-list: plate-vs-plate pairs below the ΔE 8 floor. Empty as of
 *  the 2026-08-15 plate swap — Ferrari/Audi is now ΔE 42.1, clear of the
 *  floor, and no other pair drops below it. Any future sub-8 pair is a real
 *  FAIL (see the task's "round cap"). Keyed lexicographically, same
 *  convention as CVD_COLLISIONS in theme.ts. */
const BADGE_PLATE_COLLISIONS: Record<string, string> = {};

/** Check 3 allow-list: plate-vs-rival-seed pairs below the ΔE 8 floor,
 *  declared `inherent` rather than re-derived. */
const BADGE_SEED_COLLISIONS: Record<string, string> = {
  "ferrari plate ↔ audi seed": "ΔE 1.6 — inherent brand proximity (both saturated reds).",
  "racingbulls plate ↔ alpine seed": "ΔE 7.4 — inherent brand proximity.",
  "haas plate ↔ cadillac seed": "ΔE 4.8 — inherent brand proximity (both neutral greys).",
  "williams plate ↔ redbull seed": "ΔE 8.0 — inherent brand proximity (both blues).",
};

function checkBadgeInk(): void {
  const g = "badge · ink on plate";
  for (const slug of TEAM_ORDER) {
    const plate = BADGE_PLATE[slug];
    const ink = BADGE_INK[slug];
    const v = contrast(ink, plate);
    const expected = BADGE_INK_RATIO[slug];
    const reproduces = Math.abs(v - expected) < 0.005;
    const status: Status = v < AA ? "FAIL" : !reproduces ? "FAIL" : v < AA + THIN_MARGIN ? "THIN" : "PASS";
    add(g, `${slug} ink ${ink} on plate ${plate}`,
      `${v.toFixed(2)}:1${reproduces ? "" : ` — expected ${expected.toFixed(2)}, mismatch suggests a mistyped hex`}`,
      status);
  }
}

function checkBadgePlateCollisions(): void {
  const g = "badge · plate vs plate";
  const fired = new Set<string>();
  for (let i = 0; i < TEAM_ORDER.length; i++) {
    for (let j = i + 1; j < TEAM_ORDER.length; j++) {
      const [a, b] = [TEAM_ORDER[i], TEAM_ORDER[j]];
      const [ka, kb] = a < b ? [a, b] : [b, a];
      const key = `${ka}|${kb}`;
      const v = deltaE(BADGE_PLATE[a], BADGE_PLATE[b]);
      if (v >= SEED_FLOOR) continue;
      const allowed = BADGE_PLATE_COLLISIONS[key];
      if (allowed) fired.add(key);
      add(g, `${ka} ↔ ${kb}`, `ΔE ${v.toFixed(1)} (${BADGE_PLATE[ka]} ↔ ${BADGE_PLATE[kb]})` + (allowed ? ` — ALLOWED: ${allowed}` : ""),
        allowed ? "WARN" : "FAIL");
    }
  }
  const stale = Object.keys(BADGE_PLATE_COLLISIONS).filter((k) => !fired.has(k));
  for (const k of stale) {
    add(g, `${k} (stale allow-list entry)`, "no longer collides — delete from BADGE_PLATE_COLLISIONS", "WARN");
  }
}

function checkBadgeVsRivalSeed(): void {
  const g = "badge · plate vs rival seed";
  for (const team of TEAM_ORDER) {
    for (const rival of TEAM_ORDER) {
      if (rival === team) continue;
      const v = deltaE(BADGE_PLATE[team], TEAM_SEEDS[rival]);
      if (v >= SEED_FLOOR) continue;
      const key = `${team} plate ↔ ${rival} seed`;
      const allowed = BADGE_SEED_COLLISIONS[key];
      add(g, key, `ΔE ${v.toFixed(1)} (${BADGE_PLATE[team]} ↔ ${TEAM_SEEDS[rival]})` + (allowed ? ` — ALLOWED: ${allowed}` : ""),
        allowed ? "WARN" : "FAIL");
    }
  }
}

/** Light: blobs are off (auroraA/B/C = 0 — see theme.ts), so the flat page
 *  wash's darker stop IS the worst light ground; the plain page check covers
 *  it exactly. Dark keeps its blobs, and `.aurora` is `position: fixed`, so
 *  they're glued to the viewport rather than to page content — any point can
 *  pass under a blob core while scrolling, including all three cores
 *  overlapping at once on an ordinary laptop viewport (three 920px circles
 *  positioned at corners of a ~1280×800 viewport geometrically overlap — see
 *  `.aurora__blob-wrap--a/b/c` in index.css). Reproduces the composite:
 *  `.glass` fill over the three blobs stacked source-over at their own
 *  opacity (mask is fully opaque inside the 42% core radius, so peak alpha
 *  IS `--aurora-a/b/c` exactly), for every team, and keeps the worst. */
function checkBadgeRing(mode: Mode, t: Theme, s: Surfaces): void {
  const g = `${mode} · badge ring`;
  if (mode === "light") {
    ratio(g, "ring vs flat page", BADGE_RING[mode], t.pageBase, NON_TEXT);
    return;
  }
  let worst = Infinity;
  let worstTeam: TeamSlug = "ferrari";
  let worstChip = "";
  for (const slug of TEAM_ORDER) {
    const th = getTheme(mode, tintFor(slug));
    let stacked = t.pageBase;
    for (const [color, alpha] of [
      [th.accent, parseFloat(t.auroraA)],
      [th.driver1, parseFloat(t.auroraB)],
      [th.driver2, parseFloat(t.auroraC)],
    ] as [string, number][]) {
      stacked = over(`rgba(${parseHex(color).join(", ")}, ${alpha})`, stacked);
    }
    const chip = over(t.glass, stacked);
    const v = contrast(BADGE_RING[mode], chip);
    if (v < worst) { worst = v; worstTeam = slug; worstChip = chip; }
  }
  const check = `ring vs chip on stacked aurora blobs (worst: ${worstTeam})`;
  add(g, check, `${worst.toFixed(2)}:1 vs ${worstChip} (all 3 blobs overlapping, ${worstTeam})`,
    worst < NON_TEXT ? "FAIL" : worst < NON_TEXT + THIN_MARGIN ? "THIN" : "PASS");
  // ratio()'s own PASS/THIN/FAIL isn't reused above because the check name
  // carries the offending team, same reasoning as checkHero3D's ACCEPTED key:
  // if the worst team ever changes, the ACCEPTED key below stops matching and
  // the FAIL stands instead of silently accepting a different team's number.
  ratio(g, "ring vs plate (reference, not the failing surface)", BADGE_RING[mode], s.plate, NON_TEXT);
}

/** Checks 5 & 6, RECORD ONLY: every driver colour against every rival team's
 *  badge plate, both modes, two metrics. PLAIN OKLab reconstructs the
 *  original Round 5 derivation (13 rows) and is kept because it matches the
 *  task's frozen table exactly. CVD-worst (protan/deutan) is what every other
 *  driver-separation check in this file uses, and is the metric that actually
 *  matters for the outline-encoding decision these rows feed: CVD-worst can
 *  see red-green collapse that plain OKLab cannot, and surfaces a very
 *  different worst offender (mercedes0 vs haas ΔE 1.03, not visible in the
 *  plain block at all). Both are RECORD ONLY — neither gates — and neither
 *  replaces the other. */
const driverVsPlatePlain: { mode: Mode; driver: string; hex: string; plate: TeamSlug; v: number }[] = [];
const driverVsPlateCVD: { mode: Mode; driver: string; hex: string; plate: TeamSlug; v: number }[] = [];

function recordDriverVsPlate(mode: Mode): void {
  for (const driverTeam of TEAM_ORDER) {
    const th = getTheme(mode, tintFor(driverTeam));
    for (const [slot, hex] of [th.driver1, th.driver2].entries()) {
      const driver = `${driverTeam}${slot}`;
      for (const plateTeam of TEAM_ORDER) {
        if (plateTeam === driverTeam) continue;
        const plate = BADGE_PLATE[plateTeam];
        const vPlain = deltaE(hex, plate);
        if (vPlain < CVD_FLOOR) driverVsPlatePlain.push({ mode, driver, hex, plate: plateTeam, v: vPlain });
        const vCvd = cvdDeltaE(hex, plate);
        if (vCvd < CVD_FLOOR) driverVsPlateCVD.push({ mode, driver, hex, plate: plateTeam, v: vCvd });
      }
    }
  }
}

/** Check 6, RECORD ONLY: accent-on-page ratio, 11 teams x 2 modes. The 3:1
 *  check does not exist yet (see docs/STATE.md known gaps) — this just
 *  captures the numbers so that eventual check knows its real scope. */
const accentOnPage: { mode: Mode; team: TeamSlug; v: number }[] = [];

function recordAccentOnPage(mode: Mode, t: Theme): void {
  for (const slug of TEAM_ORDER) {
    const th = getTheme(mode, tintFor(slug));
    accentOnPage.push({ mode, team: slug, v: contrast(th.accent, t.pageBase) });
  }
}

// ---- run --------------------------------------------------------------------

const GLYPH: Record<Status, string> = { PASS: "PASS", THIN: "THIN", WARN: "WARN", FAIL: "FAIL" };

/** `--summary` drops the per-row table and keeps the parts anyone actually
 *  reads: the counts, the brand-seed triage, the two roll-up blocks, and any
 *  FAIL verbatim. The full report is still one flag away — it just stops being
 *  the default at ~275 rows today and ~700 after the grid expansion.
 *
 *  Pass it as `npm run validate:theme -- --summary`; see the header for why the
 *  bare `--` is not optional. */
const SUMMARY = process.argv.includes("--summary");

checkSeedIsolation();
checkBadgeInk();
checkBadgePlateCollisions();
checkBadgeVsRivalSeed();
for (const mode of ["light", "dark"] as Mode[]) {
  const t = getTheme(mode, tintFor("ferrari"));
  const s = surfacesOf(t);
  checkStack(mode, t, s);
  checkInk(mode, t, s);
  checkAccent(mode, s);
  checkTintedFills(mode, t, s);
  checkDrivers(mode, s);
  checkDataColours(mode, t, s);
  checkBrandSeeds(mode);
  checkHero3D(mode, t, s);
  checkBadgeRing(mode, t, s);
  recordDriverVsPlate(mode);
  recordAccentOnPage(mode, t);
}

// COUNT FIRST, PRINT SECOND. Two passes, so `--summary` is structurally unable
// to change a total or an exit code by changing what it prints. Folding the
// counting into the print loop (as this did) would mean two counting paths kept
// in agreement by hand.
let fails = 0;
let thins = 0;
let warns = 0;
for (const r of rows) {
  if (r.status === "FAIL") fails++;
  else if (r.status === "THIN") thins++;
  else if (r.status === "WARN") warns++;
}
const drifting = rows.filter((r) => r.label === "drift").length;
const inherent = rows.filter((r) => r.label === "inherent").length;

const rule = (title: string): string =>
  `\n  ── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`;

/** The status cell, padded to the widest one in its OWN group. A group with no
 *  labels computes 6, so every pre-existing group renders exactly as it always
 *  has and only the labelled group widens. */
const cellOf = (r: Row): string => `[${GLYPH[r.status]}${r.label ? ` ${r.label}` : ""}]`;
const cellWidth = new Map<string, number>();
for (const r of rows) {
  cellWidth.set(r.group, Math.max(cellWidth.get(r.group) ?? 0, cellOf(r).length));
}

if (!SUMMARY) {
  let group = "";
  for (const r of rows) {
    if (r.group !== group) {
      group = r.group;
      console.log(rule(group));
    }
    console.log(`  ${cellOf(r).padEnd(cellWidth.get(r.group) ?? 6)} ${r.check.padEnd(34)} ${r.value}`);
  }

  console.log(rule("brand fidelity: plate ↔ its own seed"));
  for (const d of drift) {
    console.log(
      `  ${d.mode.padEnd(5)} ${d.team.padEnd(12)} ΔE ${d.value.toFixed(1).padStart(5)}   ${d.plate} from ${d.seed}`,
    );
  }
} else if (fails > 0) {
  // A digest that hides the reason for a non-zero exit is not a digest.
  console.log(rule("failures"));
  for (const r of rows.filter((x) => x.status === "FAIL")) {
    console.log(`  ${cellOf(r)} ${r.group} · ${r.check} — ${r.value}`);
  }
}

// Both roll-ups print in BOTH modes: they are the two lines that say whether
// anything needs doing, which is the whole job of the summary.
const driftRollup = (m: Mode): string => {
  const d = drift.filter((x) => x.mode === m);
  const worst = d.reduce((a, b) => (b.value > a.value ? b : a));
  const mean = d.reduce((a, b) => a + b.value, 0) / d.length;
  return `${m} worst ${worst.value.toFixed(1)} (${worst.team}) · mean ${mean.toFixed(1)}`;
};
console.log(rule("brand seeds"));
console.log(
  `  plate ↔ rival seed   ${drifting} drift (fixable) · ${inherent} inherent (brands collide at source)`,
);
console.log(`  drift off own seed   ${driftRollup("light")}  ·  ${driftRollup("dark")}`);

// Where the collision table's work shows up. The three counts are IDENTICAL
// across modes by construction — CVD_COLLISIONS is one mode-independent Set,
// so a pair routes the same way in both — and printing them per mode is what
// makes that structural, checkable, and obvious if it ever stops being true.
// The worst rendered ΔE is the part that genuinely differs per mode, because
// the routing is shared but the colours it lands on are not.
console.log(rule("tintForPair routing"));
for (const r of routing) {
  console.log(
    `  ${r.mode.padEnd(5)} ${String(r.swapped).padStart(3)} slot-swap · ${r.neutral} neutral fallback · ` +
      `${r.unchanged} unchanged  of ${r.total} cross-team orderings`,
  );
  console.log(`        worst rendered ΔE ${r.worst.toFixed(1)} (${r.worstId})`);
}

// The tightest margins are where the NEXT change breaks, and they are invisible
// in a pass/fail table. Print them so theme.ts's header can name them.
console.log(rule("tightest contrast margins"));
for (const m of [...margins].sort((a, b) => a.value - a.floor - (b.value - b.floor)).slice(0, 6)) {
  console.log(
    `  ${(m.value - m.floor >= 0 ? "+" : "") + (m.value - m.floor).toFixed(2)} over ${m.floor.toFixed(1)}` +
      `   ${m.value.toFixed(2)}:1   ${m.id}`,
  );
}

// Checks 5 & 6 (two metrics — see recordDriverVsPlate): driver colour vs
// rival badge plate, sub-ΔE-8 only, each with a per-rival-plate grouping.
function printDriverVsPlate(title: string, rows: typeof driverVsPlatePlain): void {
  console.log(rule(title));
  console.log(`  ${rows.length} rows below ΔE ${CVD_FLOOR}`);
  for (const r of [...rows].sort((a, b) => a.v - b.v)) {
    console.log(
      `  ${r.mode.padEnd(5)} ${r.driver.padEnd(10)} ${r.hex.padEnd(9)} vs ${r.plate.padEnd(12)} ΔE ${r.v.toFixed(2)}`,
    );
  }
  const byPlate = new Map<TeamSlug, number>();
  for (const r of rows) byPlate.set(r.plate, (byPlate.get(r.plate) ?? 0) + 1);
  console.log("  by rival plate:");
  for (const [plate, count] of [...byPlate.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${plate.padEnd(14)} ${count}`);
  }
}
printDriverVsPlate("driver colour vs rival badge plate — PLAIN OKLab (sub-8, RECORD only)", driverVsPlatePlain);
printDriverVsPlate("driver colour vs rival badge plate — CVD-worst (sub-8, RECORD only)", driverVsPlateCVD);

// Check 6 roll-up: accent-on-page ratio, all 22 (11 teams x 2 modes).
console.log(rule("accent on page ratio (all 22, RECORD only)"));
for (const mode of ["light", "dark"] as Mode[]) {
  for (const r of accentOnPage.filter((x) => x.mode === mode)) {
    console.log(`  ${r.mode.padEnd(5)} ${r.team.padEnd(12)} ${r.v.toFixed(2)}:1`);
  }
}

// An exception that no longer fires is worse than no exception: it reads as a
// live caveat and hides the fact that the problem was solved. Surface it.
const stale = Object.keys(ACCEPTED).filter((id) => !acceptedFired.has(id));
if (stale.length) {
  console.log(rule("stale exceptions"));
  for (const id of stale) {
    console.log(`  [WARN] ${id.replace("|", " · ")}`);
    console.log("         no longer failing — delete this entry from ACCEPTED.");
  }
  warns += stale.length;
}

console.log(
  `\n  ${rows.length} checks · ${fails} FAIL · ${thins} THIN · ${warns} WARN` +
    ` · ${acceptedFired.size} accepted\n` +
    "  THIN = passing but within 0.1 of its floor. WARN = documented relief band,\n" +
    "  legal only with the secondary encoding the charts already carry.\n" +
    "  ACCEPTED = a declared, reasoned exception (see the table at the top).\n",
);

process.exit(fails > 0 ? 1 : 0);
