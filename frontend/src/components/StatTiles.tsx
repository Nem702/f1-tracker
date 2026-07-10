import { Fragment, type ReactNode, useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";
import type { Lap, PitStop } from "../api/types";
import type { DriverPair } from "../teams";
import type { PairDelta } from "../lib/delta";
import { fmtLapTime } from "../format";
import { entrance } from "../motion";
import { CountUp } from "./CountUp";

/** Local reveal timing — this is a whileInView-triggered block (see the
 *  `inView` gate below), not part of the page-load home cascade, so its
 *  delays are re-based to "seconds after this scrolled into view" rather
 *  than pulled from motion.ts's homeCascade. */
const REVEAL_STAGGER = 0.08;

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
  delay: number;
  inView: boolean;
}

// Explicit per-tile `custom` delay rather than a staggerChildren/
// delayChildren orchestration: StatTile is a separate component (not an
// inline motion.* in the parent's JSX like Hero3D's h1/p), and going through
// that extra layer of indirection was silently dropping delayChildren's
// offset — tiles landed within the first ~500ms regardless of the intended
// delay. `animate` (not `whileInView`) because the whole row shares one
// IntersectionObserver at the StatTiles level (see `inView` below) rather
// than each tile running its own.
function StatTile({ icon, label, value, delay, inView }: TileProps) {
  return (
    <motion.div
      className="stat-tile glass"
      variants={entrance}
      custom={delay}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
    >
      <span className="stat-tile__icon">{icon}</span>
      {value}
      <p className="stat-tile__label">{label}</p>
    </motion.div>
  );
}

/** Reference-style stat tile row for #telemetry: four per-race summary
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

  const tileDelay = (i: number) => 0.15 + i * REVEAL_STAGGER;

  // This whole block (the insight card + all four tiles) sits below the
  // fold now — #telemetry's header summary, not Overview's page-load
  // cascade — so it reveals once on scroll-in instead of racing a
  // mount-relative clock. One IntersectionObserver for the whole group
  // (not one per tile): `inView` both drives every child's `animate` state
  // and gates when each CountUp actually mounts. CountUp animates from 0
  // starting the instant IT mounts, so mounting it eagerly at page load
  // (like the old page-load cascade did) meant it finished counting while
  // still off-screen — by the time this scrolled into view the number just
  // sat there already-counted, with the animation invisible. Rendering the
  // plain formatted value until `inView` flips true, then swapping in a
  // freshly-mounted CountUp, keeps the count-up itself tied to visibility.
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <Fragment>
      <motion.div
        ref={sectionRef}
        className="overview__insight glass"
        variants={entrance}
        initial="hidden"
        animate={inView ? "show" : "hidden"}
      >
        <p className="overview__insight-eyebrow">{raceLabel}</p>
        <p className="overview__insight-text">{raceStory}</p>
      </motion.div>
      <div
        className="stat-row"
        // `filter` rather than `opacity` for the loading dim: framer already
        // owns this element's `opacity` for the entrance cascade (driven via
        // inline style), and layering a second, independently CSS-transitioned
        // `opacity` on the same property fights it — the loading dim would
        // win the race and short-circuit the cascade to whatever this dim
        // value resolved to. `filter: opacity()` reads identically but is a
        // different CSS property, so the two never contend for the same value.
        style={{
          filter: loading ? "opacity(0.55)" : "opacity(1)",
          transition: "filter 0.2s ease",
        }}
      >
        <StatTile
          icon={<StopwatchIcon />}
          label={fastestDriverName ? `Fastest lap · ${fastestDriverName}` : "Fastest lap"}
          delay={tileDelay(0)}
          inView={inView}
          value={
            !fastestLap ? (
              <span className="stat-tile__value">—</span>
            ) : inView ? (
              <CountUp
                value={fastestLap.duration}
                decimals={3}
                formatter={(n) => fmtLapTime(n)}
                startDelay={tileDelay(0)}
                className="stat-tile__value"
              />
            ) : (
              <span className="stat-tile__value">{fmtLapTime(fastestLap.duration)}</span>
            )
          }
        />
        <StatTile
          icon={<FlagIcon />}
          label="Laps completed"
          delay={tileDelay(1)}
          inView={inView}
          value={
            lapsCompleted === 0 ? (
              <span className="stat-tile__value">—</span>
            ) : inView ? (
              <CountUp value={lapsCompleted} startDelay={tileDelay(1)} className="stat-tile__value" />
            ) : (
              <span className="stat-tile__value">{lapsCompleted.toLocaleString()}</span>
            )
          }
        />
        <StatTile
          icon={<PitIcon />}
          label="Pit stops"
          delay={tileDelay(2)}
          inView={inView}
          value={
            inView ? (
              <CountUp value={pitStopCount} startDelay={tileDelay(2)} className="stat-tile__value" />
            ) : (
              <span className="stat-tile__value">{pitStopCount.toLocaleString()}</span>
            )
          }
        />
        <StatTile
          icon={<GapIcon />}
          label={sameTeam ? "Avg. teammate gap" : "Avg. pair gap"}
          delay={tileDelay(3)}
          inView={inView}
          value={
            avgGap === null ? (
              <span className="stat-tile__value">—</span>
            ) : inView ? (
              <CountUp
                value={avgGap}
                decimals={3}
                formatter={(n) => `${n.toFixed(3)}s`}
                startDelay={tileDelay(3)}
                className="stat-tile__value"
              />
            ) : (
              <span className="stat-tile__value">{avgGap.toFixed(3)}s</span>
            )
          }
        />
      </div>
    </Fragment>
  );
}
