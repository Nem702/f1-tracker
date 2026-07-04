// The app's view list, shared by App.tsx (renders the active view) and
// Sidebar.tsx (renders the nav that switches it) — split into its own module
// so neither component file has to export a non-component value (keeps Fast
// Refresh happy; oxlint's react(only-export-components) rule flags that).
export const VIEWS = ["overview", "race-analysis", "about"] as const;
export type View = (typeof VIEWS)[number];

export function normalizeHash(hash: string): View {
  const clean = hash.replace(/^#/, "");
  return (VIEWS as readonly string[]).includes(clean) ? (clean as View) : "overview";
}
