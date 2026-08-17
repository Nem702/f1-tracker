import { motion } from "framer-motion";
import type { Lap, PitStop, Race, RaceControlRow, RaceWeekend } from "../api/types";
import type { DriverPair, TeamRoster } from "../teams";
import { TeamSwitcher } from "./TeamSwitcher";
import { RaceSelector } from "./RaceSelector";
import { RotatingWord } from "./RotatingWord";
import { HeroCircuit } from "./HeroCircuit";
import { entrance, homeCascade, staggerContainer, stagger } from "../motion";

const ROTATING_WORDS = ["lap times", "standings", "race weekends", "telemetry"];

interface Props {
  laps: Lap[];
  pit: PitStop[];
  raceControl: RaceControlRow[];
  race: Race | null;
  raceWeekend: RaceWeekend | null;
  pair: DriverPair | null;
  rosters: TeamRoster[];
  onSelectPair: (a: number, b: number) => void;
  races: Race[];
  selected: number | null;
  onSelectRace: (sessionKey: number) => void;
}

/** One sentence, no live interval. #next-race already owns the countdown and
 *  the session table; rendering either of them here would be that page drawn
 *  twice in the LCP element — the exact trap the rejected hero designs fell
 *  into. Renders nothing at all when there is no upcoming weekend. */
function NextSessionLine({ weekend }: { weekend: RaceWeekend | null }) {
  if (!weekend?.race_name) return null;
  const when = weekend.date_start
    ? new Date(weekend.date_start).toLocaleDateString([], {
        month: "long",
        day: "numeric",
      })
    : null;
  return (
    <p className="hero-intro__next">
      <a className="btn-pill" href="#next-race">
        Next up: the {weekend.race_name}
        {when && <span className="hero-intro__next-when">, {when}</span>} &rarr;
      </a>
    </p>
  );
}

/** #hero section body: the landing intro (pinned near the navbar, not part of
 *  the centered group below — the circuit animation is the thing meant to read
 *  as "centered"), the circuit trace, and the race + pair pickers with a
 *  caption explaining the pair picker. Both pickers drive App's shared
 *  `selected`/`pair` state — the same instances (same `value`/`onChange`)
 *  Telemetry uses further down, so a choice made here carries straight through
 *  without duplicate state. The countdown lives in #next-race (it belongs with
 *  the upcoming weekend's schedule); the selected-race insight card and stat
 *  tiles stay in #telemetry, the section that actually drives those numbers. */
export function Hero({
  laps,
  pit,
  raceControl,
  race,
  raceWeekend,
  pair,
  rosters,
  onSelectPair,
  races,
  selected,
  onSelectRace,
}: Props) {
  return (
    <>
      <motion.div
        className="hero-intro"
        variants={staggerContainer(stagger.base, homeCascade.introTitle)}
        initial="hidden"
        animate="show"
      >
        <motion.h1 variants={entrance}>
          Track Formula 1&rsquo;s <RotatingWord words={ROTATING_WORDS} suffix="." />
        </motion.h1>
        <motion.p variants={entrance} custom={homeCascade.introText - homeCascade.introTitle}>
          F1 Tracker follows the 2026 season lap by lap — pace, standings, race
          weekends, and full telemetry, all in one dashboard.
        </motion.p>
        <motion.div variants={entrance} custom={homeCascade.introText - homeCascade.introTitle}>
          <NextSessionLine weekend={raceWeekend} />
        </motion.div>
      </motion.div>

      {/* No phone gate. The stage is plain SVG now — it costs a path and one
          rAF loop that stops the moment it scrolls out of view, so there is
          nothing left to withhold from a small screen. It arrives on the
          landing cascade's stage beat, which the race picker and caption
          below are timed against. */}
      <motion.div
        className="hero-stage"
        variants={entrance}
        initial="hidden"
        animate="show"
        custom={homeCascade.heroStage}
      >
        <HeroCircuit
          race={race}
          laps={laps}
          pit={pit}
          raceControl={raceControl}
          pair={pair}
        />
      </motion.div>

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
          build your own comparison — the lights above run their real pace,
          lap by lap.
        </motion.p>
      </div>
    </>
  );
}
