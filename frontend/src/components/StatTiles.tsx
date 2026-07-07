import { Fragment, type ReactNode, useMemo } from "react";
import { motion } from "framer-motion";
import type { Lap, PitStop } from "../api/types";
import type { DriverPair } from "../teams";
import type { PairDelta } from "../lib/delta";
import { fmtLapTime } from "../format";
import { staggerContainer, staggerItem } from "../motion";
import { CountUp } from "./CountUp";

interface Props {
  laps: Lap[];
  pit: PitStop[];
  /** Client-derived pair delta (lib/delta.ts) — pit in/out laps already excluded. */
  delta: PairDelta[];
  pair: DriverPair | null;
  loading: boolean;
  /** The selected race, e.g. "Silverstone · Jul 5, 2026" (App.tsx already
   *  derives this for the hero) — labels the insight card so it reads as
   *  data for the selected race, not the countdown's upcoming one. */
  raceLabel: string;
}

function StopwatchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.5 2.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 4.5v2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="13.5" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 9v4.7l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 21V3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M5 4h13l-2.6 3.5L18 11H5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14.7 3.3l1.4 1.4-2 2 2.6 2.6-2 2-2.6-2.6-2 2-1.4-1.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9.3 8.7 3.5 14.5a1.7 1.7 0 0 0 2.4 2.4l5.8-5.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 20l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h4M16 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6.5 9.2 4 12l2.5 2.8M17.5 9.2 20 12l-2.5 2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 6v12M14.5 6v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

interface TileProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}

function StatTile({ icon, label, value }: TileProps) {
  return (
    <motion.div className="stat-tile glass" variants={staggerItem}>
      <span className="stat-tile__icon">{icon}</span>
      {value}
      <p className="stat-tile__label">{label}</p>
    </motion.div>
  );
}

/** Reference-style stat tile row for the Overview: four per-race summary
 *  numbers derived from data App.tsx already fetches — no endpoints of its
 *  own. Every value falls back to an em dash rather than a misleading 0 when
 *  the race has nothing to compute from yet (no race selected, or an
 *  empty-telemetry race like Sakhir/Jeddah). */
export function StatTiles({ laps, pit, delta, pair, loading, raceLabel }: Props) {
  const aNumber = pair?.[0].number ?? null;
  const bNumber = pair?.[1].number ?? null;
  const isTracked = (n: number) => n === aNumber || n === bNumber;
  const sameTeam = pair !== null && pair[0].teamSlug === pair[1].teamSlug;

  const fastestLap = useMemo(() => {
    let best: { driver: number; duration: number } | null = null;
    for (const lap of laps) {
      if (lap.lap_duration == null) continue;
      if (lap.driver_number !== aNumber && lap.driver_number !== bNumber) continue;
      if (!best || lap.lap_duration < best.duration) {
        best = { driver: lap.driver_number, duration: lap.lap_duration };
      }
    }
    return best;
  }, [laps, aNumber, bNumber]);

  const fastestDriverName =
    fastestLap === null || pair === null
      ? null
      : fastestLap.driver === aNumber
        ? pair[0].lastName
        : pair[1].lastName;

  const lapsCompleted = useMemo(() => {
    let max = 0;
    for (const lap of laps) {
      if (!isTracked(lap.driver_number)) continue;
      if (lap.lap_number > max) max = lap.lap_number;
    }
    return max;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laps, aNumber, bNumber]);

  const pitStopCount = useMemo(
    () =>
      pit.filter((p) => p.pit_duration !== null && isTracked(p.driver_number))
        .length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pit, aNumber, bNumber],
  );

  // deriveDelta already applied the pair's pit in/out exclusion — a pit
  // cycle's ±20s swing would swamp the racing-pace story this tile
  // summarizes — so the mean is over racing laps only.
  const avgGap = useMemo(() => {
    if (delta.length === 0) return null;
    const sum = delta.reduce((acc, d) => acc + Math.abs(d.delta), 0);
    return sum / delta.length;
  }, [delta]);

  // Same rows as avgGap, signed instead of absolute, purely to find which
  // driver is ahead: delta = b_duration - a_duration (lib/delta.ts), so a
  // positive mean means A's laps averaged shorter — A is ahead.
  const meanSignedDelta = useMemo(() => {
    if (delta.length === 0) return null;
    return delta.reduce((acc, d) => acc + d.delta, 0) / delta.length;
  }, [delta]);

  // A short race-weekend story, not just a number: pace gap + who set the
  // pair's fastest lap + how many laps/stops it took to get there, woven
  // into one sentence rather than left as four disconnected tiles.
  const raceStory = useMemo(() => {
    if (!pair) {
      return "Select a driver pair to see the story of their race weekend.";
    }
    const [a, b] = pair;
    if (lapsCompleted === 0) {
      return `No lap data yet for ${a.lastName} and ${b.lastName} this weekend.`;
    }

    const paceClause =
      avgGap === null || meanSignedDelta === null
        ? `${a.lastName} and ${b.lastName} haven't gone head-to-head on track yet`
        : Math.abs(meanSignedDelta) < 0.0005
          ? `${a.lastName} and ${b.lastName} were dead even on average pace`
          : (() => {
              const ahead = meanSignedDelta > 0 ? a : b;
              const behind = meanSignedDelta > 0 ? b : a;
              return `${ahead.lastName} outpaced ${behind.lastName} by ${avgGap!.toFixed(3)}s/lap on average${sameTeam ? " as teammates" : ""}`;
            })();

    const fastestClause = fastestLap
      ? `, with ${fastestDriverName} setting the pair's fastest lap at ${fmtLapTime(fastestLap.duration)}`
      : "";

    const lapWord = lapsCompleted === 1 ? "lap" : "laps";
    const stopWord = pitStopCount === 1 ? "stop" : "stops";

    return `${paceClause}${fastestClause}, across ${lapsCompleted} ${lapWord} and ${pitStopCount} pit ${stopWord} between them.`;
  }, [
    pair,
    avgGap,
    meanSignedDelta,
    fastestLap,
    fastestDriverName,
    lapsCompleted,
    pitStopCount,
    sameTeam,
  ]);

  return (
    <Fragment>
      <div className="overview__insight glass">
        <p className="overview__insight-eyebrow">{raceLabel}</p>
        <p className="overview__insight-text">{raceStory}</p>
      </div>
      <motion.div
        className="stat-row"
        variants={staggerContainer()}
        initial="hidden"
        animate="show"
        style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s ease" }}
      >
        <StatTile
          icon={<StopwatchIcon />}
          label={fastestDriverName ? `Fastest lap · ${fastestDriverName}` : "Fastest lap"}
          value={
            fastestLap ? (
              <CountUp
                value={fastestLap.duration}
                decimals={3}
                formatter={(n) => fmtLapTime(n)}
                className="stat-tile__value"
              />
            ) : (
              <span className="stat-tile__value">—</span>
            )
          }
        />
        <StatTile
          icon={<FlagIcon />}
          label="Laps completed"
          value={
            lapsCompleted > 0 ? (
              <CountUp value={lapsCompleted} className="stat-tile__value" />
            ) : (
              <span className="stat-tile__value">—</span>
            )
          }
        />
        <StatTile
          icon={<PitIcon />}
          label="Pit stops"
          value={<CountUp value={pitStopCount} className="stat-tile__value" />}
        />
        <StatTile
          icon={<GapIcon />}
          label={sameTeam ? "Avg. teammate gap" : "Avg. pair gap"}
          value={
            avgGap !== null ? (
              <CountUp
                value={avgGap}
                decimals={3}
                formatter={(n) => `${n.toFixed(3)}s`}
                className="stat-tile__value"
              />
            ) : (
              <span className="stat-tile__value">—</span>
            )
          }
        />
      </motion.div>
    </Fragment>
  );
}
