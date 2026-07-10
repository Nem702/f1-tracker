import type { RaceWeekend } from "../api/types";
import { SectionHeading } from "./SectionHeading";
import { RaceWeekendSchedule } from "./RaceWeekendSchedule";
import { CircuitImage } from "./CircuitImage";
import { Countdown } from "./Countdown";
import { Reveal } from "./Reveal";
import { Skeleton } from "./Skeleton";

interface Props {
  data: RaceWeekend | null;
  loading: boolean;
  error: string | null;
}

/** #next-race section body: round progress, circuit map (+ last-year
 *  winner), and the weekend session schedule for the upcoming race. Reads
 *  from the same /api/race-weekend payload App.tsx already fetches for
 *  #last-race's recap — one request serves both sections, no fetch of its
 *  own. Standings and the previous-race recap that used to live in this
 *  grid now have their own canonical sections below (#season-standings,
 *  #last-race) instead of a duplicated preview here. */
export function NextRace({ data, loading, error }: Props) {
  return (
    <>
      <SectionHeading
        index={2}
        eyebrow="Next race"
        title={data?.race_name ?? "Up next on the calendar"}
        description="Pulled straight off the season calendar — every practice, qualifying and race session converted to your local time, plus circuit context and a note on who won here last year."
        meta={
          data && (
            <p className="section-meta">
              Round {data.round} of {data.total_rounds} ·{" "}
              {[data.circuit.locality, data.circuit.country].filter(Boolean).join(", ")}
            </p>
          )
        }
      />

      {/* Self-contained: Countdown fetches its own /api/next-race payload, so it
          renders (or hides itself) independent of this section's data. */}
      <div className="next-race__countdown">
        <Countdown />
      </div>

      {!data && !loading && (
        <p className="section-empty">
          {error
            ? "Couldn't load race weekend data — try again shortly."
            : "No upcoming race found. Check back once the next season's calendar is published."}
        </p>
      )}

      {/* First load: hold the two-column grid's shape so the schedule and
          circuit cards don't pop the layout open when the payload lands. */}
      {!data && loading && (
        <div className="next-race__grid" aria-hidden="true">
          <Skeleton height={340} />
          <Skeleton height={340} />
        </div>
      )}

      {data && (
        <div className="next-race__grid">
          <Reveal>
            <RaceWeekendSchedule sessions={data.sessions} />
          </Reveal>
          <Reveal delay={0.08}>
            <CircuitImage circuit={data.circuit} lastYearWinner={data.last_year_winner} />
          </Reveal>
        </div>
      )}
    </>
  );
}
