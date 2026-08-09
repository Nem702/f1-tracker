// The real-world brand colour each team's derived palette was seeded FROM:
// `team_colour` on OpenF1's /v1/drivers, 2026 season.
//
// PROVENANCE, NOT A COLOUR. Nothing here is renderable. A seed has been through
// no contrast check, no CVD check and no compositing — putting one on screen is
// exactly the failure `npm run validate:theme` exists to prevent, and it would
// bypass that validator entirely because a raw brand hex has no derived value
// to check against. The whole point of the derived palette in theme.ts is that
// these values could NOT be used directly: 7 of the 11 2026 seeds land below
// the 3:1 non-text floor on the light plate, and 7 of the 55 pairs collide
// under CVD (see PLAN-full-grid-and-logos.md §3 for the measured tables).
//
// So why record them at all? Because without the seed, the validator cannot see
// when one team's derived colour drifts onto ANOTHER team's real-world brand —
// it can only compare derived values against other derived values. That check
// (`<mode> · team plate vs rival seed`) is the only consumer of this file.
//
// This is a SIBLING MODULE rather than an export of theme.ts so the isolation is
// structural instead of a convention: theme.ts is imported by ~30 components and
// an extra export there is one autocomplete away from shipping. Here, the only
// importer is scripts/validate-theme.ts, and that validator FAILs if anything
// under src/ ever names this module. See its `provenance` check.
//
// The seven teams the app does not track yet (Aston, Williams, Audi, Alpine,
// Haas, Racing Bulls, Cadillac) have their seeds recorded in
// PLAN-full-grid-and-logos.md §3 until those teams exist in TeamSlug. Typing
// this as Record<TeamSlug, string> is deliberate: adding a team is a type error
// until its seed is recorded alongside its derived values.

import type { TeamSlug } from "./teams";

export const TEAM_SEEDS: Record<TeamSlug, string> = {
  ferrari: "#ed1131",
  mercedes: "#00d7b6",
  mclaren: "#f47600",
  redbull: "#4781d7",
};
