import type { Race } from "../api/types";
import { fmtDate } from "../format";

interface Props {
  races: Race[];
  value: number | null;
  onChange: (sessionKey: number) => void;
}

/** The one filter on the dashboard — a standard combobox in its own row above
 *  the charts; everything below re-renders against the selected race. */
export function RaceSelector({ races, value, onChange }: Props) {
  return (
    <label className="race-selector">
      <span className="race-selector__label">Race</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={races.length === 0}
      >
        {races.length === 0 && <option value="">Loading…</option>}
        {races.map((race) => (
          <option key={race.session_key} value={race.session_key}>
            {race.location ?? race.circuit_short_name ?? race.session_key} ·{" "}
            {fmtDate(race.date_start)}
          </option>
        ))}
      </select>
    </label>
  );
}
