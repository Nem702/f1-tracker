// Single source of truth for every color in the app: base tokens per mode,
// plus a validated palette per TEAM (the whole site retints to the selected
// pair — accent, aurora blobs, chart driver colors).
//
// EVERY NUMBER BELOW IS PRINTED BY `npm run validate:theme`. That script
// imports this file directly and composites each surface from these tokens,
// so nothing here is a remembered figure — re-run it after any change rather
// than trusting this comment. (It replaced a header whose ΔE claims were off
// by up to 4× and had been silently wrong through several passes, because
// nothing verified them.)
//
// Metric: OKLab ΔE ×100, worst of protan/deutan, Machado-Oliveira-Fernandes
// (2009) at severity 1.0. Contrast is WCAG relative luminance.
//
// ONE FLOOR governs driver separation: ΔE 8. Twelve is a TARGET, not a second
// floor, and it applies only to a team's own duo — the pair the default view
// shows, which has no remedy available because a team's drivers must wear
// their team's two slot colors. 8–12 there reports WARN and leans on the
// secondary encoding every chart carries (legend + acronym end-labels +
// tooltip + table). Cross-team pairs get no relief band: they DO have a
// remedy, so below 8 they belong in CVD_COLLISIONS.
//
//   - per-team driver1↔driver2 (target 12, floor 8):
//       ferrari  light 10.5 · dark 11.1   <- the ONLY duo in the 8–12 WARN band
//       mercedes light 13.8 · dark 12.3     audi     light 24.7 · dark 28.4
//       mclaren  light 23.6 · dark 21.7     alpine   light 20.7 · dark 25.9
//       redbull  light 19.7 · dark 17.5     haas     light 20.0 · dark 20.5
//       aston    light 19.3 · dark 20.4     racingb. light 27.5 · dark 20.3
//       williams light 20.0 · dark 25.4     cadillac light 20.0 · dark 31.8
//   - head-to-head: all 440 ordered cross-team pairings clear ΔE 8 in both
//     modes once CVD_COLLISIONS is applied. How they resolve — the slot-swap,
//     neutral-fallback and unchanged counts, and the worst ΔE that survives —
//     is PRINTED by the validator under "tintForPair routing", not recorded
//     here: those numbers lived in this comment for one team-count and were
//     wrong by the next. See CVD_COLLISIONS for the 31 colliding pairs and the
//     lexicographic-key trap.
//   - WCAG: onAccent-on-accent ≥ 4.5 for every team+mode (worst williams light
//     4.88). accentInk is checked PER CONSUMER, not per surface — the floor
//     is a property of the rendered text, so .rotating-word (hero h1, ≥35px)
//     takes 3:1 while the 12px eyebrows take 4.5:1. inkPrimary/Secondary/Muted
//     are checked on page, veiled band, card, cardSolid, plate and chip.
//   - compounds/flags/temp are fixed semantic scales, re-measured against the
//     NEW plate rather than inherited: MEDIUM (1.80), HARD (2.99), flag
//     warning (1.74), flag serious (2.51) and tempAir (1.76) sit in the
//     documented sub-3:1 relief band, as do nine of the twenty-two light
//     driver colors — legal only because of the secondary encoding above.
//     Dark has none. The proportion is unchanged by the grid expansion: the
//     eight-driver palette ran four of eight, this one runs nine of 22.
//   - two declared exceptions, both in the validator's ACCEPTED table: dark
//     inkMuted-on-chip at 4.42:1, and Hero3D's light pace ramp for haas0 and
//     audi1 (ΔE 1.62/1.79 — both sit near page value, and that entry is keyed
//     BY COLOUR so a third offender still FAILs). Everything else passes.
//
// WHERE THIS IS FRAGILE. Zero failures says nothing about how much room is
// left, and these are the margins the next token nudge eats first. The
// validator prints this list under "tightest contrast margins" — regenerate it
// rather than editing by hand:
//
//     -0.08 over 4.5   4.42:1   dark inkMuted on chip     (declared exception)
//     +0.12 over 4.5   4.62:1   light inkSecondary on page
//     +0.20 over 4.5   4.70:1   dark audi eyebrows (12px), all three
//     +0.20 over 4.5   4.70:1   dark insight audi: eyebrow (accentInk)
//
// The live constraint is STILL the light ink pair, solved against the veiled
// band-b ground — the darkest surface on the page — so darkening `pageBase`
// again spends that 0.12 first. The grid expansion did not move it, which was
// not free: the first cut of the eleven-team accents was derived for minimum
// drift off brand, and a min-drift objective lands values exactly ON their
// floor rather than past it. That put four derived accents at +0.01/+0.02 and
// made a DERIVED value the tightest thing in the theme — the one category
// where tightness is free to fix, because nothing is frozen. Re-deriving the
// accentInks to a 4.7 target (a 4.5 floor plus margin) cost ΔE 0.7–2.1 of ink
// shift apiece, moved no accent, and put every one of them at +0.20 or better.
// Hold that rule for any team added later: derive ink to 4.7, not to 4.5.
// THIN count fell 22 → 6 in the same pass. The remaining THIN of note is
// dark's inkMuted chroma at C .0092 against a .008 target — dark is frozen,
// so it stands.
//
// The active pair's two colors double as the delta chart's diverging poles,
// so "slot color = driver" holds everywhere. Accent is a UI identity, never a
// data identity: it never appears as a chart series color.
//
// WHAT "COLOR FOLLOWS THE ENTITY" NOW MEANS. At four teams the collision
// fallback was a rare exception and this header could fairly claim a driver
// keeps their slot color everywhere. At eleven it reassigns 62 of 440 ordered
// pairings — 14%, and the validator prints the exact split. Restating the old
// claim would be false, so state the guarantee that is actually true and
// actually needed: the app only ever renders TWO drivers, so what has to hold
// is "any 2-of-22 render separably", not "22 globally distinct colors". The
// second is not achievable in sRGB at these contrast floors, and implying it
// is how a table with six entries went five defects unnoticed. A driver's
// color is still stable for a GIVEN pairing across both modes and every chart
// — the fallback is a function of the pair, not of the mode or the surface.

import type { DriverRef, TeamSlug } from "./teams";

export type Mode = "light" | "dark";

// ---- team palettes (validated — see header) --------------------------------

// PROVENANCE. Every value below is DERIVED — none is a brand hex. The
// real-world colour each team's palette was seeded off (OpenF1 `team_colour`)
// is recorded separately, in theme.seeds.ts, which nothing in the app imports:
// a raw brand hex has been through no contrast, CVD or compositing check, and
// the validator FAILs if that module is ever named under src/. The validator
// measures two things against it — how far each derived accent has drifted off
// its own brand, and whether it has drifted onto someone ELSE'S brand.

interface TeamColors {
  accent: string; // vivid brand accent: fills, glow, aurora, swatches
  accentInk: string; // text/icon-safe accent (≥ 4.5:1 on glass)
  onAccent: string; // ink for text sitting on a solid `accent` fill
  drivers: [string, string]; // color slots 0/1 — chart series identity
}

const TEAM_PALETTES: Record<Mode, Record<TeamSlug, TeamColors>> = {
  // Light accents, 2026-08-08: split by JOB. One full-chroma value used to do
  // five things (fill, border, glow, text, icon); on a pale ground that reads
  // as an alert rather than a marque. `accent` is now the FILL — the lighter,
  // more chromatic step, for small solid areas (row-count pill, team dots,
  // progress bar). `accentInk` is the deeper, less chromatic step for text and
  // icons. Ferrari's red comes down in lightness AND chroma together
  // (L .563→.512, C .229→.204) — that pair of moves is what turns alarm into
  // marque. Ferrari and Red Bull used to collapse both roles onto one hex.
  // Teams whose onAccent is DARK ink (mercedes, mclaren, neutral) keep a bright
  // fill — deepening it would break the dark-on-accent direction — so only
  // their ink moves. Driver/series colors are untouched: accent is a UI
  // identity, never a data identity.
  light: {
    ferrari: {
      accent: "#c00d13",
      accentInk: "#a8121a",
      onAccent: "#ffffff",
      drivers: ["#dc0500", "#c78a1e"],
    },
    mercedes: {
      accent: "#00a89b",
      accentInk: "#00655d",
      onAccent: "#14100a",
      drivers: ["#00a89b", "#16799d"],
    },
    mclaren: {
      accent: "#f07800",
      accentInk: "#8f4601",
      onAccent: "#14100a",
      drivers: ["#f07800", "#1f9ed8"],
    },
    redbull: {
      accent: "#2a5cb8",
      accentInk: "#234a90",
      onAccent: "#ffffff",
      drivers: ["#2a5cb8", "#d64545"],
    },
    astonmartin: {
      accent: "#2b9267",
      accentInk: "#377055",
      onAccent: "#14100a",
      drivers: ["#269e75", "#085f44"],
    },
    williams: {
      accent: "#006ce7",
      accentInk: "#115fc4",
      onAccent: "#ffffff",
      drivers: ["#2071fe", "#1e4b8d"],
    },
    audi: {
      accent: "#910018",
      accentInk: "#7e111a",
      onAccent: "#ffffff",
      drivers: ["#b00229", "#d69493"],
    },
    alpine: {
      accent: "#43baef",
      accentInk: "#2c708f",
      onAccent: "#14100a",
      drivers: ["#28b3ea", "#3f6f86"],
    },
    haas: {
      accent: "#a6b8bb",
      accentInk: "#5e6d70",
      onAccent: "#14100a",
      drivers: ["#a1a5aa", "#5c697a"],
    },
    racingbulls: {
      accent: "#6f97fe",
      accentInk: "#4162bf",
      onAccent: "#14100a",
      drivers: ["#6c9afb", "#2d4a8a"],
    },
    cadillac: {
      accent: "#444346",
      accentInk: "#3c3b3e",
      onAccent: "#ffffff",
      drivers: ["#534b44", "#94837b"],
    },
  },
  dark: {
    ferrari: {
      accent: "#ff4438",
      accentInk: "#ff4438",
      onAccent: "#14100a",
      drivers: ["#d60009", "#bf8b00"],
    },
    mercedes: {
      accent: "#00d2be",
      accentInk: "#00d2be",
      onAccent: "#14100a",
      drivers: ["#0ca999", "#1980a1"],
    },
    mclaren: {
      accent: "#ff9633",
      accentInk: "#ff9633",
      onAccent: "#14100a",
      drivers: ["#d67603", "#0296c6"],
    },
    redbull: {
      accent: "#4d82d8",
      accentInk: "#4d82d8",
      onAccent: "#14100a",
      drivers: ["#4d82d8", "#e66767"],
    },
    astonmartin: {
      accent: "#279669",
      accentInk: "#279669",
      onAccent: "#14100a",
      drivers: ["#349c76", "#31e35f"],
    },
    williams: {
      accent: "#1568dc",
      accentInk: "#4d81d1",
      onAccent: "#ffffff",
      drivers: ["#1a64e5", "#99bbff"],
    },
    audi: {
      accent: "#c20f33",
      accentInk: "#cd5e61",
      onAccent: "#ffffff",
      drivers: ["#b4303b", "#e1b2ae"],
    },
    alpine: {
      accent: "#43baef",
      accentInk: "#43baef",
      onAccent: "#14100a",
      drivers: ["#20bbf6", "#4f6570"],
    },
    haas: {
      accent: "#999c9e",
      accentInk: "#999c9e",
      onAccent: "#14100a",
      drivers: ["#a1a5a9", "#64686c"],
    },
    racingbulls: {
      accent: "#6498ff",
      accentInk: "#6498ff",
      onAccent: "#14100a",
      drivers: ["#789cfa", "#4d5cad"],
    },
    cadillac: {
      accent: "#66696b",
      accentInk: "#7f8183",
      onAccent: "#ffffff",
      drivers: ["#676460", "#d1c4b6"],
    },
  },
};

/** The team BADGE: a solid plate with a letterform on it, sized >= 20px and
 *  always aria-hidden (a mark is never a team's only identification — the
 *  name is always beside it). Round 5 values — see docs/STATE.md.
 *
 *  MODE-INDEPENDENT ON PURPOSE, and the one place in this file that is. The
 *  plate derives identically in both modes because it is solved against its
 *  own ink inside a self-contained surface: `accent` is a fill measured
 *  against the page and `accentInk` is text measured against card and page —
 *  and the page is what differs most between modes. If the badge selected one
 *  mode's accent it would silently inherit a value solved against a page it
 *  never sits on, and the next accent nudge would move the badge for reasons
 *  nobody reading the diff could understand.
 *
 *  Typed `Record<TeamSlug, string>` deliberately: adding a team is a type
 *  error until its badge values exist here, same discipline as
 *  `theme.seeds.ts`.
 *
 *  These are NOT accents and are not interchangeable with them. `accent` has
 *  to tint a whole page and stay ΔE 8 clear of ten rivals at 12px; a plate
 *  only has to carry its own ink. Several plates sit far closer to a rival
 *  than any accent is allowed to — which is why the badge exists as a second
 *  encoding rather than as a recolouring of the first. Every `badgeInk`
 *  clears 4.5:1 against its own `badgePlate` — see `npm run validate:theme`. */
export const BADGE_PLATE: Record<TeamSlug, string> = {
  mclaren: "#f47600",
  ferrari: "#ec002e",
  redbull: "#5f80be",
  mercedes: "#00d7b6",
  astonmartin: "#229971",
  williams: "#1868db",
  audi: "#f8103a",
  alpine: "#00a9d8",
  haas: "#9c9fa2",
  racingbulls: "#6c98ff",
  cadillac: "#78766e",
};

export const BADGE_INK: Record<TeamSlug, string> = {
  mclaren: "#14100a",
  ferrari: "#ffffff",
  redbull: "#14100a",
  mercedes: "#14100a",
  astonmartin: "#14100a",
  williams: "#ffffff",
  audi: "#14100a",
  alpine: "#14100a",
  haas: "#14100a",
  racingbulls: "#14100a",
  cadillac: "#ffffff",
};

/** Hairline around a badge plate, so a plate close in value to the surface
 *  behind it still reads as a discrete object. Per mode — unlike the plate
 *  itself, this IS chrome: it belongs to the page, not to the team.
 *
 *  Both values are composites of a settled translucent token, stored opaque:
 *  light is `#14100a @ 55%` over the light page `#DEDCD9`; dark is
 *  `#ffffff @ 45%` over the dark page `#0A0A0C`. Light has no blobs (they're
 *  off — see `auroraA/B/C` below), so flat page IS the worst light ground:
 *  3.82:1, PASS.
 *
 *  Dark keeps its blobs, and the switcher chip sits on `.aurora`, a FIXED
 *  layer, so the blobs are glued to the viewport, not to page content — any
 *  screen point can pass under a blob core while scrolling, including all
 *  three cores at once on ordinary laptop viewports (the blobs are 920px
 *  circles; see `.aurora__blob-wrap--a/b/c` in index.css for the offsets that
 *  make the overlap geometrically real, not theoretical). `npm run
 *  validate:theme` composites `.glass` over each team's stacked
 *  accent+driver1+driver2 blob cores at their own opacity and measures the
 *  ring against it for all 11 teams; the worst realistic case is Aston Martin
 *  (green raises background luminance the most) at 2.71:1, below the 3:1
 *  floor — declared as a named ACCEPTED exception in the validator rather
 *  than left as a number in this comment, so it can't go stale silently the
 *  way the Round 4 figures here did. */
export const BADGE_RING: Record<Mode, string> = {
  light: "#6f6c67",
  dark: "#787879",
};

/** Chrome for a mixed head-to-head pair (no team owns the page) and the
 *  last-resort driver color if a collision survives the slot swap. */
const NEUTRAL: Record<
  Mode,
  { accent: string; accentInk: string; onAccent: string; driver: string }
> = {
  light: { accent: "#e35f2c", accentInk: "#a03702", onAccent: "#14100a", driver: "#2a78d6" },
  dark: { accent: "#d95926", accentInk: "#d95926", onAccent: "#14100a", driver: "#3987e5" },
};

// ---- head-to-head color resolution ------------------------------------------

/** A driver's color identity, resolvable in either mode (colors differ per
 *  mode, so the tint carries slots, not hexes). */
export type SlotRef = { team: TeamSlug; slot: 0 | 1 } | "neutral";

/** What the theme needs to know about the active pair: which team chrome to
 *  wear (null = neutral) and which two slot colors the pair renders in. */
export interface Tint {
  teamSlug: TeamSlug | null;
  a: SlotRef;
  b: SlotRef;
}

export const DEFAULT_TINT: Tint = {
  teamSlug: "ferrari",
  a: { team: "ferrari", slot: 0 },
  b: { team: "ferrari", slot: 1 },
};

/** Every cross-team slot pair below the ΔE 8 floor in EITHER mode (worst of
 *  protan/deutan, OKLab ×100), from `npm run validate:theme`. No runtime color
 *  math — a pair is either in this table or it isn't.
 *
 *  KEYS MUST BE LEXICOGRAPHIC: `collides()` normalises with
 *  `ka < kb ? ka|kb : kb|ka`, and "mclaren1" sorts BEFORE "mercedes1" — an
 *  entry written in team order instead silently never matches. At 11 teams
 *  there are more ways to get it wrong: "racingbulls0" also sorts before
 *  "redbull0", and "astonmartin1" before "audi1".
 *
 *      pair                          light   dark
 *      alpine0|mclaren1                6.0   11.3
 *      alpine0|racingbulls0            5.2    4.8
 *      alpine0|williams1              30.4    2.1
 *      alpine1|cadillac0              11.4    2.8
 *      alpine1|haas1                   2.0    1.9
 *      alpine1|mercedes1               3.6    8.1
 *      astonmartin0|audi1              4.7   12.9
 *      astonmartin0|cadillac1          0.5   16.6
 *      astonmartin0|mercedes0          5.2    5.0
 *      astonmartin0|redbull1           6.8    6.2
 *      astonmartin1|cadillac0          1.1   31.8
 *      astonmartin1|ferrari0           6.2   23.6
 *      astonmartin1|redbull1           5.1   13.0
 *      audi0|cadillac0                 4.8    7.1
 *      audi0|ferrari0                  8.0    5.4
 *      audi1|cadillac1                 8.3    2.1
 *      audi1|haas0                     3.5    6.3
 *      audi1|mercedes0                 1.1    8.1
 *      cadillac0|haas1                10.4    1.8
 *      cadillac1|mercedes0             4.8   12.1
 *      cadillac1|redbull1              7.2   15.6
 *      ferrari0|redbull1               4.2   12.0
 *      ferrari1|mclaren0               1.5    0.7
 *      ferrari1|redbull1               8.9    6.6
 *      haas0|mercedes0                 2.7    2.6
 *      haas1|mercedes1                 5.5    8.0
 *      mclaren0|redbull1              11.9    6.7
 *      mclaren1|mercedes1             12.3    7.2
 *      mclaren1|racingbulls0           5.1    8.2
 *      mclaren1|redbull0              17.8    5.1
 *      racingbulls1|williams1          0.5   29.5
 *
 *  Half these rows are CROSS-MODE, not "these two look alike": alpine0 and
 *  williams1 are ΔE 30.4 apart in light and 2.1 in dark. The table is one
 *  mode-independent Set, so a pair colliding in EITHER mode belongs in it.
 *
 *  The six-entry version of this table shipped five silent defects for months
 *  — two series a red-green colorblind viewer could not tell apart. At 31
 *  entries hand-maintenance is no longer the risk it was: the table is
 *  generated from the shipped driver colours, and `checkDrivers` re-derives it
 *  behaviourally on every run, so an omission surfaces as a FAIL naming the
 *  missing pair rather than as two identical lines on a chart.
 *
 *  For how these actually resolve — how many orderings slot-swap, how many
 *  fall through to neutral, and the worst ΔE that survives — read the
 *  validator's `tintForPair routing` roll-up. Those counts used to be recorded
 *  here and drifted; they are printed now. */
const CVD_COLLISIONS = new Set([
  "alpine0|mclaren1",
  "alpine0|racingbulls0",
  "alpine0|williams1",
  "alpine1|cadillac0",
  "alpine1|haas1",
  "alpine1|mercedes1",
  "astonmartin0|audi1",
  "astonmartin0|cadillac1",
  "astonmartin0|mercedes0",
  "astonmartin0|redbull1",
  "astonmartin1|cadillac0",
  "astonmartin1|ferrari0",
  "astonmartin1|redbull1",
  "audi0|cadillac0",
  "audi0|ferrari0",
  "audi1|cadillac1",
  "audi1|haas0",
  "audi1|mercedes0",
  "cadillac0|haas1",
  "cadillac1|mercedes0",
  "cadillac1|redbull1",
  "ferrari0|redbull1",
  "ferrari1|mclaren0",
  "ferrari1|redbull1",
  "haas0|mercedes0",
  "haas1|mercedes1",
  "mclaren0|redbull1",
  "mclaren1|mercedes1",
  "mclaren1|racingbulls0",
  "mclaren1|redbull0",
  "racingbulls1|williams1",
]);

function collides(a: { team: TeamSlug; slot: 0 | 1 }, b: { team: TeamSlug; slot: 0 | 1 }): boolean {
  const ka = `${a.team}${a.slot}`;
  const kb = `${b.team}${b.slot}`;
  return CVD_COLLISIONS.has(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`);
}

/** Resolve the pair's color identity. Driver A always keeps their own slot
 *  color; if the cross-team pair is in the collision table, driver B renders
 *  in their team's OTHER slot; if that still collides, neutral fallback.
 *  (Two same-team drivers sharing a slot — a mid-season third driver in
 *  H2H — also bumps B to the other slot.) */
export function tintForPair(a: DriverRef | null, b: DriverRef | null): Tint {
  if (!a || !b) return DEFAULT_TINT;
  const slotA = { team: a.teamSlug, slot: a.slot };
  let slotB: SlotRef = { team: b.teamSlug, slot: b.slot };
  const sameTeam = a.teamSlug === b.teamSlug;
  if (sameTeam) {
    if (a.slot === b.slot) slotB = { team: b.teamSlug, slot: b.slot === 0 ? 1 : 0 };
  } else if (collides(slotA, slotB)) {
    const alt = { team: b.teamSlug, slot: (b.slot === 0 ? 1 : 0) as 0 | 1 };
    slotB = collides(slotA, alt) ? "neutral" : alt;
  }
  return { teamSlug: sameTeam ? a.teamSlug : null, a: slotA, b: slotB };
}

function resolveSlot(mode: Mode, ref: SlotRef): string {
  return ref === "neutral"
    ? NEUTRAL[mode].driver
    : TEAM_PALETTES[mode][ref.team].drivers[ref.slot];
}

// ---- theme ------------------------------------------------------------------

export interface Theme {
  // ---- layer stack (aurora base < glass < plate) ----
  pageBase: string; // aurora base / body pre-mount fallback — the page wash's DARK stop, so it doubles as the worst-case ground every ink check is solved against
  pageLift: string; // the wash's light stop, painted at the top of the fixed .aurora layer. Light runs a slight vertical value gradient INSTEAD of the blobs; dark sets this === pageBase so the gradient renders flat and the blobs carry the atmosphere (see auroraA/B/C)
  bandVeil: string; // the alternating [data-band="b"] section veil, as a complete rgba fill. Direction is per-mode ON PURPOSE: dark lightens the band, light DARKENS it — a near-white veil on a light page shrinks the very page-to-card step the light stack depends on
  surface: string; // the chart plate flattened to an opaque hex (validator surface; mark rings, sticky table headers)
  plate: string; // near-opaque inset plate the chart marks draw on — rgba
  plateBorder: string; // hairline ring around the plate
  glass: string; // the ONE glass fill — rgba
  glass2: string; // inner chip fill on glass (active pills, selects) — rgba
  glassBorder: string; // frosted-edge highlight — rgba
  glassOpaque: string; // @supports fallback when backdrop-filter is missing
  cardSolid: string; // Race Analysis chart cards' non-blurred fill (see .card--solid) — its own tier, not the @supports fallback: a cool silver-gray in light mode reads better solid than glassOpaque's near-white did
  glassMenu: string; // fully opaque fill for floating interactive menus (GlassSelect popup) — its own tier, not the @supports fallback; legibility over arbitrary content wins over the glass look here
  glassSolid: string; // fully opaque card fill for a surface that must NOT sample the page beneath it (.countdown, which wears the dark theme on a light page — at 85% the light page bled through and muddied it to a mid-charcoal)
  spec: string; // specular inset top-edge highlight — rgba. Transparent in light: a white top edge on a near-white card measures 1.01-1.05:1, i.e. nothing. Dark keeps it at 0.14, where it renders 1.53:1
  shadowCard: string; // glass drop shadow
  shadowRaised: string; // stronger elevation: tooltips, hover
  glowBorderPct: string; // team-glow recipe (.team-chip--active, .overview__insight): border-color color-mix %
  glowRingPct: string; // …ring box-shadow color-mix %
  glowBlurPct: string; // …blur box-shadow color-mix % — light mode runs all three hotter than dark so translucent red reads as red, not pink, over a pale fill
  accentWashPct: string; // tinted-fill color-mix %: how much accent is mixed INTO the fill beneath (.team-chip--active's glass2, .overview__insight's glass). Replaces the fill rather than layering over it, so there's one translucency, not two
  wellPct: string; // the accent "well" behind a glyph (.stat-tile__icon, .pipeline__num) — color-mix % over transparent. Light runs this HOTTER than dark: a 16% wash of a pale-ground accent reads as an unfinished pink square, where dark's deep maroon well reads as intentional
  swatchRingPct: string; // .team-chip__swatch's outer halo ring — 0% in light (it is an outer bloom, and light has no headroom for one), dark keeps its 20%
  countdownEdgePct: string; // .countdown's accent border: color-mix % of accent into --glass-border. The card wears the DARK theme in both modes, so on a light page it needs a real edge; 0% in dark resolves to exactly --glass-border, leaving dark untouched
  heroGlowMin: number; // Hero3D's pace ramp — the glow duplicate's opacity floor…
  heroGlowMax: number; // …and ceiling. Faster laps glow more, so this is a DATA ENCODING, not decoration: compress the range in light, never flatten it
  heroGlowWidth: number; // …and the duplicate's lineWidth. Width and opacity both feed the smudge on a pale ground
  accent: string; // team accent — chrome fills/glow only, never a series
  accentInk: string; // accent as TEXT or icon color (AA on glass)
  onAccent: string; // ink for text sitting on a solid `accent` fill
  auroraA: string; // per-mode blob opacities (decorative, validator-exempt)
  auroraB: string;
  auroraC: string;
  auroraTint: string; // color-mix % of the blob color kept vs white — light
  // runs pastel blobs (translucent saturated red over a white page reads as
  // a pink stain, not a glow; over near-black the same recipe reads as
  // atmosphere, so dark keeps 100%)

  // ---- ink & chart chrome ----
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string; // axis labels, captions
  grid: string; // hairline gridlines
  axis: string; // baseline / zero line
  border: string; // hairline ring on non-glass fragments

  // ---- data identity (never themed away) ----
  driver1: string; // the active pair's slot-0 color (pair[0])
  driver2: string; // the active pair's slot-1 color (pair[1])
  tempTrack: string; // sequential blue, dark step (related-measure pair…)
  tempAir: string; // …and its light step: one hue, two shades
  compounds: Record<string, string>; // Pirelli convention, palette-snapped
  flagGood: string;
  flagWarning: string;
  flagSerious: string;
  flagCritical: string;
}

type BaseTokens = Omit<
  Theme,
  "accent" | "accentInk" | "onAccent" | "driver1" | "driver2"
>;

const base: Record<Mode, BaseTokens> = {
  light: {
    // Light layer stack, 2026-08-08 pass — light stopped borrowing dark's
    // mechanisms. Dark separates surfaces by EMITTED LIGHT (glow, bright
    // hairline, blobs of atmosphere); white has no headroom above it, so each
    // of those degrades into a smudge, a whisper, or a stain. Light now
    // separates by VALUE STEP + EDGE + CONTACT SHADOW instead:
    //   - page darkened #e6e5e2 → #dedcd9 to open room under the cards, and
    //     the three blobs suppressed (auroraA/B/C = 0) in favour of a slight
    //     vertical wash pageLift → pageBase. The wash is painted by the FIXED
    //     .aurora layer, so unlike the old blobs nothing can clip it and
    //     there is no section boundary for a seam to appear at.
    //   - four near-identical fills collapsed to three visible tiers:
    //     page #dedcd9 · plate #e7e7eb · card #fafafa-#fefefd. cardSolid keeps
    //     its own token (it must stay un-blurred for scroll perf) but no
    //     longer reads as a separate tier.
    //   - shadowCard/shadowRaised each gained a TIGHT CONTACT layer ahead of
    //     the ambient one; on a pale ground the contact shadow does nearly all
    //     the perceptual work, and bundling it into the same token means the
    //     consumers that drop or re-declare --shadow-card pick it up for free.
    //   - hairlines promoted (glassBorder .10→.16, border .09→.14,
    //     plateBorder .08→.12): on dark the border is the hero of the card, on
    //     light it has to earn the same rank.
    //   - `spec` retired to transparent. A white specular top edge on a
    //     near-white card measures 1.01-1.05:1 — invisible. Dark keeps it at
    //     0.14 on a dark fill, where it renders 1.53:1 and genuinely reads.
    // inkMuted darkened+neutralised to hold AA against the new worst-case
    // ground (it was already FAILING at 4.04:1 on the old page).
    pageBase: "#dedcd9",
    pageLift: "#e4e2df",
    bandVeil: "rgba(23, 25, 34, 0.035)",
    surface: "#fafafa",
    plate: "rgba(232, 232, 237, 0.92)",
    plateBorder: "rgba(23, 25, 34, 0.12)",
    glass: "rgba(255, 255, 255, 0.86)",
    glass2: "rgba(255, 255, 255, 0.96)",
    glassBorder: "rgba(23, 25, 34, 0.16)",
    glassOpaque: "rgba(255, 255, 255, 0.96)",
    cardSolid: "rgba(255, 255, 255, 0.96)",
    glassMenu: "rgba(255, 255, 255, 1)",
    glassSolid: "#ffffff",
    spec: "rgba(255, 255, 255, 0)",
    shadowCard: "0 1px 2px rgba(23, 25, 34, 0.11), 0 24px 48px -28px rgba(23, 25, 34, 0.3)",
    shadowRaised: "0 2px 4px rgba(23, 25, 34, 0.13), 0 30px 60px -24px rgba(23, 25, 34, 0.35)",
    // The glow tier is GONE in light. Glow is additive and white has no
    // headroom above it, so a bloom can only render as a tint spreading
    // outward — read as blur or bleed, and running it hotter just enlarges the
    // smudge. Both bloom layers go to 0% (color-mix at 0% is fully
    // transparent, so the three consumers need no CSS branch), and the work
    // they were doing moves to a heavier border plus a tinted fill.
    glowBorderPct: "85%",
    glowRingPct: "0%",
    glowBlurPct: "0%",
    accentWashPct: "14%",
    wellPct: "26%",
    swatchRingPct: "0%",
    countdownEdgePct: "65%",
    // Hero3D, light: ceiling down 0.22 → 0.13 and width 7 → 5. At the old
    // ceiling the glow dragged THREE drivers' crisp lines below the 3:1 floor
    // against their own glow-brightened surround (ferrari0 3.78→2.62,
    // mercedes1 3.61→2.78, redbull1 3.20→2.47); at 0.13 only redbull1 still
    // does, and it starts from only 3.20 bare. The min drops to 0.03 to keep
    // the fast-vs-slow ramp perceptible (ΔE 2.8) at the lower ceiling.
    heroGlowMin: 0.03,
    heroGlowMax: 0.13,
    heroGlowWidth: 5,
    // Blobs off in light — the vertical pageLift→pageBase wash replaces them.
    // They were the actual source of the "half-pink navbar" and the hard
    // horizontal band edge: the fixed blob was still above the perceptual
    // floor where the [data-band] veil cut across it.
    auroraA: "0",
    auroraB: "0",
    auroraC: "0",
    auroraTint: "45%",
    inkPrimary: "#171922",
    inkSecondary: "#585b66",
    inkMuted: "#59595d",
    // Neutralised 2026-08-08. These were the last survivors of an earlier warm
    // page base: at C .018/.023 against a C .004 page they laid a yellow cast
    // over the largest flat area in every card. --grid also rules
    // .data-table td and .rc-feed__item, where it sat next to the cool
    // --border on the table header — that mismatch closes with it.
    grid: "#e2e2e4",
    axis: "#c8c8ca",
    border: "rgba(23, 25, 34, 0.14)",
    tempTrack: "#2a78d6",
    tempAir: "#86b6ef",
    compounds: {
      SOFT: "#e34948",
      MEDIUM: "#eda100",
      HARD: "#898781",
      INTERMEDIATE: "#008300",
      WET: "#2a78d6",
    },
    flagGood: "#0ca30c",
    flagWarning: "#fab219",
    flagSerious: "#ec835a",
    flagCritical: "#d03b3b",
  },
  dark: {
    pageBase: "#0a0a0c",
    // === dark is frozen ===
    // pageLift === pageBase, so the wash gradient renders FLAT here and dark
    // keeps its blobs as the atmosphere. bandVeil is the literal value the old
    // color-mix(--surface 45%, transparent) computed to — byte-identical.
    pageLift: "#0a0a0c",
    bandVeil: "rgba(15, 15, 17, 0.45)",
    surface: "#0f0f11",
    plate: "rgba(18, 18, 20, 0.6)",
    plateBorder: "rgba(255, 255, 255, 0.07)",
    glass: "rgba(30, 30, 34, 0.44)",
    glass2: "rgba(255, 255, 255, 0.09)",
    glassBorder: "rgba(255, 255, 255, 0.14)",
    glassOpaque: "rgba(26, 26, 30, 0.85)",
    cardSolid: "rgba(26, 26, 30, 0.85)",
    glassMenu: "rgba(26, 26, 30, 1)",
    glassSolid: "#1a1a1e", // glassOpaque's colour at full opacity
    spec: "rgba(255, 255, 255, 0.14)",
    shadowCard: "0 24px 48px -20px rgba(0, 0, 0, 0.65)",
    shadowRaised: "0 30px 56px -18px rgba(0, 0, 0, 0.75)",
    glowBorderPct: "45%",
    glowRingPct: "30%",
    glowBlurPct: "60%",
    // Dark keeps the glow tier — it has headroom above the fill, which is the
    // whole reason the mechanism works here and not in light. No wash, no
    // countdown edge (0% resolves to plain --glass-border), swatch ring and
    // well at their existing values, Hero3D ramp untouched.
    accentWashPct: "0%",
    wellPct: "16%",
    swatchRingPct: "20%",
    countdownEdgePct: "0%",
    heroGlowMin: 0.07,
    heroGlowMax: 0.22,
    heroGlowWidth: 7,
    auroraA: "0.20",
    auroraB: "0.18",
    auroraC: "0.16",
    auroraTint: "100%",
    inkPrimary: "#ffffff",
    inkSecondary: "#c3c2b7",
    inkMuted: "#898781",
    grid: "#2c2c2a",
    axis: "#383835",
    border: "rgba(255, 255, 255, 0.10)",
    tempTrack: "#3987e5",
    tempAir: "#86b6ef",
    compounds: {
      SOFT: "#e66767",
      MEDIUM: "#c98500",
      HARD: "#898781",
      INTERMEDIATE: "#008300",
      WET: "#3987e5",
    },
    flagGood: "#0ca30c",
    flagWarning: "#fab219",
    flagSerious: "#ec835a",
    flagCritical: "#d03b3b",
  },
};

const themeCache = new Map<string, Theme>();

const slotKey = (ref: SlotRef) =>
  ref === "neutral" ? "neutral" : `${ref.team}${ref.slot}`;

/** The one theme factory: base tokens for the mode + the active tint's
 *  chrome and pair colors. Cached per (mode, tint) so useSyncExternalStore
 *  consumers get a stable snapshot object. */
export function getTheme(mode: Mode, tint: Tint): Theme {
  const key = `${mode}|${tint.teamSlug ?? "neutral"}|${slotKey(tint.a)}|${slotKey(tint.b)}`;
  const cached = themeCache.get(key);
  if (cached) return cached;

  const chrome = tint.teamSlug ? TEAM_PALETTES[mode][tint.teamSlug] : NEUTRAL[mode];
  const theme: Theme = {
    ...base[mode],
    accent: chrome.accent,
    accentInk: chrome.accentInk,
    onAccent: chrome.onAccent,
    driver1: resolveSlot(mode, tint.a),
    driver2: resolveSlot(mode, tint.b),
  };
  themeCache.set(key, theme);
  return theme;
}

/** The team accent swatch for a chip/legend that must show a team's color
 *  regardless of which team is active (the switcher's four chips). */
export function teamSwatch(mode: Mode, slug: TeamSlug): string {
  return TEAM_PALETTES[mode][slug].accent;
}

/** Expose the theme as CSS custom properties so index.css styles the page
 *  chrome from the same values the charts read in JS — one source, no drift. */
export function cssVars(t: Theme): Record<string, string> {
  return {
    "--page-base": t.pageBase,
    "--page-lift": t.pageLift,
    "--band-veil": t.bandVeil,
    "--surface": t.surface,
    "--plate": t.plate,
    "--plate-border": t.plateBorder,
    "--glass": t.glass,
    "--glass2": t.glass2,
    "--glass-border": t.glassBorder,
    "--glass-opaque": t.glassOpaque,
    "--card-solid": t.cardSolid,
    "--glass-menu": t.glassMenu,
    "--spec": t.spec,
    "--shadow-card": t.shadowCard,
    "--shadow-raised": t.shadowRaised,
    "--glow-border-pct": t.glowBorderPct,
    "--glow-ring-pct": t.glowRingPct,
    "--glow-blur-pct": t.glowBlurPct,
    "--accent-wash-pct": t.accentWashPct,
    "--well-pct": t.wellPct,
    "--swatch-ring-pct": t.swatchRingPct,
    "--countdown-edge-pct": t.countdownEdgePct,
    "--glass-solid": t.glassSolid,
    "--accent": t.accent,
    "--accent-ink": t.accentInk,
    "--on-accent": t.onAccent,
    "--aurora-a": t.auroraA,
    "--aurora-b": t.auroraB,
    "--aurora-c": t.auroraC,
    "--aurora-tint": t.auroraTint,
    "--ink-primary": t.inkPrimary,
    "--ink-secondary": t.inkSecondary,
    "--ink-muted": t.inkMuted,
    "--grid": t.grid,
    "--axis": t.axis,
    "--border": t.border,
    "--driver1": t.driver1,
    "--driver2": t.driver2,
  };
}

/** Ink color for a label sitting inside a colored fill: pick by the fill's
 *  luminance so the letter always clears contrast (yellow → dark ink). */
export function inkOn(fillHex: string): string {
  const n = parseInt(fillHex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0b0b0b" : "#ffffff";
}
