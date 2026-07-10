import type { WeekendSession } from "../api/types";

function fmtSessionTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  sessions: WeekendSession[];
}

/** Glass card listing every weekend session (practice/sprint/qualifying/
 *  race) in chronological order, in the visitor's local timezone — the
 *  schedule half of #next-race, alongside CircuitImage. */
export function RaceWeekendSchedule({ sessions }: Props) {
  return (
    <div className="weekend-schedule glass">
      <p className="weekend-schedule__eyebrow">Weekend schedule</p>
      <h3 className="weekend-schedule__title">Session times</h3>
      <ol className="weekend-schedule__list">
        {sessions.map((s) => (
          <li key={s.name} className="weekend-schedule__row">
            <span className="weekend-schedule__name">{s.name}</span>
            <span className="weekend-schedule__time">{fmtSessionTime(s.date_start)}</span>
          </li>
        ))}
      </ol>
      <p className="weekend-schedule__note">Times shown in your local timezone.</p>
    </div>
  );
}
