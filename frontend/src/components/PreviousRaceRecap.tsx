import type { PreviousRaceRecap as PreviousRaceRecapData } from "../api/types";

interface Props {
  recap: PreviousRaceRecapData;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Glass card recapping the most recently completed race: top-3
 *  classification, the race's outright fastest lap, and the sprint top-3
 *  when that weekend had one. The one canonical version — #last-race's
 *  whole reason to exist. No internal motion of its own; the caller wraps
 *  it in <Reveal> like every other below-the-fold card. */
export function PreviousRaceRecap({ recap }: Props) {
  return (
    <div className="previous-race-recap glass">
      <p className="previous-race-recap__eyebrow">Previous race</p>
      <h3 className="previous-race-recap__title">{recap.race_name ?? "Last race"}</h3>
      <p className="previous-race-recap__date">{fmtDate(recap.date)}</p>

      <ol className="previous-race-recap__podium">
        {recap.top3.map((row) => (
          <li key={row.position} className="previous-race-recap__row">
            <span className="previous-race-recap__pos">{row.position}</span>
            <span className="previous-race-recap__name">{row.driver_code ?? row.driver_name}</span>
            <span className="previous-race-recap__gap">{row.time ?? "—"}</span>
          </li>
        ))}
      </ol>

      {recap.fastest_lap && (
        <p className="previous-race-recap__fastest">
          Fastest lap: {recap.fastest_lap.driver_code ?? recap.fastest_lap.driver_name}
          {recap.fastest_lap.fastest_lap_time ? ` · ${recap.fastest_lap.fastest_lap_time}` : ""}
        </p>
      )}

      {recap.sprint_top3 && (
        <div className="previous-race-recap__sprint">
          <p className="previous-race-recap__sprint-label">Sprint</p>
          <ol className="previous-race-recap__podium previous-race-recap__podium--sprint">
            {recap.sprint_top3.map((row) => (
              <li key={row.position} className="previous-race-recap__row">
                <span className="previous-race-recap__pos">{row.position}</span>
                <span className="previous-race-recap__name">
                  {row.driver_code ?? row.driver_name}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
