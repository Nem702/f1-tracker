import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { DriverPair, TeamRoster } from "../teams";
import { useMode } from "../hooks/useTheme";
import { teamSwatch } from "../theme";

interface Props {
  rosters: TeamRoster[];
  pair: DriverPair | null;
  onSelectPair: (a: number, b: number) => void;
}

function VersusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

const samePair = (duo: DriverPair, pair: DriverPair) =>
  (duo[0].number === pair[0].number && duo[1].number === pair[1].number) ||
  (duo[0].number === pair[1].number && duo[1].number === pair[0].number);

/**
 * Segmented team switcher under the hero: four glass team chips (swatch +
 * name + duo acronyms) plus a Head-to-Head chip that reveals two selects
 * covering every tracked driver, grouped by team. One accessible radiogroup —
 * roving tabindex, arrow keys move AND select, matching the WAI-ARIA radio
 * pattern. Chip click swaps the whole dashboard to that team's duo; no
 * refetch happens anywhere (charts filter client-side by driver number).
 */
export function TeamSwitcher({ rosters, pair, onSelectPair }: Props) {
  const mode = useMode();
  // The chip row highlights the pair's team; a pair that matches no duo
  // (mixed, or a custom same-team combo) belongs to Head-to-Head. The flag
  // keeps H2H active (selects visible) while the user composes a pair that
  // happens to equal a duo.
  const duoTeam =
    pair === null ? null : rosters.find((r) => samePair(r.duo, pair)) ?? null;
  const [h2hOpen, setH2hOpen] = useState(() => pair !== null && duoTeam === null);
  const active = h2hOpen || !duoTeam ? "h2h" : duoTeam.slug;

  const items: string[] = [...rosters.map((r) => r.slug), "h2h"];
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: string) => {
    if (id === "h2h") {
      setH2hOpen(true);
      return;
    }
    setH2hOpen(false);
    const roster = rosters.find((r) => r.slug === id);
    if (roster) onSelectPair(roster.duo[0].number, roster.duo[1].number);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(items[next]);
    chipRefs.current[next]?.focus();
  };

  return (
    <div className="team-switcher">
      <div className="team-switcher__chips" role="radiogroup" aria-label="Team">
        {rosters.map((roster, idx) => {
          const isActive = active === roster.slug;
          return (
            <button
              key={roster.slug}
              ref={(el) => {
                chipRefs.current[idx] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`team-chip glass${isActive ? " team-chip--active" : ""}`}
              style={{ "--chip-color": teamSwatch(mode, roster.slug) } as CSSProperties}
              onClick={() => select(roster.slug)}
              onKeyDown={(e) => onKeyDown(e, idx)}
            >
              <span className="team-chip__swatch" aria-hidden="true" />
              <span className="team-chip__name">{roster.name}</span>
              <span className="team-chip__duo">
                {roster.duo[0].acronym} · {roster.duo[1].acronym}
              </span>
            </button>
          );
        })}
        <button
          ref={(el) => {
            chipRefs.current[rosters.length] = el;
          }}
          type="button"
          role="radio"
          aria-checked={active === "h2h"}
          tabIndex={active === "h2h" ? 0 : -1}
          className={`team-chip team-chip--h2h glass${active === "h2h" ? " team-chip--active" : ""}`}
          onClick={() => select("h2h")}
          onKeyDown={(e) => onKeyDown(e, rosters.length)}
        >
          <span className="team-chip__swatch team-chip__swatch--h2h" aria-hidden="true">
            <VersusIcon />
          </span>
          <span className="team-chip__name">Head-to-Head</span>
          <span className="team-chip__duo">any two drivers</span>
        </button>
      </div>

      {active === "h2h" && pair && (
        <div className="team-switcher__h2h">
          {([0, 1] as const).map((side) => (
            <label key={side} className="race-selector team-switcher__select">
              <span className="race-selector__label">
                Driver {side === 0 ? "A" : "B"}
              </span>
              <select
                value={pair[side].number}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (side === 0) onSelectPair(n, pair[1].number);
                  else onSelectPair(pair[0].number, n);
                }}
              >
                {rosters.map((roster) => (
                  <optgroup key={roster.slug} label={roster.name}>
                    {roster.drivers.map((d) => (
                      <option
                        key={d.number}
                        value={d.number}
                        disabled={d.number === pair[side === 0 ? 1 : 0].number}
                      >
                        {d.acronym} · {d.lastName}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
