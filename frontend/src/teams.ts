// The team/driver domain model behind the team switcher and head-to-head
// mode. Everything is derived from /api/drivers rows at runtime — driver
// numbers, acronyms, and team membership are never hardcoded (same rule as
// the backend pipeline). The only static data here is the eleven tracked
// teams (slug, display name, display order, three-letter code) and which
// acronym anchors each team's color slot 0.
//
// NO COLORS LIVE HERE. theme.ts is the single source of truth for every hex
// in the app, including each team's palette and badge. This file holds the
// identity; that one holds the paint.

import type { Driver } from "./api/types";

export type TeamSlug =
  | "ferrari"
  | "mercedes"
  | "mclaren"
  | "redbull"
  | "astonmartin"
  | "williams"
  | "audi"
  | "alpine"
  | "haas"
  | "racingbulls"
  | "cadillac";

/** Fixed display order everywhere teams are listed: chips, selects, About.
 *  FIXED, and deliberately not championship order — standings move week to
 *  week and a switcher whose chips reorder themselves is unusable as muscle
 *  memory. Never sort this at runtime. */
export const TEAM_ORDER: readonly TeamSlug[] = [
  "ferrari",
  "mercedes",
  "mclaren",
  "redbull",
  "astonmartin",
  "williams",
  "audi",
  "alpine",
  "haas",
  "racingbulls",
  "cadillac",
];

export const TEAM_NAMES: Record<TeamSlug, string> = {
  ferrari: "Ferrari",
  mercedes: "Mercedes",
  mclaren: "McLaren",
  redbull: "Red Bull",
  astonmartin: "Aston Martin",
  williams: "Williams",
  audi: "Audi",
  alpine: "Alpine",
  haas: "Haas",
  racingbulls: "Racing Bulls",
  cadillac: "Cadillac",
};

/** Three-letter team codes, for surfaces too narrow for the full name.
 *  RBR and BUL are the pair that matter: "Red Bull" and "Racing Bulls" are
 *  the one collision in the grid, so their codes share no prefix. */
export const TEAM_CODES: Record<TeamSlug, string> = {
  ferrari: "FER",
  mercedes: "MER",
  mclaren: "MCL",
  redbull: "RBR",
  astonmartin: "AST",
  williams: "WIL",
  audi: "AUD",
  alpine: "ALP",
  haas: "HAA",
  racingbulls: "BUL",
  cadillac: "CAD",
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
  astonmartin: "ALO",
  williams: "ALB",
  audi: "HUL",
  alpine: "GAS",
  haas: "OCO",
  racingbulls: "LAW",
  cadillac: "PER",
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
 *  substring match so OpenF1's sponsor-decorated names keep resolving.
 *
 *  TWO VOCABULARIES. This is fed from OpenF1 (`/api/drivers` → `team_name`)
 *  AND from Jolpica (`constructor_name`, via standings and official results).
 *  They disagree on three teams, and on one of them they share no substring
 *  at all: OpenF1 says "Racing Bulls", Jolpica says "RB F1 Team".
 *
 *  ORDER IS LOAD-BEARING. Racing Bulls is tested first, on both of its names,
 *  because "Racing Bulls" contains "bulls" and a Red Bull test loose enough to
 *  catch "bull" — or a Racing Bulls test loose enough to catch a bare "rb" —
 *  swallows the other team entirely. The failure is silent: a wrong slug is
 *  still truthy, so it renders as the wrong team's colour rather than as an
 *  error. Keep both patterns specific, keep them above Red Bull, and keep
 *  Red Bull's test the exact two-word form. scripts/teams.test.ts guards
 *  this in both directions. */
export function teamSlugFromName(teamName: string | null): TeamSlug | null {
  if (!teamName) return null;
  const lower = teamName.toLowerCase();
  // Racing Bulls, both vocabularies, BEFORE any Red Bull test. See above.
  if (lower.includes("racing bulls")) return "racingbulls";
  if (lower.includes("rb f1")) return "racingbulls";
  if (lower.includes("red bull")) return "redbull";
  if (lower.includes("ferrari")) return "ferrari";
  if (lower.includes("mercedes")) return "mercedes";
  if (lower.includes("mclaren")) return "mclaren";
  if (lower.includes("aston martin")) return "astonmartin";
  if (lower.includes("williams")) return "williams";
  if (lower.includes("audi")) return "audi";
  if (lower.includes("alpine")) return "alpine";
  if (lower.includes("haas")) return "haas";
  if (lower.includes("cadillac")) return "cadillac";
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

/** Group /api/drivers rows into the eleven tracked teams, in display order.
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
