import { Suspense, lazy } from "react";
import type { ApiState } from "../hooks/useApi";
import type { Lap, PitStop, PositionRow, Race, RaceControlRow, Stint, WeatherRow } from "../api/types";
import type { DriverPair, TeamRoster } from "../teams";
import type { PairDelta } from "../lib/delta";
import { SectionHeading } from "./SectionHeading";
import { RaceSelector } from "./RaceSelector";
import { TeamSwitcher } from "./TeamSwitcher";
import { StatTiles } from "./StatTiles";
import { Reveal } from "./Reveal";

// Recharts is only ever needed for this one section — lazy-loading keeps it
// out of the initial bundle for everyone who never scrolls this far.
const LapTimeChart = lazy(() => import("./LapTimeChart").then((m) => ({ default: m.LapTimeChart })));
const DeltaChart = lazy(() => import("./DeltaChart").then((m) => ({ default: m.DeltaChart })));
const TireStrategy = lazy(() => import("./TireStrategy").then((m) => ({ default: m.TireStrategy })));
const PitStopChart = lazy(() => import("./PitStopChart").then((m) => ({ default: m.PitStopChart })));
const PositionChart = lazy(() => import("./PositionChart").then((m) => ({ default: m.PositionChart })));
const WeatherChart = lazy(() => import("./WeatherChart").then((m) => ({ default: m.WeatherChart })));
const RaceControlFeed = lazy(() =>
  import("./RaceControlFeed").then((m) => ({ default: m.RaceControlFeed })),
);

interface Props {
  races: Race[];
  selected: number | null;
  onSelectRace: (sessionKey: number) => void;
  race: Race | null;
  raceLabel: string;
  racesError: string | null;
  pair: DriverPair | null;
  /** Rosters + the shared pair setter power the in-section pair switcher —
   *  the same TeamSwitcher the hero uses, wired to App's one setPair (no
   *  duplicate pair state), so a visitor can change the head-to-head pair
   *  without scrolling back up to Overview. */
  rosters: TeamRoster[];
  onSelectPair: (a: number, b: number) => void;
  laps: ApiState<Lap[]>;
  stints: ApiState<Stint[]>;
  pit: ApiState<PitStop[]>;
  positions: ApiState<PositionRow[]>;
  weather: ApiState<WeatherRow[]>;
  raceControl: ApiState<RaceControlRow[]>;
  deltaRows: PairDelta[];
}

/** #telemetry section body: the deep dive. A race picker (the pair itself
 *  is picked once, up in #hero, and carries through unchanged), the
 *  StatTiles header summary, then every continuous OpenF1 telemetry chart —
 *  laps, delta, tires, pit stops, track position, weather, race control.
 *  Kept last since it's the most demanding data type and least
 *  "at a glance," and it's the one section where OpenF1's own gaps (Sakhir/
 *  Jeddah shipped a roster with zero telemetry) are visible and explained
 *  rather than silently empty. */
export function Telemetry({
  races,
  selected,
  onSelectRace,
  race,
  raceLabel,
  racesError,
  pair,
  rosters,
  onSelectPair,
  laps,
  stints,
  pit,
  positions,
  weather,
  raceControl,
  deltaRows,
}: Props) {
  const emptyRace = laps.data !== null && laps.data.length === 0;

  return (
    <>
      <SectionHeading
        index={5}
        eyebrow="Telemetry"
        title="Pick a race. See how it unfolded."
        description="Every chart below is built from second-by-second car telemetry for one selected race weekend: pace, tire choices, pit stops, running order, track conditions, and every flag race control issued."
      />

      <div className="filters">
        <RaceSelector races={races} value={selected} onChange={onSelectRace} />
        {race && (
          <span className="filters__meta">
            {race.country_name} · {race.circuit_short_name}
          </span>
        )}
        {emptyRace && (
          <span className="filters__note">
            OpenF1 published no telemetry for this race — every panel below is
            empty by design, not by error.
          </span>
        )}
        {racesError && <span className="filters__note">{racesError}</span>}
      </div>

      {/* Same pair switcher as the hero, wired to the same setPair — change the
          team or compose a head-to-head pair without scrolling back up. */}
      {rosters.length > 0 && pair && (
        <div className="telemetry__pair-switcher">
          <TeamSwitcher rosters={rosters} pair={pair} onSelectPair={onSelectPair} />
        </div>
      )}

      <StatTiles
        laps={laps.data ?? []}
        pit={pit.data ?? []}
        delta={deltaRows}
        pair={pair}
        loading={laps.loading || pit.loading}
        raceLabel={raceLabel}
      />

      <Suspense fallback={null}>
        <main className="grid">
          <Reveal wide>
            <LapTimeChart laps={laps.data ?? []} pair={pair} loading={laps.loading} error={laps.error} />
          </Reveal>
          <Reveal wide>
            <DeltaChart rows={deltaRows} pair={pair} loading={laps.loading} error={laps.error} />
          </Reveal>
          <Reveal>
            <TireStrategy stints={stints.data ?? []} pair={pair} loading={stints.loading} error={stints.error} />
          </Reveal>
          <Reveal delay={0.08}>
            <PitStopChart pit={pit.data ?? []} pair={pair} loading={pit.loading} error={pit.error} />
          </Reveal>
          <Reveal wide>
            <PositionChart
              positions={positions.data ?? []}
              pair={pair}
              loading={positions.loading}
              error={positions.error}
            />
          </Reveal>
          <Reveal>
            <WeatherChart weather={weather.data ?? []} loading={weather.loading} error={weather.error} />
          </Reveal>
          <Reveal delay={0.08}>
            <RaceControlFeed
              raceControl={raceControl.data ?? []}
              loading={raceControl.loading}
              error={raceControl.error}
            />
          </Reveal>
        </main>
      </Suspense>
    </>
  );
}
