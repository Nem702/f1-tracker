import type {
  OfficialResult as OfficialResultData,
  PreviousRaceRecap as PreviousRaceRecapData,
} from "../api/types";
import { SectionHeading } from "./SectionHeading";
import { PreviousRaceRecap } from "./PreviousRaceRecap";
import { OfficialResult } from "./OfficialResult";
import { QualifyingResult } from "./QualifyingResult";
import { Reveal } from "./Reveal";
import { Skeleton } from "./Skeleton";

interface Props {
  recap: PreviousRaceRecapData | null;
  recapLoading: boolean;
  /** The full per-driver Jolpica tables (race classification, qualifying,
   *  sprint) for the currently selected race — #telemetry's race picker
   *  controls which race this is; it defaults to the most recent one, matching
   *  this section's "last race" framing. */
  result: OfficialResultData | null;
  resultLoading: boolean;
  resultError: string | null;
  raceLabel: string;
}

/** #last-race section body — the merge of the old #last-race recap and the
 *  old #last-race-results tables into one section. A compact previous-race
 *  recap card (podium + fastest lap) opens the section, then the full-width
 *  result tables get the whole content column each — the race classification,
 *  then qualifying + sprint under their own sub-heading. These tables carry
 *  ~20 rows, so each ships a 5 / 10 / All row-limit control (see DataTable) and
 *  defaults to the top 10. All from the same Jolpica data #next-race reads. */
export function LastRace({
  recap,
  recapLoading,
  result,
  resultLoading,
  resultError,
  raceLabel,
}: Props) {
  return (
    <>
      <SectionHeading
        index={3}
        eyebrow="Last race"
        title={recap?.race_name ?? "Most recent race"}
        description="The most recently completed race: podium and fastest lap at a glance, and the full finishing order for the tracked field — gaps to the leader, laps completed, and points scored."
        meta={<p className="section-meta">{raceLabel}</p>}
      />

      {!recap && !recapLoading && (
        <p className="section-empty">No completed race found yet this season.</p>
      )}

      {/* First load: stand in for the compact recap card (the result tables
          below render their own skeletons via ChartCard). */}
      {!recap && recapLoading && (
        <div className="last-race__recap" aria-hidden="true">
          <Skeleton height={220} />
        </div>
      )}

      {recap && (
        <div className="last-race__recap">
          <Reveal variant="wipe">
            <PreviousRaceRecap recap={recap} />
          </Reveal>
        </div>
      )}

      <div className="last-race__results">
        <Reveal>
          <OfficialResult
            title="Official Result"
            subtitle="Full classification, all drivers"
            rows={result?.race ?? []}
            loading={resultLoading}
            error={resultError}
          />
        </Reveal>
      </div>

      <h3 className="subsection__heading">Qualifying &amp; Sprint</h3>
      <div className="last-race__results">
        <Reveal>
          <QualifyingResult
            rows={result?.qualifying ?? []}
            loading={resultLoading}
            error={resultError}
          />
        </Reveal>
        {result?.has_sprint && (
          <Reveal delay={0.08}>
            <OfficialResult
              title="Sprint Result"
              subtitle="Sprint classification"
              rows={result.sprint ?? []}
              loading={resultLoading}
              error={resultError}
              emptyText="No sprint result published yet for this race."
            />
          </Reveal>
        )}
      </div>
    </>
  );
}
