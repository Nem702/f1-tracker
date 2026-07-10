// Row shapes as the FastAPI layer returns them — these mirror schema.sql
// column-for-column (Postgres NUMERIC arrives as a JSON number, TIMESTAMPTZ
// as an ISO string). Anything nullable in the schema is nullable here.

export interface Race {
  session_key: number;
  location: string | null;
  country_name: string | null;
  circuit_short_name: string | null;
  date_start: string | null;
  date_end: string | null;
  year: number | null;
}

export interface Driver {
  driver_number: number;
  name: string;
  team_name: string | null;
  name_acronym: string | null;
}

export interface Lap {
  session_key: number;
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
  st_speed: number | null;
  is_pit_out_lap: boolean | null;
}

export interface Stint {
  session_key: number;
  driver_number: number;
  stint_number: number;
  lap_start: number | null;
  lap_end: number | null;
  compound: string | null;
  tyre_age_at_start: number | null;
}

export interface PitStop {
  session_key: number;
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
  date: string | null;
}

export interface PositionRow {
  session_key: number;
  driver_number: number;
  date: string;
  position: number | null;
}

export interface WeatherRow {
  session_key: number;
  date: string;
  air_temperature: number | null;
  track_temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  rainfall: number | null;
  wind_direction: number | null;
  wind_speed: number | null;
}

export interface RaceControlRow {
  id: number;
  session_key: number;
  date: string | null;
  category: string | null;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  driver_number: number | null;
  message: string | null;
}

/** GET /api/next-race is the one endpoint backed by a live OpenF1 call
 *  (the races table has no future rows) instead of a DB read — see that
 *  endpoint's docstring in api/main.py. `next_session` is null when OpenF1
 *  has nothing upcoming, or when the live call failed with no cache yet. */
export interface NextSession {
  session_name: string | null;
  circuit_short_name: string | null;
  location: string | null;
  country_name: string | null;
  date_start: string; // ISO 8601 with UTC offset
}

export interface NextRaceResponse {
  next_session: NextSession | null;
  fetched_at: string;
}

/** GET /api/race-weekend — Jolpica-backed (Ergast schema), cached ~6h
 *  server-side. `race_weekend` is null when neither this year's nor next
 *  year's schedule has an upcoming race (should be rare — mainly a brief
 *  window right at a season rollover before the new calendar is published). */
export interface WeekendSession {
  name: string; // "Practice 1" | "Practice 2" | "Practice 3" | "Sprint Qualifying" | "Sprint" | "Qualifying" | "Race"
  date_start: string; // ISO 8601 with UTC offset
}

export interface CircuitLapRecord {
  time: string;
  driver: string;
  year: number;
}

/** Hand-curated per-circuit facts (backend/shared/circuit_facts.json),
 *  joined onto the race-weekend payload by circuit_id. Every field is
 *  optional — the Circuit card renders only what exists, and a circuit
 *  missing from the file arrives as facts: null. */
export interface CircuitFacts {
  length_km?: number;
  turns?: number;
  laps?: number;
  first_gp?: number;
  lap_record?: CircuitLapRecord | null;
  note?: string;
}

export interface CircuitInfo {
  circuit_id: string;
  name: string | null;
  locality: string | null;
  country: string | null;
  lat: number;
  long: number;
  facts: CircuitFacts | null;
}

export interface LastYearWinner {
  season: number;
  driver_name: string | null;
  constructor_name: string | null;
}

export interface DriverStandingRow {
  position: number;
  driver_name: string;
  code: string | null;
  team_name: string | null;
  points: number;
}

export interface ConstructorStandingRow {
  position: number;
  team_name: string;
  points: number;
}

/** A single driver's classification row from Jolpica's official race (or
 *  sprint) results — grid/finish position, status, time gap, points, and
 *  fastest-lap info. Shared by /api/races/{sk}/official-result (both its
 *  `race` and `sprint` arrays) and /api/race-weekend's `previous_race`. */
export interface RaceResultRow {
  position: number | null;
  position_text: string | null;
  points: number | null;
  driver_code: string | null;
  driver_name: string;
  constructor_name: string | null;
  grid: number | null;
  laps: number | null;
  status: string | null;
  time: string | null;
  fastest_lap_rank: number | null;
  fastest_lap_time: string | null;
}

export interface QualifyingRow {
  position: number | null;
  driver_code: string | null;
  driver_name: string;
  constructor_name: string | null;
  q1: string | null;
  q2: string | null;
  q3: string | null;
}

/** GET /api/races/{session_key}/official-result — joined from our own
 *  `races` row to its Jolpica season/round by race date (see
 *  find_jolpica_round in api/main.py). `sprint` is null for a non-sprint
 *  weekend; `official_result` itself is null if the join or fetch failed
 *  (rare — this is a past, already-completed race). */
export interface OfficialResult {
  season: number;
  round: number;
  race_name: string | null;
  has_sprint: boolean;
  qualifying: QualifyingRow[];
  race: RaceResultRow[];
  sprint: RaceResultRow[] | null;
}

export interface OfficialResultResponse {
  official_result: OfficialResult | null;
  fetched_at: string;
}

/** The most recently completed race, embedded in /api/race-weekend —
 *  top-3 classification, the outright fastest lap of the race, and the
 *  sprint's top-3 when that weekend had one. No points-swing field:
 *  Jolpica doesn't expose pre-race standings snapshots, so it isn't
 *  computable without approximating. */
export interface PreviousRaceRecap {
  season: number;
  round: number;
  race_name: string | null;
  date: string;
  top3: RaceResultRow[];
  fastest_lap: RaceResultRow | null;
  sprint_top3: RaceResultRow[] | null;
}

export interface RaceWeekend {
  season: number;
  round: number;
  total_rounds: number;
  race_name: string | null;
  date_start: string;
  circuit: CircuitInfo;
  sessions: WeekendSession[];
  last_year_winner: LastYearWinner | null;
  previous_race: PreviousRaceRecap | null;
  driver_standings: DriverStandingRow[];
  constructor_standings: ConstructorStandingRow[];
}

export interface RaceWeekendResponse {
  race_weekend: RaceWeekend | null;
  fetched_at: string;
}

/** GET /api/standings — full/uncapped current-season driver + constructor
 *  tables, for the dedicated Standings page. Race Weekend's own top-5
 *  cards are unaffected by this (separate endpoint, separate cache). */
export interface Standings {
  season: number;
  driver_standings: DriverStandingRow[];
  constructor_standings: ConstructorStandingRow[];
}

export interface StandingsResponse {
  standings: Standings | null;
  fetched_at: string;
}
