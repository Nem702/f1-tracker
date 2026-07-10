import { Suspense, lazy } from "react";
import { motion } from "framer-motion";
import type { Lap, Race } from "../api/types";
import type { DriverPair, TeamRoster } from "../teams";
import { TeamSwitcher } from "./TeamSwitcher";
import { RaceSelector } from "./RaceSelector";
import { RotatingWord } from "./RotatingWord";
import { entrance, homeCascade, staggerContainer, stagger } from "../motion";

// three.js/r3f/drei is only ever needed for this one section — lazy-loading
// keeps it out of the initial bundle otherwise. Stays mounted near the top
// of the page once loaded; it doesn't compete with the chart draw-ins
// further down since those are behind their own Suspense boundary too (see
// Telemetry.tsx).
const Hero3D = lazy(() => import("./Hero3D").then((m) => ({ default: m.Hero3D })));

const ROTATING_WORDS = ["lap times", "standings", "race weekends", "telemetry"];

interface Props {
  laps: Lap[];
  pair: DriverPair | null;
  rosters: TeamRoster[];
  onSelectPair: (a: number, b: number) => void;
  races: Race[];
  selected: number | null;
  onSelectRace: (sessionKey: number) => void;
}

/** #hero section body: the landing intro (pinned near the navbar, not part
 *  of the centered group below — the ribbons are the thing meant to read as
 *  "centered"), the 3D lap-pace ribbons, and the race + pair pickers with a
 *  caption explaining the pair picker. Both pickers drive App's shared
 *  `selected`/`pair` state — the same instances (same `value`/`onChange`)
 *  Telemetry uses further down, so a choice made here carries straight
 *  through without duplicate state. The countdown moved down into
 *  #next-race (it belongs with the upcoming weekend's schedule); the
 *  selected-race insight card and stat tiles stay in #telemetry, the
 *  section that actually drives those numbers. */
export function Hero({ laps, pair, rosters, onSelectPair, races, selected, onSelectRace }: Props) {
  return (
    <>
      <motion.div
        className="hero-intro"
        variants={staggerContainer(stagger.base, homeCascade.introTitle)}
        initial="hidden"
        animate="show"
      >
        <motion.h1 variants={entrance}>
          Track Formula 1&rsquo;s <RotatingWord words={ROTATING_WORDS} />.
        </motion.h1>
        <motion.p variants={entrance} custom={homeCascade.introText - homeCascade.introTitle}>
          F1 Tracker follows the 2026 season lap by lap — pace, standings, race
          weekends, and full telemetry, all in one dashboard.
        </motion.p>
      </motion.div>

      <div className="hero-stage">
        <Suspense fallback={null}>
          <Hero3D laps={laps} pair={pair} />
        </Suspense>
      </div>

      <div className="hero-body">
        <motion.div
          className="hero-body__race"
          variants={entrance}
          initial="hidden"
          animate="show"
          custom={homeCascade.race}
        >
          <RaceSelector races={races} value={selected} onChange={onSelectRace} />
        </motion.div>

        <div className="hero-body__selectors">
          {rosters.length > 0 && pair && (
            <TeamSwitcher rosters={rosters} pair={pair} onSelectPair={onSelectPair} />
          )}
        </div>
        <motion.p
          className="hero-caption"
          variants={entrance}
          initial="hidden"
          animate="show"
          custom={homeCascade.caption}
        >
          Choose a team to compare its two drivers, or pick Head-to-Head to
          build your own comparison — the ribbons above track their pace,
          lap by lap.
        </motion.p>
      </div>
    </>
  );
}
