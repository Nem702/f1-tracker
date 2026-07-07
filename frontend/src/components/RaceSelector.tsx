import type { Race } from "../api/types";
import { fmtDate } from "../format";
import { GlassSelect } from "./GlassSelect";

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

/** The race picker — one instance in Race Analysis's filter row, one under
 *  the hero; both drive the same `selected` state in App, so the whole app
 *  re-renders against the selected race wherever it was picked. Renders
 *  through GlassSelect (custom listbox — the OS-native popup was unreadable
 *  in dark mode and never matched the glass look). */
export function RaceSelector({ races, value, onChange }: Props) {
  return (
    <GlassSelect
      ariaLabel="Race"
      label={
        <>
          <CalendarIcon />
          Race
        </>
      }
      groups={[
        {
          options: races.map((race) => ({
            value: race.session_key,
            label: `${race.location ?? race.circuit_short_name ?? race.session_key} · ${fmtDate(race.date_start)}`,
          })),
        },
      ]}
      value={value}
      placeholder="Loading…"
      disabled={races.length === 0}
      onChange={onChange}
    />
  );
}
