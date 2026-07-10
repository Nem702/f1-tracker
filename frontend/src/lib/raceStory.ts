import type { Lap, PitStop } from "../api/types";
import type { DriverPair } from "../teams";
import type { PairDelta } from "./delta";
import { fmtLapTime } from "../format";

/** Everything the #telemetry header insight and the stat tiles display,
 *  derived in one place from one set of inputs — so the sentence and the
 *  tiles can never disagree. Telemetry.tsx computes this from an atomic
 *  per-race snapshot (label + data captured together once every fetch for
 *  the race has landed). */
export interface RaceSummary {
  fastestLap: { driver: number; duration: number } | null;
  /** Last name of whoever set fastestLap, resolved against the pair. */
  fastestDriverName: string | null;
  lapsCompleted: number;
  pitStopCount: number;
  /** Mean absolute pair delta over racing laps (pit in/out excluded). */
  avgGap: number | null;
  sameTeam: boolean;
  /** The woven one-sentence race story. */
  story: string;
}

export function summarizeRace(
  laps: Lap[],
  pit: PitStop[],
  delta: PairDelta[],
  pair: DriverPair | null,
): RaceSummary {
  const aNumber = pair?.[0].number ?? null;
  const bNumber = pair?.[1].number ?? null;
  const isTracked = (n: number) => n === aNumber || n === bNumber;
  const sameTeam = pair !== null && pair[0].teamSlug === pair[1].teamSlug;

  let fastestLap: { driver: number; duration: number } | null = null;
  for (const lap of laps) {
    if (lap.lap_duration == null) continue;
    if (!isTracked(lap.driver_number)) continue;
    if (!fastestLap || lap.lap_duration < fastestLap.duration) {
      fastestLap = { driver: lap.driver_number, duration: lap.lap_duration };
    }
  }

  const fastestDriverName =
    fastestLap === null || pair === null
      ? null
      : fastestLap.driver === aNumber
        ? pair[0].lastName
        : pair[1].lastName;

  let lapsCompleted = 0;
  for (const lap of laps) {
    if (!isTracked(lap.driver_number)) continue;
    if (lap.lap_number > lapsCompleted) lapsCompleted = lap.lap_number;
  }

  const pitStopCount = pit.filter(
    (p) => p.pit_duration !== null && isTracked(p.driver_number),
  ).length;

  // deriveDelta already excluded the pair's pit in/out laps — a pit cycle's
  // ±20s swing would swamp the racing-pace story this summarizes.
  const avgGap =
    delta.length === 0
      ? null
      : delta.reduce((acc, d) => acc + Math.abs(d.delta), 0) / delta.length;

  // Signed mean of the same rows, purely to find who is ahead: delta =
  // b_duration - a_duration (lib/delta.ts), so positive means A averaged
  // shorter laps.
  const meanSignedDelta =
    delta.length === 0
      ? null
      : delta.reduce((acc, d) => acc + d.delta, 0) / delta.length;

  return {
    fastestLap,
    fastestDriverName,
    lapsCompleted,
    pitStopCount,
    avgGap,
    sameTeam,
    story: buildStory({
      pair,
      sameTeam,
      fastestLap,
      fastestDriverName,
      lapsCompleted,
      pitStopCount,
      avgGap,
      meanSignedDelta,
    }),
  };
}

interface StoryInputs {
  pair: DriverPair | null;
  sameTeam: boolean;
  fastestLap: { driver: number; duration: number } | null;
  fastestDriverName: string | null;
  lapsCompleted: number;
  pitStopCount: number;
  avgGap: number | null;
  meanSignedDelta: number | null;
}

/** A short race-weekend story, not just a number: pace gap + who set the
 *  pair's fastest lap + how many laps/stops it took, woven into one
 *  sentence rather than left as four disconnected tiles. */
function buildStory({
  pair,
  sameTeam,
  fastestLap,
  fastestDriverName,
  lapsCompleted,
  pitStopCount,
  avgGap,
  meanSignedDelta,
}: StoryInputs): string {
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
            return `${ahead.lastName} outpaced ${behind.lastName} by ${avgGap.toFixed(3)}s/lap on average${sameTeam ? " as teammates" : ""}`;
          })();

  const fastestClause = fastestLap
    ? `, with ${fastestDriverName} setting the pair's fastest lap at ${fmtLapTime(fastestLap.duration)}`
    : "";

  const lapWord = lapsCompleted === 1 ? "lap" : "laps";
  const stopWord = pitStopCount === 1 ? "stop" : "stops";

  return `${paceClause}${fastestClause}, across ${lapsCompleted} ${lapWord} and ${pitStopCount} pit ${stopWord} between them.`;
}
