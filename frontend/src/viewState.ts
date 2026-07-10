// The page's section list, in scroll order — shared by App.tsx (renders
// each section as `<section id="...">`, drives useScrollSpy) and
// Navbar.tsx (renders the nav that scrolls to one). Split into its own
// module so neither component file has to export a non-component value
// (keeps Fast Refresh happy; oxlint's react(only-export-components) rule
// flags that).
export const SECTIONS = [
  "hero",
  "next-race",
  "last-race",
  "last-race-results",
  "season-standings",
  "telemetry",
  "about",
] as const;
export type SectionId = (typeof SECTIONS)[number];

/** Resolves a raw `location.hash` to a known section, falling back to
 *  "hero" for anything unrecognized (first load with no hash, a stale/
 *  external link, etc). Used once on mount to decide whether to jump to a
 *  mid-page section instead of the top — NOT kept in sync on every scroll
 *  tick, that's useScrollSpy's job. */
export function normalizeHash(hash: string): SectionId {
  const clean = hash.replace(/^#/, "");
  return (SECTIONS as readonly string[]).includes(clean) ? (clean as SectionId) : "hero";
}
