// Joining a `Race` row to a circuit outline.
//
// `Race` carries no circuit id — only three free-text fields from OpenF1
// (`circuit_short_name`, `location`, `country_name`) — so this is a lookup
// against explicit vocabularies, in the same spirit as `teamSlugFromName` in
// teams.ts: enumerate what the upstream actually says, never pattern-guess,
// and return null rather than pick something plausible. A null renders the
// hero's intro and pickers without the stage, which is a correct degradation.
//
// THE TRAP THIS FILE EXISTS FOR. The three tiers are NOT interchangeable.
// `country_name` is ambiguous for two countries — Spain hosts Barcelona AND
// Madrid, the United States hosts Miami, Austin AND Las Vegas — so those
// countries are deliberately absent from COUNTRY_ALIASES. A country tier that
// listed them would resolve "United States" to whichever round happened to be
// typed first and render the wrong circuit under the right race name, which is
// worse than rendering nothing. Circuit name is tried first, then location,
// and only then the unambiguous countries.

// The explicit `.ts` on this specifier is deliberate and is the only one of
// its kind in src/. scripts/heroCircuit.test.ts imports this module, and
// `node --test --experimental-strip-types` resolves as real ESM — it cannot
// follow an extensionless relative specifier for a VALUE import. (Everywhere
// else in src/ the cross-file imports that tests reach are `import type`,
// which is erased before Node ever sees it.) `allowImportingTsExtensions` is
// already on in tsconfig.app.json, and Vite resolves it unchanged.
import { HERO_CIRCUITS, type HeroCircuit } from "../data/heroCircuits.ts";
import type { Race } from "../api/types";

/** Lowercase, strip accents (`Montréal`), drop every non-alphanumeric
 *  (`Spa-Francorchamps`, `Monte Carlo`). Keeps the vocabularies below free of
 *  punctuation variants that upstream may or may not send. */
export function normalizeCircuitKey(value: string | null): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** By `circuit_short_name`. Every one of the 24 pack entries is reachable
 *  from this tier alone; the two below it are fallbacks for upstreams that
 *  send a different field. */
const CIRCUIT_ALIASES: Record<string, string> = {
  melbourne: "au-1953",
  albertpark: "au-1953",
  shanghai: "cn-2004",
  suzuka: "jp-1962",
  sakhir: "bh-2002",
  bahrain: "bh-2002",
  jeddah: "sa-2021",
  miami: "us-2022",
  montreal: "ca-1978",
  gillesvilleneuve: "ca-1978",
  montecarlo: "mc-1929",
  monaco: "mc-1929",
  catalunya: "es-1991",
  barcelona: "es-1991",
  spielberg: "at-1969",
  redbullring: "at-1969",
  silverstone: "gb-1948",
  spafrancorchamps: "be-1925",
  spa: "be-1925",
  hungaroring: "hu-1986",
  zandvoort: "nl-1948",
  monza: "it-1922",
  madring: "es-2026",
  madrid: "es-2026",
  baku: "az-2016",
  singapore: "sg-2008",
  marinabay: "sg-2008",
  austin: "us-2012",
  cota: "us-2012",
  mexicocity: "mx-1962",
  interlagos: "br-1940",
  saopaulo: "br-1940",
  lasvegas: "us-2023",
  lusail: "qa-2004",
  losail: "qa-2004",
  yasmarina: "ae-2009",
};

/** By `location`. Differs from the circuit name on six rounds — OpenF1 sends
 *  location "Miami Gardens" for circuit "Miami", "Budapest" for
 *  "Hungaroring", "Barcelona" for "Catalunya", and so on. */
const LOCATION_ALIASES: Record<string, string> = {
  melbourne: "au-1953",
  shanghai: "cn-2004",
  suzuka: "jp-1962",
  sakhir: "bh-2002",
  jeddah: "sa-2021",
  miamigardens: "us-2022",
  miami: "us-2022",
  montreal: "ca-1978",
  montecarlo: "mc-1929",
  barcelona: "es-1991",
  spielberg: "at-1969",
  silverstone: "gb-1948",
  spafrancorchamps: "be-1925",
  budapest: "hu-1986",
  zandvoort: "nl-1948",
  monza: "it-1922",
  madrid: "es-2026",
  baku: "az-2016",
  singapore: "sg-2008",
  austin: "us-2012",
  mexicocity: "mx-1962",
  saopaulo: "br-1940",
  lasvegas: "us-2023",
  lusail: "qa-2004",
  yasmarina: "ae-2009",
  abudhabi: "ae-2009",
};

/** By `country_name`, and ONLY where the country hosts exactly one 2026
 *  round. Spain (Barcelona + Madrid) and the United States (Miami + Austin +
 *  Las Vegas) are deliberately omitted — see the header note. */
const COUNTRY_ALIASES: Record<string, string> = {
  australia: "au-1953",
  china: "cn-2004",
  japan: "jp-1962",
  bahrain: "bh-2002",
  saudiarabia: "sa-2021",
  canada: "ca-1978",
  monaco: "mc-1929",
  austria: "at-1969",
  unitedkingdom: "gb-1948",
  greatbritain: "gb-1948",
  belgium: "be-1925",
  hungary: "hu-1986",
  netherlands: "nl-1948",
  italy: "it-1922",
  azerbaijan: "az-2016",
  singapore: "sg-2008",
  mexico: "mx-1962",
  brazil: "br-1940",
  qatar: "qa-2004",
  unitedarabemirates: "ae-2009",
};

const BY_ID = new Map(HERO_CIRCUITS.map((c) => [c.id, c]));

/** Resolve a circuit id to its outline. Exported for the tests, which assert
 *  every alias points at a circuit that actually exists in the pack. */
export function heroCircuitById(id: string): HeroCircuit | null {
  return BY_ID.get(id) ?? null;
}

/** The circuit for a race, or null when none of the three vocabularies
 *  recognise it. Callers render the hero without its stage on null. */
export function circuitForRace(race: Race | null): HeroCircuit | null {
  if (!race) return null;
  const id =
    CIRCUIT_ALIASES[normalizeCircuitKey(race.circuit_short_name)] ??
    LOCATION_ALIASES[normalizeCircuitKey(race.location)] ??
    COUNTRY_ALIASES[normalizeCircuitKey(race.country_name)] ??
    null;
  return id ? heroCircuitById(id) : null;
}

/** Exported so the test can prove every one of the 24 pack entries is
 *  reachable by at least one alias — a circuit nobody can reach is a circuit
 *  that silently never renders. */
export const HERO_CIRCUIT_ALIAS_TABLES = {
  circuit: CIRCUIT_ALIASES,
  location: LOCATION_ALIASES,
  country: COUNTRY_ALIASES,
};
