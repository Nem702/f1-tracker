// Single source of truth for every color in the app: base tokens per mode,
// plus a validated palette per TEAM (the whole site retints to the selected
// pair — accent, aurora blobs, chart driver colors). All palettes were run
// through the dataviz six-checks validator against this redesign's opaque
// chart-plate surfaces — light rgba(255,253,249,.72) flattened over the
// #ececec page base = #FAF8F5, dark rgba(18,18,20,.6) over #0a0a0c = #0F0F11
// (page base was re-tinted from a warm #f2ede7 to this neutral gray after the
// fact — lightness held constant, so none of the checks below shifted; light
// shadowCard/shadowRaised were also re-tinted from a warm brown rgba(80,50,20,…)
// to neutral rgba(23,25,34,…) — same alpha/blur/spread, decorative only, no
// validator check touches shadow color):
//   - per-team driver1↔driver2, worst of protan/deutan ΔE (target ≥ 12):
//       ferrari  light 12.6 · dark 15.3  (dark seeds re-snapped: rosso
//         L .66→.55, giallo L .80→.67 — the seed gold sat above the dark
//         lightness band and equal-lightness rosso/giallo fell to ΔE 8.5)
//       mercedes light 27.0 · dark 26.2  (ANT "silver" seeds failed the
//         chroma floor — C .035/.027 reads gray — so slot 2 is a steel blue
//         at C = .10, hue held; dark teal re-snapped into the L band)
//       mclaren  light 96.6 · dark 89.4  (dark seeds re-snapped into band)
//       redbull  light 71.6 · dark 61.9  (seeds passed unchanged)
//   - head-to-head cross-team combos (--pairs all over the 8 driver colors,
//     both modes): one collision — ferrari slot 2 (giallo) ↔ mclaren slot 1
//     (papaya), ΔE 2.3 light / 1.5 dark — resolved via CVD_COLLISIONS below
//     (the yielding driver takes their team's other slot; both directions
//     re-validated ≥ 12). ANT↔PIA sits in the legal 8–12 floor band
//     (18.5 light / 11.8 dark) — every chart carries legend + acronym
//     end-labels + tooltip + table, the mandated secondary encoding.
//   - WCAG AA via the validator's contrast(): onAccent-on-accent ≥ 4.5 for
//     every team+mode (worst: redbull dark 4.96); accentInk (the text/icon
//     variant of the accent) ≥ 4.5 on glass-over-base (#F7F4F1 / #131316) —
//     light mercedes/mclaren/neutral accents fail even 3:1 there, so their
//     accentInk is a darkened same-hue step (#007e74, #b25701, #c44502);
//     light inkMuted darkened #898781 → #716e67 (3.28 → 4.64 on glass).
//   - compounds/flags/temp colors unchanged from Part 6 (fixed semantic
//     scales; MEDIUM's sub-3:1 WARN and the flag WARNs are the same
//     pre-existing, documented exceptions).
// The active pair's two colors double as the delta chart's diverging poles,
// so "slot color = driver" holds everywhere. Color follows the entity — a
// driver keeps their slot color across every chart and mode; only the
// documented collision fallback ever reassigns one, and it does so
// consistently in both modes. Accent is a UI identity, never a data
// identity: it never appears as a chart series color.

import type { DriverRef, TeamSlug } from "./teams";

export type Mode = "light" | "dark";

// ---- team palettes (validated — see header) --------------------------------

interface TeamColors {
  accent: string; // vivid brand accent: fills, glow, aurora, swatches
  accentInk: string; // text/icon-safe accent (≥ 4.5:1 on glass)
  onAccent: string; // ink for text sitting on a solid `accent` fill
  drivers: [string, string]; // color slots 0/1 — chart series identity
}

const TEAM_PALETTES: Record<Mode, Record<TeamSlug, TeamColors>> = {
  light: {
    ferrari: {
      accent: "#dc0500",
      accentInk: "#dc0500",
      onAccent: "#ffffff",
      drivers: ["#dc0500", "#c78a1e"],
    },
    mercedes: {
      accent: "#00a89b",
      accentInk: "#007e74",
      onAccent: "#14100a",
      drivers: ["#00a89b", "#16799d"],
    },
    mclaren: {
      accent: "#f07800",
      accentInk: "#b25701",
      onAccent: "#14100a",
      drivers: ["#f07800", "#1f9ed8"],
    },
    redbull: {
      accent: "#2a5cb8",
      accentInk: "#2a5cb8",
      onAccent: "#ffffff",
      drivers: ["#2a5cb8", "#d64545"],
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
  },
};

/** Chrome for a mixed head-to-head pair (no team owns the page) and the
 *  last-resort driver color if a collision survives the slot swap. */
const NEUTRAL: Record<
  Mode,
  { accent: string; accentInk: string; onAccent: string; driver: string }
> = {
  light: { accent: "#eb6834", accentInk: "#c44502", onAccent: "#14100a", driver: "#2a78d6" },
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

/** Precomputed from the validator's all-pairs run (union of both modes,
 *  worst of protan/deutan < 8): the only cross-team slot pair below the CVD
 *  floor is Ferrari giallo ↔ McLaren papaya. No runtime color math — a pair
 *  is either in this table or it isn't. */
const CVD_COLLISIONS = new Set(["ferrari1|mclaren0"]);

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
  pageBase: string; // aurora base / body pre-mount fallback
  surface: string; // the chart plate flattened to an opaque hex (validator surface; mark rings, sticky table headers)
  plate: string; // near-opaque inset plate the chart marks draw on — rgba
  plateBorder: string; // hairline ring around the plate
  glass: string; // the ONE glass fill — rgba
  glass2: string; // inner chip fill on glass (active pills, selects) — rgba
  glassBorder: string; // frosted-edge highlight — rgba
  glassOpaque: string; // @supports fallback when backdrop-filter is missing
  cardSolid: string; // Race Analysis chart cards' non-blurred fill (see .card--solid) — its own tier, not the @supports fallback: a cool silver-gray in light mode reads better solid than glassOpaque's near-white did
  glassMenu: string; // fully opaque fill for floating interactive menus (GlassSelect popup) — its own tier, not the @supports fallback; legibility over arbitrary content wins over the glass look here
  spec: string; // specular inset top-edge highlight — rgba
  shadowCard: string; // glass drop shadow
  shadowRaised: string; // stronger elevation: tooltips, hover
  glowBorderPct: string; // team-glow recipe (.team-chip--active, .overview__insight): border-color color-mix %
  glowRingPct: string; // …ring box-shadow color-mix %
  glowBlurPct: string; // …blur box-shadow color-mix % — light mode runs all three hotter than dark so translucent red reads as red, not pink, over a pale fill
  accent: string; // team accent — chrome fills/glow only, never a series
  accentInk: string; // accent as TEXT or icon color (AA on glass)
  onAccent: string; // ink for text sitting on a solid `accent` fill
  auroraA: string; // per-mode blob opacities (decorative, validator-exempt)
  auroraB: string;
  auroraC: string;

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
    pageBase: "#ececec",
    surface: "#faf8f5",
    plate: "rgba(240, 240, 242, 0.80)",
    plateBorder: "rgba(23, 25, 34, 0.08)",
    glass: "rgba(255, 255, 255, 0.40)",
    glass2: "rgba(255, 255, 255, 0.58)",
    glassBorder: "rgba(255, 255, 255, 0.62)",
    glassOpaque: "rgba(255, 255, 255, 0.85)",
    cardSolid: "rgba(224, 226, 230, 0.94)",
    glassMenu: "rgba(255, 255, 255, 1)",
    spec: "rgba(255, 255, 255, 0.8)",
    shadowCard: "0 24px 48px -28px rgba(23, 25, 34, 0.35)",
    shadowRaised: "0 30px 60px -24px rgba(23, 25, 34, 0.4)",
    glowBorderPct: "70%",
    glowRingPct: "50%",
    glowBlurPct: "78%",
    auroraA: "0.42",
    auroraB: "0.38",
    auroraC: "0.34",
    inkPrimary: "#171922",
    inkSecondary: "#585b66",
    inkMuted: "#716e67",
    grid: "#ece4d8",
    axis: "#d2c9ba",
    border: "rgba(23, 25, 34, 0.09)",
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
    surface: "#0f0f11",
    plate: "rgba(18, 18, 20, 0.6)",
    plateBorder: "rgba(255, 255, 255, 0.07)",
    glass: "rgba(30, 30, 34, 0.44)",
    glass2: "rgba(255, 255, 255, 0.09)",
    glassBorder: "rgba(255, 255, 255, 0.14)",
    glassOpaque: "rgba(26, 26, 30, 0.85)",
    cardSolid: "rgba(26, 26, 30, 0.85)",
    glassMenu: "rgba(26, 26, 30, 1)",
    spec: "rgba(255, 255, 255, 0.14)",
    shadowCard: "0 24px 48px -20px rgba(0, 0, 0, 0.65)",
    shadowRaised: "0 30px 56px -18px rgba(0, 0, 0, 0.75)",
    glowBorderPct: "45%",
    glowRingPct: "30%",
    glowBlurPct: "60%",
    auroraA: "0.20",
    auroraB: "0.18",
    auroraC: "0.16",
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
    "--accent": t.accent,
    "--accent-ink": t.accentInk,
    "--on-accent": t.onAccent,
    "--aurora-a": t.auroraA,
    "--aurora-b": t.auroraB,
    "--aurora-c": t.auroraC,
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
