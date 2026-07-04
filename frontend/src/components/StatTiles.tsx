import { type ReactNode, useMemo } from "react";
import { motion } from "framer-motion";
import type { DeltaRow, Lap, PitStop } from "../api/types";
import { fmtLapTime } from "../format";
import { hoverLift, staggerContainer, staggerItem } from "../motion";
import { CountUp } from "./CountUp";

interface Props {
  laps: Lap[];
  pit: PitStop[];
  delta: DeltaRow[];
  hamNumber: number | null;
  lecNumber: number | null;
  loading: boolean;
}

function isTracked(
  driverNumber: number,
  hamNumber: number | null,
  lecNumber: number | null,
): boolean {
  return driverNumber === hamNumber || driverNumber === lecNumber;
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

function CornerArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 18 18 6M9 6h9v9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
    <motion.div className="stat-tile" variants={staggerItem} {...hoverLift}>
      <span className="stat-tile__icon">{icon}</span>
      <span className="stat-tile__corner">
        <CornerArrow />
      </span>
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
export function StatTiles({ laps, pit, delta, hamNumber, lecNumber, loading }: Props) {
  const fastestLap = useMemo(() => {
    let best: { driver: number; duration: number } | null = null;
    for (const lap of laps) {
      if (lap.lap_duration == null) continue;
      if (!isTracked(lap.driver_number, hamNumber, lecNumber)) continue;
      if (!best || lap.lap_duration < best.duration) {
        best = { driver: lap.driver_number, duration: lap.lap_duration };
      }
    }
    return best;
  }, [laps, hamNumber, lecNumber]);

  const fastestDriverName =
    fastestLap === null
      ? null
      : fastestLap.driver === hamNumber
        ? "Hamilton"
        : "Leclerc";

  const lapsCompleted = useMemo(() => {
    let max = 0;
    for (const lap of laps) {
      if (!isTracked(lap.driver_number, hamNumber, lecNumber)) continue;
      if (lap.lap_number > max) max = lap.lap_number;
    }
    return max;
  }, [laps, hamNumber, lecNumber]);

  const pitStopCount = useMemo(
    () =>
      pit.filter(
        (p) => p.pit_duration !== null && isTracked(p.driver_number, hamNumber, lecNumber),
      ).length,
    [pit, hamNumber, lecNumber],
  );

  // Same pit in/out exclusion DeltaChart applies — a pit cycle's ±20s swing
  // would swamp the racing-pace story this tile summarizes.
  const avgGap = useMemo(() => {
    const excluded = new Set<number>();
    for (const lap of laps) {
      if (lap.is_pit_out_lap) {
        excluded.add(lap.lap_number);
        excluded.add(lap.lap_number - 1);
      }
    }
    const racing = delta.filter((d) => !excluded.has(d.lap_number));
    if (racing.length === 0) return null;
    const sum = racing.reduce((acc, d) => acc + Math.abs(d.delta), 0);
    return sum / racing.length;
  }, [delta, laps]);

  return (
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
        label="Avg. teammate gap"
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
  );
}
