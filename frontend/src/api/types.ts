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

/** One row per lap both drivers completed with a recorded time.
 *  Positive delta = Leclerc was faster that lap (Hamilton's took longer). */
export interface DeltaRow {
  lap_number: number;
  hamilton_duration: number;
  leclerc_duration: number;
  delta: number;
}
