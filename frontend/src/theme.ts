// Single source of truth for every color in the app. All hexes come from the
// dataviz reference palette and were run through its six-checks validator:
//   - driver pair (blue/red): all checks pass in both modes (CVD ΔE 74.6 / 66.4)
//   - compound scale: "hard" is deliberately gray (that's the real tire color),
//     which fails the chroma floor by design — the in-segment compound letter,
//     legend, tooltip, and table view carry identity so color is never alone.
// The same blue/red pair doubles as the diverging poles of the delta chart,
// so "blue = Hamilton, red = Leclerc" holds everywhere. Color follows the
// entity — it never changes with filtering or rank.

export type Mode = "light" | "dark";

export interface Theme {
  page: string; // page plane behind the cards
  surface: string; // chart/card surface (validator surface)
  inkPrimary: string;
  inkSecondary: string;
  inkMuted: string; // axis labels, captions
  grid: string; // hairline gridlines
  axis: string; // baseline / zero line
  border: string; // hairline card ring
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
    page: "#f9f9f7",
    surface: "#fcfcfb",
    inkPrimary: "#0b0b0b",
    inkSecondary: "#52514e",
    inkMuted: "#898781",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    border: "rgba(11, 11, 11, 0.10)",
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
    page: "#0d0d0d",
    surface: "#1a1a19",
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
    "--surface": t.surface,
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
