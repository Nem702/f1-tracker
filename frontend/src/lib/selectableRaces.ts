// "Anything not actually raced is not offered" — the predicate behind the
// race picker's has_laps filter (see docs/handoff/07-hero-polish.md, Fix 1).
// Pulled into its own pure module, DOM-free like heroRace.ts and
// heroCircuit.ts, so it's reachable from node --test without a browser and
// App.tsx's two RaceSelector instances plus its default-selection effect can
// all share one answer instead of three chances to disagree.

import type { Race } from "../api/types";

/** A race is selectable when the backend reports laps for it AND it isn't a
 *  future date. `has_laps` is the load-bearing clause — a cancelled 2026
 *  round (Sakhir, Jeddah) has a `races` row but no laps, stored before the
 *  pipeline learned to filter `is_cancelled`. The date clause states intent
 *  and guards a partially-fetched live session; a future race can't have
 *  laps either way, so it's redundant with has_laps in practice but kept for
 *  clarity. If the filter would empty the list entirely (a backend that
 *  somehow reports has_laps: false everywhere), callers get the unfiltered
 *  list back rather than a dashboard with nothing to pick. */
export function filterSelectableRaces(races: Race[], now: number): Race[] {
  const filtered = races.filter(
    (r) => r.has_laps && (r.date_start == null || Date.parse(r.date_start) <= now),
  );
  return filtered.length > 0 ? filtered : races;
}
