import { Suspense, lazy, useEffect, useState } from "react";
import type { ApiState } from "../hooks/useApi";
import type { Lap, PitStop, PositionRow, Race, RaceControlRow, Stint, WeatherRow } from "../api/types";
import type { DriverPair, TeamRoster } from "../teams";
import type { PairDelta } from "../lib/delta";
import { summarizeRace, type RaceSummary } from "../lib/raceStory";
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

  // Atomic per-race snapshot for the header insight + stat tiles: the race
  // label and every derived number are captured together, and only once
  // every fetch they read from has settled — so a race switch can never
  // show a fresh label over stale values (or one tile ahead of another).
  // While the next race's data is in flight the previous snapshot holds,
  // dimmed. Charts keep their own per-fetch hold-previous behavior — each
  // is self-consistent; the lie was only ever in this cross-referenced
  // summary.
  const [snap, setSnap] = useState<{ summary: RaceSummary; raceLabel: string } | null>(null);
  useEffect(() => {
    if (laps.loading || pit.loading || laps.data === null) return;
    // Guard the one-render gap right after a race switch: `selected` (and
    // raceLabel with it) has already moved, but useApi hasn't flipped
    // `loading` yet, so the held data still belongs to the previous race —
    // capturing in that frame would recreate the exact fresh-label/
    // stale-numbers mix this snapshot exists to prevent. The rows carry
    // their own session_key, so only capture when the data agrees with the
    // selection. (An empty payload has no rows to check — but also no stale
    // numbers to lie with; its "no lap data" story is safe either way.)
    const dataMatchesSelection = (rows: { session_key: number }[] | null) =>
      rows === null || rows.length === 0 || selected === null || rows[0].session_key === selected;
    if (!dataMatchesSelection(laps.data) || !dataMatchesSelection(pit.data)) return;
    setSnap({
      summary: summarizeRace(laps.data, pit.data ?? [], deltaRows, pair),
      raceLabel,
    });
  }, [laps, pit, deltaRows, pair, raceLabel, selected]);
  const summaryStale = laps.loading || pit.loading;

  return (
    <>
      <SectionHeading
        index={5}
        eyebrow="Telemetry"
        title="Pick a race. See how it unfolded."
        description="Second-by-second telemetry for one race weekend: pace, tires, pit stops, running order, weather, and race control."
        aside={
          snap && (
            <div
              className="overview__insight glass overview__insight--aside"
              style={{
                filter: summaryStale ? "opacity(0.55)" : "opacity(1)",
                transition: "filter 0.2s ease",
              }}
            >
              <p className="overview__insight-eyebrow">{snap.raceLabel}</p>
              <p className="overview__insight-text">{snap.summary.story}</p>
            </div>
          )
        }
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

      <StatTiles summary={snap?.summary ?? null} loading={summaryStale} />

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
