// Shared status → colour mapping for anything that shows a coloured dot for
// track state. RaceControlFeed and the hero's HeroCircuit narration both need
// one, and this is the single place that maps a status to a token — exactly
// the pattern isSafetyCarRow already establishes in lib/heroRace.ts, so the
// two callers can never drift apart on what a colour means.

import type { Theme } from "../theme";

export type TrackStatus = "green" | "yellow" | "safetyCar" | "red" | "none";

export function trackStatusColor(status: TrackStatus, theme: Theme): string | null {
  switch (status) {
    case "green":
      return theme.flagGood;
    case "yellow":
      return theme.flagWarning;
    case "safetyCar":
      return theme.flagSerious;
    case "red":
      return theme.flagCritical;
    case "none":
      return null;
  }
}
