import type {
  OfficialResult as OfficialResultData,
  PreviousRaceRecap as PreviousRaceRecapData,
} from "../api/types";
import { SectionHeading } from "./SectionHeading";
import { OfficialResult } from "./OfficialResult";
import { QualifyingResult } from "./QualifyingResult";
import { TeamDot } from "./TeamDot";
import { Reveal } from "./Reveal";

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

/** The podium + fastest lap as the section header's right-column payload —
 *  the old standalone recap card said nothing the Official Result table
 *  below doesn't; as a header aside the same facts stop costing a card.
 *  (The sprint podium it also carried is rows 1–3 of the Sprint Result
 *  table below — dropped, not lost.) */
function PodiumAside({ recap }: { recap: PreviousRaceRecapData }) {
  return (
    <div className="podium-aside glass">
      <ol className="podium-aside__list">
        {recap.top3.map((row) => (
          <li key={row.position} className="podium-aside__row">
            <span className="podium-aside__pos">{row.position}</span>
            <span className="podium-aside__name">
              <TeamDot teamName={row.constructor_name} />
              {row.driver_code ?? row.driver_name}
            </span>
            <span className="podium-aside__gap">{row.time ?? "—"}</span>
          </li>
        ))}
      </ol>
      {recap.fastest_lap && (
        <p className="podium-aside__fastest">
          Fastest lap: {recap.fastest_lap.driver_code ?? recap.fastest_lap.driver_name}
          {recap.fastest_lap.fastest_lap_time ? ` · ${recap.fastest_lap.fastest_lap_time}` : ""}
        </p>
      )}
    </div>
  );
}

/** #last-race section body — the full-width result tables: the race
 *  classification, then qualifying + sprint under their own sub-heading.
 *  The podium/fastest-lap recap lives in the section header's aside, so
 *  the tables get the whole content column. These tables carry ~20 rows,
 *  so each ships a 5 / 10 / All row-limit control (see DataTable) and
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
        description="Podium at a glance, then the full classification — qualifying and sprint included."
        meta={<p className="section-meta">{raceLabel}</p>}
        aside={recap ? <PodiumAside recap={recap} /> : undefined}
      />

      {!recap && !recapLoading && (
        <p className="section-empty">No completed race found yet this season.</p>
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
