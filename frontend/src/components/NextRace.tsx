import type { RaceWeekend } from "../api/types";
import { SectionHeading } from "./SectionHeading";
import { RaceWeekendSchedule } from "./RaceWeekendSchedule";
import { CircuitImage } from "./CircuitImage";
import { Reveal } from "./Reveal";

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
        eyebrow="Next race"
        title={data?.race_name ?? "Up next on the calendar"}
        meta={
          data && (
            <p className="section-meta">
              Round {data.round} of {data.total_rounds} ·{" "}
              {[data.circuit.locality, data.circuit.country].filter(Boolean).join(", ")}
            </p>
          )
        }
      />

      {!data && !loading && (
        <p className="section-empty">
          {error
            ? "Couldn't load race weekend data — try again shortly."
            : "No upcoming race found. Check back once the next season's calendar is published."}
        </p>
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
