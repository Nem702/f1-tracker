import { Suspense, lazy } from "react";
import type { Lap } from "../api/types";
import type { DriverPair, TeamRoster } from "../teams";
import { TeamSwitcher } from "./TeamSwitcher";
import { Countdown } from "./Countdown";

// three.js/r3f/drei is only ever needed for this one section — lazy-loading
// keeps it out of the initial bundle otherwise. Stays mounted near the top
// of the page once loaded; it doesn't compete with the chart draw-ins
// further down since those are behind their own Suspense boundary too (see
// Telemetry.tsx).
const Hero3D = lazy(() => import("./Hero3D").then((m) => ({ default: m.Hero3D })));

interface Props {
  laps: Lap[];
  pair: DriverPair | null;
  rosters: TeamRoster[];
  onSelectPair: (a: number, b: number) => void;
}

/** #hero section body: the 3D lap-pace ribbons, the pair picker, and the
 *  countdown to the next session — "what's next," the top of the page's
 *  time axis. Everything that used to share Overview's opening but isn't
 *  about "what's next" (the race browser, the selected-race insight card,
 *  the stat tiles) now lives in #telemetry, the section that actually
 *  drives those numbers. */
export function Hero({ laps, pair, rosters, onSelectPair }: Props) {
  return (
    <>
      <Suspense fallback={null}>
        <Hero3D laps={laps} pair={pair} />
      </Suspense>

      <div className="hero-body">
        <div className="hero-body__selectors">
          {rosters.length > 0 && pair && (
            <TeamSwitcher rosters={rosters} pair={pair} onSelectPair={onSelectPair} />
          )}
        </div>
        <div className="hero-body__countdown">
          <Countdown />
        </div>
      </div>
    </>
  );
}
