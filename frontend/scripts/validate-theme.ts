/**
 * Validates the shipped theme against the numeric claims theme.ts's header
 * makes. Run it: `npm run validate:theme`.
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
 */

import { getTheme, teamSwatch, tintForPair } from "../src/theme.ts";
import type { Mode, Theme, Tint } from "../src/theme.ts";
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
}

const rows: Row[] = [];
const acceptedFired = new Set<string>();

function add(group: string, check: string, value: string, status: Status): void {
  const id = `${group}|${check}`;
  if (status === "FAIL" && id in ACCEPTED) {
    acceptedFired.add(id);
    rows.push({ group, check, value: `${value} — ACCEPTED: ${ACCEPTED[id]}`, status: "WARN" });
    return;
  }
  rows.push({ group, check, value, status });
}

/** Every contrast margin seen, so the tightest can be reported at the end.
 *  A check that passes at 4.52 and one that passes at 17.2 read identically in
 *  the table; the difference is which one the next token nudge breaks. */
const margins: { id: string; value: number; floor: number }[] = [];

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
  for (const ta of TEAM_ORDER) {
    for (const tb of TEAM_ORDER) {
      if (ta === tb) continue;
      for (const sa of [0, 1] as const) {
        for (const sb of [0, 1] as const) {
          const rendered = getTheme(mode, tintForPair(driverRef(ta, sa), driverRef(tb, sb)));
          const d = cvdDeltaE(rendered.driver1, rendered.driver2);
          if (d < CVD_FLOOR) unresolved.push(`${ta}${sa}+${tb}${sb} ΔE ${d.toFixed(1)}`);
        }
      }
    }
  }
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

function checkHero3D(mode: Mode, t: Theme, s: Surfaces): void {
  const g = `${mode} · hero3D pace ramp`;
  // The glow duplicate sits UNDER and AROUND the crisp line, so the crisp
  // line's immediate surround is the ground tinted toward its own colour. The
  // check is therefore not "is the mark visible" (that is unchanged by the
  // ramp) but "does the glow PUSH a line that cleared 3:1 below it". A line
  // already under 3:1 bare is the pre-existing relief band and is reported
  // separately by checkDrivers.
  const pushed: string[] = [];
  let worstRamp = Infinity;
  for (const slug of TEAM_ORDER) {
    const th = getTheme(mode, tintFor(slug));
    for (const [i, d] of [th.driver1, th.driver2].entries()) {
      const bare = contrast(d, s.page);
      const glowed = contrast(d, colorMixOpaque(d, t.heroGlowMax, s.page));
      if (bare >= NON_TEXT && glowed < NON_TEXT) {
        pushed.push(`${slug}${i} ${bare.toFixed(2)}→${glowed.toFixed(2)}`);
      }
      worstRamp = Math.min(
        worstRamp,
        deltaE(colorMixOpaque(d, t.heroGlowMin, s.page), colorMixOpaque(d, t.heroGlowMax, s.page)),
      );
    }
  }
  add(g, "glow pushes a mark below 3:1", pushed.length ? pushed.join(", ") : "none",
    pushed.length ? "WARN" : "PASS");
  // The ramp encodes pace, so it has to stay readable as a ramp. ~2.5 ΔE is
  // about where a slow-vs-fast segment stops being tellable apart.
  add(g, "pace ramp perceptible", `worst ΔE ${worstRamp.toFixed(1)} across ${t.heroGlowMin}–${t.heroGlowMax}`,
    worstRamp >= 2.5 ? "PASS" : worstRamp >= 2.0 ? "THIN" : "FAIL");
}

/** Composite an opaque colour onto an opaque ground at a given alpha. */
function colorMixOpaque(fg: string, alpha: number, bg: string): string {
  return over(`rgba(${parseHex(fg).join(", ")}, ${alpha})`, bg);
}

// ---- run --------------------------------------------------------------------

const GLYPH: Record<Status, string> = { PASS: "PASS", THIN: "THIN", WARN: "WARN", FAIL: "FAIL" };

for (const mode of ["light", "dark"] as Mode[]) {
  const t = getTheme(mode, tintFor("ferrari"));
  const s = surfacesOf(t);
  checkStack(mode, t, s);
  checkInk(mode, t, s);
  checkAccent(mode, s);
  checkTintedFills(mode, t, s);
  checkDrivers(mode, s);
  checkDataColours(mode, t, s);
  checkHero3D(mode, t, s);
}

let group = "";
let fails = 0;
let thins = 0;
let warns = 0;
for (const r of rows) {
  if (r.group !== group) {
    group = r.group;
    console.log(`\n  ── ${group} ${"─".repeat(Math.max(0, 58 - group.length))}`);
  }
  if (r.status === "FAIL") fails++;
  else if (r.status === "THIN") thins++;
  else if (r.status === "WARN") warns++;
  console.log(`  [${GLYPH[r.status]}] ${r.check.padEnd(34)} ${r.value}`);
}

// The tightest margins are where the NEXT change breaks, and they are invisible
// in a pass/fail table. Print them so theme.ts's header can name them.
console.log(`\n  ── tightest contrast margins ${"─".repeat(33)}`);
for (const m of [...margins].sort((a, b) => a.value - a.floor - (b.value - b.floor)).slice(0, 6)) {
  console.log(
    `  ${(m.value - m.floor >= 0 ? "+" : "") + (m.value - m.floor).toFixed(2)} over ${m.floor.toFixed(1)}` +
      `   ${m.value.toFixed(2)}:1   ${m.id}`,
  );
}

// An exception that no longer fires is worse than no exception: it reads as a
// live caveat and hides the fact that the problem was solved. Surface it.
const stale = Object.keys(ACCEPTED).filter((id) => !acceptedFired.has(id));
if (stale.length) {
  console.log(`\n  ── stale exceptions ${"─".repeat(41)}`);
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
