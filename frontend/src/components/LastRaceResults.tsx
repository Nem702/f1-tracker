import type { OfficialResult as OfficialResultData } from "../api/types";
import { SectionHeading } from "./SectionHeading";
import { OfficialResult } from "./OfficialResult";
import { QualifyingResult } from "./QualifyingResult";
import { Reveal } from "./Reveal";

interface Props {
  data: OfficialResultData | null;
  loading: boolean;
  error: string | null;
  raceLabel: string;
}

/** #last-race-results section body: full grid classification, qualifying,
 *  and (when the weekend had one) sprint — the discrete, per-driver Jolpica
 *  tables that used to share a grid with the continuous OpenF1 telemetry
 *  charts in the old Race Analysis view. Split out here since they're a
 *  different data shape (no pair concept) and belong with the "last race"
 *  time context, directly under its recap card. Shows whichever race is
 *  currently selected (#telemetry's race picker controls this — it
 *  defaults to the most recent race on load, matching the section's
 *  "last race" framing). */
export function LastRaceResults({ data, loading, error, raceLabel }: Props) {
  return (
    <>
      <SectionHeading
        eyebrow="Results"
        title="Full classification"
        meta={<p className="section-meta">{raceLabel}</p>}
      />
      <div className="grid">
        <Reveal wide>
          <OfficialResult
            title="Official Result"
            subtitle="Full classification, all drivers"
            rows={data?.race ?? []}
            loading={loading}
            error={error}
          />
        </Reveal>
        <Reveal wide>
          <QualifyingResult rows={data?.qualifying ?? []} loading={loading} error={error} />
        </Reveal>
        {data?.has_sprint && (
          <Reveal>
            <OfficialResult
              title="Sprint Result"
              subtitle="Sprint classification"
              rows={data.sprint ?? []}
              loading={loading}
              error={error}
              emptyText="No sprint result published yet for this race."
            />
          </Reveal>
        )}
      </div>
    </>
  );
}
