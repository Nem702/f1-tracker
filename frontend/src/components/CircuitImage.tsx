import type { CircuitInfo, LastYearWinner } from "../api/types";
import "./CircuitImage.css";

interface Props {
  circuit: CircuitInfo;
  lastYearWinner: LastYearWinner | null;
}

/** Race Weekend's circuit card: an empty placeholder frame plus circuit
 *  name/location, rather than the lat/long pin map this originally replaced.
 *  Also carries the "who won here last year" footnote — same circuit
 *  context, one card instead of a separate one for a single line of text. */
export function CircuitImage({ circuit, lastYearWinner }: Props) {
  const hasWinner =
    lastYearWinner !== null &&
    (lastYearWinner.driver_name || lastYearWinner.constructor_name);

  return (
    <div className="circuit-image glass">
      <p className="circuit-image__eyebrow">Circuit</p>
      <h3 className="circuit-image__title">{circuit.name ?? "Unknown circuit"}</h3>
      {(circuit.locality || circuit.country) && (
        <p className="circuit-image__location">
          {[circuit.locality, circuit.country].filter(Boolean).join(", ")}
        </p>
      )}
      <div className="circuit-image__frame" />
      {hasWinner && (
        <p className="circuit-image__last-winner">
          {lastYearWinner!.season} winner here: {lastYearWinner!.driver_name}
          {lastYearWinner!.constructor_name ? ` (${lastYearWinner!.constructor_name})` : ""}
        </p>
      )}
    </div>
  );
}
