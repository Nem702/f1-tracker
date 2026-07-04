export interface TeamOption {
  id: string;
  name: string;
  drivers: string; // display string, e.g. "Hamilton vs. Leclerc"
}

interface Props {
  teams: TeamOption[];
  value: string;
  onChange: (teamId: string) => void;
}

function TeamIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 19c.6-3 2.6-5 5.5-5s4.9 2 5.5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M15.5 14.2c2.4.3 4.2 2 4.7 4.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Frosted pill under the hero choosing which team's driver pair the hero
 *  compares. Same pill recipe as RaceSelector (shared rules in index.css),
 *  glass variant since it sits on the bare page, not in a filter row.
 *  Currently a shell for the multi-team expansion: Ferrari is the only
 *  option, so selecting drives no fetches yet. */
export function TeamSelector({ teams, value, onChange }: Props) {
  return (
    <label className="team-selector">
      <span className="team-selector__label">
        <TeamIcon />
        Team
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name} · {team.drivers}
          </option>
        ))}
      </select>
    </label>
  );
}
