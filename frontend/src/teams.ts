// The team/driver domain model behind the team switcher and head-to-head
// mode. Everything is derived from /api/drivers rows at runtime — driver
// numbers, acronyms, and team membership are never hardcoded (same rule as
// the backend pipeline). The only static data here is the four tracked
// teams (slug, display name, display order) and which acronym anchors each
// team's color slot 0.

import type { Driver } from "./api/types";

export type TeamSlug = "ferrari" | "mercedes" | "mclaren" | "redbull";

/** Fixed display order everywhere teams are listed: chips, selects, About. */
export const TEAM_ORDER: readonly TeamSlug[] = [
  "ferrari",
  "mercedes",
  "mclaren",
  "redbull",
];

export const TEAM_NAMES: Record<TeamSlug, string> = {
  ferrari: "Ferrari",
  mercedes: "Mercedes",
  mclaren: "McLaren",
  redbull: "Red Bull",
};

/** Which driver anchors each team's color slot 0 (the slot that doubles as
 *  the team accent — see theme.ts's palette seeds: LEC rosso, RUS teal,
 *  NOR papaya, VER blue). Every other driver of the team takes slot 1.
 *  Membership of the duo is data-driven (first two by driver_number); this
 *  only decides which of the two wears which validated color. */
const SLOT0_ACRONYM: Record<TeamSlug, string> = {
  ferrari: "LEC",
  mercedes: "RUS",
  mclaren: "NOR",
  redbull: "VER",
};

export interface DriverRef {
  number: number;
  acronym: string; // name_acronym from the API (end-labels, chips)
  lastName: string; // "Lewis HAMILTON" → "Hamilton"
  fullName: string;
  teamSlug: TeamSlug;
  slot: 0 | 1; // color slot within the team palette
}

export type DriverPair = [DriverRef, DriverRef];

export interface TeamRoster {
  slug: TeamSlug;
  name: string;
  /** All tracked drivers of the team, by driver_number (H2H offers all). */
  drivers: DriverRef[];
  /** The pair a team chip selects: first two by driver_number, ordered
   *  slot-0 driver first so pair position matches color slot. */
  duo: DriverPair;
}

/** "Red Bull Racing" → "redbull", "Scuderia Ferrari" → "ferrari", … —
 *  substring match so OpenF1's sponsor-decorated names keep resolving. */
export function teamSlugFromName(teamName: string | null): TeamSlug | null {
  if (!teamName) return null;
  const lower = teamName.toLowerCase();
  if (lower.includes("ferrari")) return "ferrari";
  if (lower.includes("mercedes")) return "mercedes";
  if (lower.includes("mclaren")) return "mclaren";
  if (lower.includes("red bull")) return "redbull";
  return null;
}

/** OpenF1 names arrive "Given FAMILY" — the all-caps tail is the family
 *  name. Title-case it for display; fall back to the last word. */
function lastNameFrom(name: string): string {
  const words = name.trim().split(/\s+/);
  const caps = words.filter((w) => w.length > 1 && w === w.toUpperCase());
  const family = caps.length > 0 ? caps : [words[words.length - 1]];
  return family
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Group /api/drivers rows into the four tracked teams, in display order.
 *  Teams with no rows (or a lone driver) simply don't produce a roster —
 *  chips render from whatever comes back, so a schema surprise degrades to
 *  fewer options, not a crash. */
export function buildRosters(drivers: Driver[]): TeamRoster[] {
  const byTeam = new Map<TeamSlug, Driver[]>();
  for (const d of drivers) {
    const slug = teamSlugFromName(d.team_name);
    if (!slug) continue;
    const list = byTeam.get(slug) ?? [];
    list.push(d);
    byTeam.set(slug, list);
  }

  const rosters: TeamRoster[] = [];
  for (const slug of TEAM_ORDER) {
    const rows = (byTeam.get(slug) ?? []).sort(
      (a, b) => a.driver_number - b.driver_number,
    );
    if (rows.length < 2) continue;

    const refs: DriverRef[] = rows.map((d) => ({
      number: d.driver_number,
      acronym: d.name_acronym ?? d.name.slice(0, 3).toUpperCase(),
      lastName: lastNameFrom(d.name),
      fullName: d.name,
      teamSlug: slug,
      slot: d.name_acronym === SLOT0_ACRONYM[slug] ? 0 : 1,
    }));

    // Duo membership: first two by driver_number (a mid-season swap adds a
    // third driver — H2H exposes them, the chip keeps the established two).
    const duoMembers = refs.slice(0, 2);
    const lead = duoMembers.find((d) => d.slot === 0);
    const other = duoMembers.find((d) => d !== lead);
    const duo: DriverPair = lead && other ? [lead, other] : [duoMembers[0], duoMembers[1]];

    rosters.push({ slug, name: TEAM_NAMES[slug], drivers: refs, duo });
  }
  return rosters;
}

export function findDriver(
  rosters: TeamRoster[],
  driverNumber: number,
): DriverRef | null {
  for (const roster of rosters) {
    const hit = roster.drivers.find((d) => d.number === driverNumber);
    if (hit) return hit;
  }
  return null;
}

/** Same team → that team's chrome; mixed head-to-head pair → neutral. */
export function pairTeamSlug(pair: DriverPair | null): TeamSlug | null {
  if (!pair) return "ferrari"; // pre-data default matches the pair fallback
  return pair[0].teamSlug === pair[1].teamSlug ? pair[0].teamSlug : null;
}
