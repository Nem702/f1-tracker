import { type ReactNode, useRef } from "react";
import { motion, useInView } from "framer-motion";
import type { RaceSummary } from "../lib/raceStory";
import { fmtLapTime } from "../format";
import { entrance } from "../motion";
import { CountUp } from "./CountUp";
import { Skeleton } from "./Skeleton";

/** Local reveal timing — this is a whileInView-triggered block (see the
 *  `inView` gate below), not part of the page-load home cascade, so its
 *  delays are re-based to "seconds after this scrolled into view" rather
 *  than pulled from motion.ts's homeCascade. */
const REVEAL_STAGGER = 0.08;

interface Props {
  /** The atomic per-race summary Telemetry.tsx snapshots (lib/raceStory.ts)
   *  — the same object that feeds the header insight sentence, so tile
   *  values and labels can never disagree with it. Null until the first
   *  race's data lands (skeletons). */
  summary: RaceSummary | null;
  /** True while a refetch is in flight — dims held values (never
   *  re-skeletons; see the stat-row filter note below). */
  loading: boolean;
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
 *  numbers, all read off the snapshotted RaceSummary (the insight sentence
 *  in the section header reads the same object). Every value falls back to
 *  an em dash rather than a misleading 0 when the race has nothing to
 *  compute from (an empty-telemetry race like Sakhir/Jeddah). */
export function StatTiles({ summary, loading }: Props) {
  const tileDelay = (i: number) => 0.15 + i * REVEAL_STAGGER;

  // No snapshot yet (first load): every tile would show its em-dash
  // fallback (or a misleading 0 for pit stops), so swap in shimmer lines
  // instead. Once a snapshot exists, refetches keep the existing
  // filter-opacity dim below rather than re-skeletoning.
  const firstLoad = summary === null;
  const skeletonValue = (
    <span className="stat-tile__value">
      <Skeleton variant="line" width={72} height={20} />
    </span>
  );

  // This block sits below the fold — #telemetry's summary, not Overview's
  // page-load cascade — so it reveals once on scroll-in instead of racing a
  // mount-relative clock. One IntersectionObserver for the whole row (not
  // one per tile): `inView` both drives every child's `animate` state and
  // gates when each CountUp actually mounts. CountUp animates from 0
  // starting the instant IT mounts, so mounting it eagerly at page load
  // meant it finished counting while still off-screen — rendering the plain
  // formatted value until `inView` flips true, then swapping in a
  // freshly-mounted CountUp, keeps the count-up itself tied to visibility.
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-100px" });

  const fastestLap = summary?.fastestLap ?? null;
  const fastestDriverName = summary?.fastestDriverName ?? null;
  const lapsCompleted = summary?.lapsCompleted ?? 0;
  const pitStopCount = summary?.pitStopCount ?? 0;
  const avgGap = summary?.avgGap ?? null;

  return (
    <div
      ref={sectionRef}
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
          firstLoad ? (
            skeletonValue
          ) : !fastestLap ? (
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
          firstLoad ? (
            skeletonValue
          ) : lapsCompleted === 0 ? (
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
          firstLoad ? (
            skeletonValue
          ) : inView ? (
            <CountUp value={pitStopCount} startDelay={tileDelay(2)} className="stat-tile__value" />
          ) : (
            <span className="stat-tile__value">{pitStopCount.toLocaleString()}</span>
          )
        }
      />
      <StatTile
        icon={<GapIcon />}
        label={summary?.sameTeam ? "Avg. teammate gap" : "Avg. pair gap"}
        delay={tileDelay(3)}
        inView={inView}
        value={
          firstLoad ? (
            skeletonValue
          ) : avgGap === null ? (
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
  );
}
