import type { CircuitInfo, LastYearWinner } from "../api/types";
import "./CircuitCard.css";

interface Props {
  circuit: CircuitInfo;
  lastYearWinner: LastYearWinner | null;
}

/** Race Weekend's circuit card: hand-curated fast facts for the upcoming
 *  circuit — length, turns, race laps, first GP, the race lap record, and
 *  one character line — plus the "who won here last year" footnote. Every
 *  fact is optional (a circuit missing from circuit_facts.json renders
 *  just name/location/winner), so the card never shows an empty frame.
 *  A telemetry-traced track outline may layer behind the grid later. */
export function CircuitCard({ circuit, lastYearWinner }: Props) {
  const facts = circuit.facts;
  const hasWinner =
    lastYearWinner !== null &&
    (lastYearWinner.driver_name || lastYearWinner.constructor_name);

  const tiles: { label: string; value: string }[] = [];
  if (facts?.length_km != null) tiles.push({ label: "Length", value: `${facts.length_km} km` });
  if (facts?.turns != null) tiles.push({ label: "Turns", value: String(facts.turns) });
  if (facts?.laps != null) tiles.push({ label: "Race laps", value: String(facts.laps) });
  if (facts?.first_gp != null) tiles.push({ label: "First GP", value: String(facts.first_gp) });

  return (
    <div className="circuit-card glass">
      <p className="circuit-card__eyebrow">Circuit</p>
      <h3 className="circuit-card__title">{circuit.name ?? "Unknown circuit"}</h3>
      {(circuit.locality || circuit.country) && (
        <p className="circuit-card__location">
          {[circuit.locality, circuit.country].filter(Boolean).join(", ")}
        </p>
      )}
      {tiles.length > 0 && (
        <dl className="circuit-card__facts">
          {tiles.map((t) => (
            <div key={t.label} className="circuit-card__fact">
              <dt>{t.label}</dt>
              <dd>{t.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {facts?.lap_record && (
        <p className="circuit-card__record">
          <span className="circuit-card__record-label">Lap record</span>
          <span className="circuit-card__record-value">{facts.lap_record.time}</span>
          <span className="circuit-card__record-holder">
            {facts.lap_record.driver} · {facts.lap_record.year}
          </span>
        </p>
      )}
      {facts?.note && <p className="circuit-card__note">{facts.note}</p>}
      {hasWinner && (
        <p className="circuit-card__last-winner">
          {lastYearWinner!.season} winner here: {lastYearWinner!.driver_name}
          {lastYearWinner!.constructor_name ? ` (${lastYearWinner!.constructor_name})` : ""}
        </p>
      )}
    </div>
  );
}
