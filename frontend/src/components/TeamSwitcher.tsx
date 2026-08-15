import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import type { DriverPair, TeamRoster } from "../teams";
import { useMode } from "../hooks/useTheme";
import { teamSwatch } from "../theme";
import { GlassSelect } from "./GlassSelect";
import { TeamMark } from "./TeamMark";
import { chipCascadeDelay, chipEntrance } from "../motion";

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
 * Segmented team switcher under the hero: one glass chip per tracked team
 * (swatch + name + duo acronyms) plus a Head-to-Head chip that reveals two
 * selects covering every tracked driver, grouped by team. One accessible
 * radiogroup — roving tabindex, arrow keys move AND select, matching the
 * WAI-ARIA radio pattern. Chip click swaps the whole dashboard to that team's
 * duo; no refetch happens anywhere (charts filter client-side by driver
 * number).
 *
 * The chips WRAP (a centered grid — see .team-switcher__chips), so on the
 * full 2026 grid they read as two rows of six rather than one row. Arrow keys
 * deliberately stay one-dimensional across that wrap: Right/Down step to the
 * next chip in TEAM_ORDER and Left/Up to the previous one, wrapping around the
 * ends, which is exactly what the ARIA radio-group pattern specifies (next /
 * previous in the group, not spatial navigation). Keeping it flat means the
 * key order, the DOM order and the roving-tabindex order are all the same
 * sequence at every breakpoint, and nothing has to know how many columns the
 * grid currently has — that count changes at two media queries and would have
 * to be measured at runtime to drive a truly 2-D scheme.
 *
 * Chips carry the home cascade's entrance (see App.tsx's homeCascade.chips)
 * — the delay is relative to THIS component's own mount, not the page's,
 * since App.tsx only renders it once rosters/pair have resolved. On a fast
 * API response that's indistinguishable from the rest of the cascade; on a
 * slow one, chips simply land a beat later than the nominal ~1s rather than
 * ever looking broken — same tradeoff Countdown already makes.
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
            <motion.button
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
              variants={chipEntrance}
              custom={chipCascadeDelay(idx, items.length)}
              initial="hidden"
              animate="show"
            >
              <span className="team-chip__mark">
                <TeamMark slug={roster.slug} />
              </span>
              <span className="team-chip__name">{roster.name}</span>
              <span className="team-chip__duo">
                {roster.duo[0].acronym} · {roster.duo[1].acronym}
              </span>
            </motion.button>
          );
        })}
        <motion.button
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
          variants={chipEntrance}
          custom={chipCascadeDelay(rosters.length, items.length)}
          initial="hidden"
          animate="show"
        >
          <span className="team-chip__swatch team-chip__swatch--h2h" aria-hidden="true">
            <VersusIcon />
          </span>
          <span className="team-chip__name">Head-to-Head</span>
          <span className="team-chip__duo">any two drivers</span>
        </motion.button>
      </div>

      {active === "h2h" && pair && (
        <div className="team-switcher__h2h">
          {([0, 1] as const).map((side) => (
            <GlassSelect
              key={side}
              ariaLabel={`Driver ${side === 0 ? "A" : "B"}`}
              label={`Driver ${side === 0 ? "A" : "B"}`}
              groups={rosters.map((roster) => ({
                label: roster.name,
                options: roster.drivers.map((d) => ({
                  value: d.number,
                  label: `${d.acronym} · ${d.lastName}`,
                  // the other slot's pick — a pair of one driver is no pair
                  disabled: d.number === pair[side === 0 ? 1 : 0].number,
                })),
              }))}
              value={pair[side].number}
              onChange={(n) => {
                if (side === 0) onSelectPair(n, pair[1].number);
                else onSelectPair(pair[0].number, n);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
