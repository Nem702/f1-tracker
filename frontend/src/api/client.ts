import type {
  DeltaRow,
  Driver,
  Lap,
  NextRaceResponse,
  PitStop,
  PositionRow,
  Race,
  RaceControlRow,
  Stint,
  WeatherRow,
} from "./types";

// One place to point the frontend at a different API host later (deployment);
// locally the FastAPI dev server default is used.
const BASE: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} for ${path}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  races: () => get<Race[]>("/api/races"),
  drivers: () => get<Driver[]>("/api/drivers"),
  laps: (sk: number) => get<Lap[]>(`/api/races/${sk}/laps`),
  stints: (sk: number) => get<Stint[]>(`/api/races/${sk}/stints`),
  pit: (sk: number) => get<PitStop[]>(`/api/races/${sk}/pit`),
  positions: (sk: number) => get<PositionRow[]>(`/api/races/${sk}/positions`),
  weather: (sk: number) => get<WeatherRow[]>(`/api/races/${sk}/weather`),
  raceControl: (sk: number) =>
    get<RaceControlRow[]>(`/api/races/${sk}/race-control`),
  delta: (sk: number) => get<DeltaRow[]>(`/api/races/${sk}/delta`),
  nextRace: () => get<NextRaceResponse>("/api/next-race"),
};
