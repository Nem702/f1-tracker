import type { Race } from "../api/types";
import { fmtDate } from "../format";

interface Props {
  races: Race[];
  value: number | null;
  onChange: (sessionKey: number) => void;
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** The one filter on the dashboard — a standard combobox in its own row above
 *  the charts; everything below re-renders against the selected race. */
export function RaceSelector({ races, value, onChange }: Props) {
  return (
    <label className="race-selector">
      <span className="race-selector__label">
        <CalendarIcon />
        Race
      </span>
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
