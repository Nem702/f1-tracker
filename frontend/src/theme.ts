// Single source of truth for every color in the app. All hexes come from the
// dataviz reference palette (or, for the new UI-chrome slots below, its
// documented slot-8 orange) and were re-run through the six-checks validator
// against this redesign's new surfaces:
//   - driver pair (blue/red) + accent (orange), as one categorical set,
//     against both new surfaces: light (surface #fffaf3) worst adjacent
//     ΔE 16.2 · dark (surface #1a1a19) worst adjacent ΔE 26.3 — both clear
//     the 12.0 target with room, including the red↔orange pair (the one
//     CVD risk this redesign added, since red and orange sit close for
//     protan/deutan viewers).
//   - compound scale: "hard" is deliberately gray (that's the real tire
//     color), which fails the chroma floor by design — the in-segment
//     compound letter, legend, tooltip, and table view carry identity so
//     color is never alone. Compounds/flags are unchanged from Part 6 and
//     were re-run for contrast against the new light surface (still pass;
//     MEDIUM's sub-3:1 WARN and the flag WARNs are the same pre-existing,
//     documented exceptions — status colors are never validated as a
//     categorical set, see the dataviz skill's scope note).
// The same blue/red pair doubles as the diverging poles of the delta chart,
// so "blue = Hamilton, red = Leclerc" holds everywhere. Color follows the
// entity — it never changes with filtering or rank. Accent (orange) is a UI
// identity, never a data identity: it never appears as a chart series color,
// so it can't be confused with a driver.

export type Mode = "light" | "dark";

export interface Theme {
  // ---- layer stack (page < surface < raised) ----
  page: string; // flat page-plane fallback (pre-hydration bg, dark mode's page)
  pageGradientFrom: string; // light mode's warm corner glow; == page in dark
  pageGradientTo: string; // light mode's far-corner cream; == page in dark
  surface: string; // opaque card/chart surface (validator surface)
  glass: string; // translucent chrome recipe (sidebar, stat tiles) — rgba
  glassBorder: string; // frosted-edge highlight for glass cards — rgba
  raised: string; // one elevation step up: icon chips, active-pill bg, hover
  emphasis: string; // the "dark inset card" bg (Countdown) — always dark
  onEmphasis: string; // ink for content sitting on `emphasis`
  accent: string; // primary UI accent (orange) — chrome only, never a series
  onAccent: string; // ink for text sitting on a solid `accent` fill
  shadowCard: string; // default card elevation (box-shadow value)
  shadowRaised: string; // stronger elevation: hover / raised / emphasis

  // ---- ink & chart chrome ----
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string; // axis labels, captions
  grid: string; // hairline gridlines
  axis: string; // baseline / zero line
  border: string; // hairline card ring

  // ---- data identity (never themed away) ----
  hamilton: string; // categorical slot 1 (blue)
  leclerc: string; // categorical slot 6 (red) — also the warm diverging pole
  tempTrack: string; // sequential blue, dark step (related-measure pair…)
  tempAir: string; // …and its light step: one hue, two shades
  compounds: Record<string, string>; // Pirelli convention, palette-snapped
  flagGood: string;
  flagWarning: string;
  flagSerious: string;
  flagCritical: string;
}

export const themes: Record<Mode, Theme> = {
  light: {
    // HReazec: warm cream/peach gradient page, glass cards, navy-black ink.
    page: "#f7ece0",
    pageGradientFrom: "#fbe6d0",
    pageGradientTo: "#fdfbf9",
    surface: "#fffaf3",
    glass: "rgba(255, 250, 241, 0.62)",
    glassBorder: "rgba(255, 255, 255, 0.7)",
    raised: "#ffffff",
    emphasis: "#1e1b17",
    onEmphasis: "#ffffff",
    accent: "#eb6834",
    onAccent: "#14100a",
    shadowCard:
      "0 1px 2px rgba(120, 72, 24, 0.06), 0 24px 48px -28px rgba(120, 72, 24, 0.28)",
    shadowRaised:
      "0 2px 4px rgba(120, 72, 24, 0.08), 0 30px 60px -24px rgba(120, 72, 24, 0.32)",
    inkPrimary: "#171922",
    inkSecondary: "#585b66",
    inkMuted: "#898781",
    grid: "#ece4d8",
    axis: "#d2c9ba",
    border: "rgba(23, 25, 34, 0.09)",
    hamilton: "#2a78d6",
    leclerc: "#e34948",
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
    // Grapho: charcoal layer stack (page < surface < raised), orange accent.
    page: "#0d0d0d",
    pageGradientFrom: "#0d0d0d",
    pageGradientTo: "#0d0d0d",
    surface: "#1a1a19",
    glass: "rgba(26, 26, 25, 0.72)",
    glassBorder: "rgba(255, 255, 255, 0.08)",
    raised: "#242422",
    // Everything's already dark here, so the "emphasis" card is just the
    // same raised layer — the HReazec trick only does work in light mode.
    emphasis: "#242422",
    onEmphasis: "#ffffff",
    accent: "#d95926",
    onAccent: "#14100a",
    shadowCard:
      "inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 12px 28px -20px rgba(0, 0, 0, 0.65)",
    shadowRaised:
      "inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 18px 40px -18px rgba(0, 0, 0, 0.75)",
    inkPrimary: "#ffffff",
    inkSecondary: "#c3c2b7",
    inkMuted: "#898781",
    grid: "#2c2c2a",
    axis: "#383835",
    border: "rgba(255, 255, 255, 0.10)",
    hamilton: "#3987e5",
    leclerc: "#e66767",
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

/** Expose the theme as CSS custom properties so index.css styles the page
 *  chrome from the same values the charts read in JS — one source, no drift. */
export function cssVars(t: Theme): Record<string, string> {
  return {
    "--page": t.page,
    "--page-grad-from": t.pageGradientFrom,
    "--page-grad-to": t.pageGradientTo,
    "--surface": t.surface,
    "--glass": t.glass,
    "--glass-border": t.glassBorder,
    "--raised": t.raised,
    "--emphasis": t.emphasis,
    "--on-emphasis": t.onEmphasis,
    "--accent": t.accent,
    "--on-accent": t.onAccent,
    "--shadow-card": t.shadowCard,
    "--shadow-raised": t.shadowRaised,
    "--ink-primary": t.inkPrimary,
    "--ink-secondary": t.inkSecondary,
    "--ink-muted": t.inkMuted,
    "--grid": t.grid,
    "--axis": t.axis,
    "--border": t.border,
    "--ham": t.hamilton,
    "--lec": t.leclerc,
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
