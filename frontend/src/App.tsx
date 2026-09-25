import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { MotionConfig, motion } from "framer-motion";
import { api } from "./api/client";
import { useApi, type ApiState } from "./hooks/useApi";
import { useScrollSpy } from "./hooks/useScrollSpy";
import { setTint, useMode, useTheme } from "./hooks/useTheme";
import { cssVars, tintForPair } from "./theme";
import {
  buildRosters,
  defaultTeam,
  findDriver,
  pairTeamSlug,
  raceEntrants,
  TEAM_ORDER,
  type DriverPair,
  type TeamSlug,
} from "./teams";
import { HERO_CIRCUITS_ATTRIBUTION } from "./data/heroCircuits";
import { deriveDelta } from "./lib/delta";
import { filterSelectableRaces } from "./lib/selectableRaces";
import { fmtDate } from "./format";
import { Navbar } from "./components/Navbar";
import { SECTIONS, normalizeHash } from "./viewState";
import { AuroraBackground } from "./components/AuroraBackground";
import { Hero } from "./components/Hero";
import { NextRace } from "./components/NextRace";
import { LastRace } from "./components/LastRace";
import { Standings } from "./components/Standings";
import { Telemetry } from "./components/Telemetry";
import { About } from "./components/About";
import { entrance } from "./motion";

/* The selection persists as either a team ({"team":"redbull"} — the chip
   re-resolves to that team's two drivers in whichever race is selected) or a
   head-to-head pair ({"h2h":[a,b]} — exactly those two drivers, always).
   Older builds stored a bare [a,b]; it stays readable and is sorted into team
   or H2H once the rosters arrive (see the legacy branch in `pair`). Every stored
   value is validated against the fetched rosters on each resolve, so a bad
   one can never brick the dashboard — it falls back to the default team.
   Nothing is written until the user picks something. */
const PAIR_KEY = "f1-tracker-pair";

type Selection =
  | { team: TeamSlug }
  | { h2h: [number, number] }
  | { legacy: [number, number] };

const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number");

function readStoredSelection(): Selection | null {
  try {
    const raw = localStorage.getItem(PAIR_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isPair(parsed)) return { legacy: parsed };
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      if (typeof o.team === "string" && (TEAM_ORDER as readonly string[]).includes(o.team)) {
        return { team: o.team as TeamSlug };
      }
      if (isPair(o.h2h)) return { h2h: o.h2h };
    }
  } catch {
    // Unparseable storage just means the default pair.
  }
  return null;
}

export default function App() {
  const mode = useMode();
  const active = useScrollSpy(SECTIONS, normalizeHash(window.location.hash));

  // On first load with a mid-page hash (a shared link, a reload after
  // scrolling), jump straight there with no animation instead of always
  // opening at the hero — same as a plain anchor link would. This can't
  // just scroll on the next frame: every section fetches its own data
  // independently (races, standings, official results, telemetry, …), each
  // resolving at its own pace, and every telemetry chart is lazy-loaded on
  // top of that — so the page's height grows in several
  // separate spurts over the first second or two rather than settling once.
  // A ResizeObserver on <body> catches every one of those spurts — the jump
  // only fires once layout has gone quiet for 600ms (comfortably longer
  // than the gap between one section's data arriving and the next's), so it
  // lands on the section's final position instead of wherever it happened
  // to be after the first quiet moment. The hard timeout is a floor, not
  // the common case: it only matters if a fetch stalls badly enough that
  // layout never goes quiet.
  useEffect(() => {
    const target = normalizeHash(window.location.hash);
    if (target === "hero") return;

    let settled = false;
    let debounceId = 0;

    const land = () => {
      if (settled) return;
      settled = true;
      document.getElementById(target)?.scrollIntoView({ behavior: "auto", block: "start" });
    };
    const scheduleLand = () => {
      window.clearTimeout(debounceId);
      debounceId = window.setTimeout(land, 600);
    };

    // ResizeObserver reports once immediately on observe() (covers the
    // case where layout is already fully settled) and again on every
    // subsequent height change, so no separate initial call is needed here
    // — adding one would race the real first report and could fire `land`
    // before anything lazy has actually grown the page.
    const observer = new ResizeObserver(scheduleLand);
    observer.observe(document.body);

    const hardTimeout = window.setTimeout(land, 4500);

    return () => {
      settled = true;
      observer.disconnect();
      window.clearTimeout(debounceId);
      window.clearTimeout(hardTimeout);
    };
  }, []);

  const races = useApi((_k) => api.races(), 0);
  const drivers = useApi((_k) => api.drivers(), 0);
  // #next-race and #last-race both read this one payload — a race weekend
  // recap embeds the previous race alongside the upcoming one, so one fetch
  // serves both sections' worth of Jolpica data.
  const raceWeekend = useApi((_k) => api.raceWeekend(), 0);

  // Computed once here, not inside RaceSelector, so both instances (Hero's
  // and Telemetry's) and the default-selection effect below all agree on
  // what's selectable — filtering inside RaceSelector would leave this
  // effect free to default to a race the user cannot see. `now` is evaluated
  // once per races.data change, not per row.
  const selectableRaces = useMemo(
    () => filterSelectableRaces(races.data ?? [], Date.now()),
    [races.data],
  );

  const [selected, setSelected] = useState<number | null>(null);

  // Default to the most recent SELECTABLE race once the list arrives.
  useEffect(() => {
    if (selected === null && selectableRaces.length > 0) {
      setSelected(selectableRaces[0].session_key);
    }
  }, [selectableRaces, selected]);

  // ---- pair model -----------------------------------------------------------
  // Rosters come from the API (which resolved drivers per-session from
  // OpenF1) — same rule as the backend: numbers are never hardcoded. The
  // chip duos follow the selected race's official result, so a mid-season
  // swap resolves per race; the per-race fetches are declared here because
  // the pair depends on them.
  const laps = useApi(api.laps, selected);
  const officialResult = useApi(api.officialResult, selected);
  const raceResult = officialResult.data?.official_result?.race ?? null;
  const rosters = useMemo(
    () =>
      buildRosters(
        drivers.data ?? [],
        raceResult ? raceEntrants(raceResult, drivers.data ?? []) : undefined,
      ),
    [drivers.data, raceResult],
  );

  const [selection, setSelection] = useState<Selection | null>(readStoredSelection);
  const store = (next: Selection) => {
    setSelection(next);
    try {
      localStorage.setItem(PAIR_KEY, JSON.stringify(next));
    } catch {
      // Storage being unavailable only loses persistence, not the switch.
    }
  };
  const selectTeam = (slug: TeamSlug) => store({ team: slug });
  const selectH2h = (a: number, b: number) => store({ h2h: [a, b] });

  const pair: DriverPair | null = useMemo(() => {
    if (rosters.length === 0) return null;
    const teamPair = (slug: TeamSlug) => rosters.find((r) => r.slug === slug)?.duo ?? null;
    const exactPair = ([na, nb]: [number, number]): DriverPair | null => {
      const a = findDriver(rosters, na);
      const b = findDriver(rosters, nb);
      return a && b && a.number !== b.number ? [a, b] : null;
    };
    let resolved: DriverPair | null = null;
    if (selection && "team" in selection) resolved = teamPair(selection.team);
    else if (selection && "h2h" in selection) resolved = exactPair(selection.h2h);
    else if (selection) {
      // A bare [a,b] from an older build counts as a team
      // when both drivers are on the same team in the season roster (that's
      // what the old chip stored); anything else was a head-to-head pick.
      const legacy = exactPair(selection.legacy);
      resolved =
        legacy && legacy[0].teamSlug === legacy[1].teamSlug
          ? teamPair(legacy[0].teamSlug)
          : legacy;
    }
    if (resolved) return resolved;
    const slug = defaultTeam(rosters, laps.data ?? []);
    return slug ? teamPair(slug) : null;
  }, [rosters, selection, laps.data]);

  // Push the pair's tint (team chrome + slot colors) into the theme store so
  // every useTheme() consumer — charts, ribbons, CSS vars — retints together.
  const tint = useMemo(
    () => tintForPair(pair?.[0] ?? null, pair?.[1] ?? null),
    [pair],
  );
  useEffect(() => {
    setTint(tint);
  }, [tint]);
  const theme = useTheme();
  const teamSlug = pairTeamSlug(pair);

  const stints = useApi(api.stints, selected);
  const pit = useApi(api.pit, selected);
  const positions = useApi(api.positions, selected);
  const weather = useApi(api.weather, selected);
  const raceControl = useApi(api.raceControl, selected);

  // While the races list is still in flight nothing can be selected, so every
  // per-race fetch above sits idle (key null, loading false) — which reads
  // exactly like a loaded-but-empty race. Surface that bootstrap window as
  // loading so a slow first paint shows skeletons instead of "No data
  // recorded for this race". A races error leaves this false: the existing
  // empty/error states are then the truthful ones.
  const bootstrapping = selected === null && races.loading;
  const withBootstrap = <T,>(s: ApiState<T>): ApiState<T> =>
    bootstrapping && !s.loading ? { ...s, loading: true } : s;

  // Client-side teammate delta (the old /api/delta was only a join-and-
  // subtract over rows already in `laps`) — a pair switch recomputes it
  // instantly, no refetch.
  const deltaRows = useMemo(
    () =>
      deriveDelta(
        laps.data ?? [],
        pair?.[0].number ?? null,
        pair?.[1].number ?? null,
      ),
    [laps.data, pair],
  );

  const race = races.data?.find((r) => r.session_key === selected) ?? null;
  const raceLabel = race
    ? `${race.location ?? race.circuit_short_name ?? "?"} · ${fmtDate(race.date_start)}`
    : "2026 season";

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="app-shell"
        data-team={teamSlug ?? undefined}
        style={{ ...cssVars(theme), colorScheme: mode } as CSSProperties}
      >
        <AuroraBackground />
        <Navbar active={active} />

        <div className="content">
          <section id="hero" className="hero-section">
            <Hero
              laps={laps.data ?? []}
              pit={pit.data ?? []}
              raceControl={raceControl.data ?? []}
              race={race}
              raceWeekend={raceWeekend.data?.race_weekend ?? null}
              pair={pair}
              rosters={rosters}
              onSelectPair={selectH2h}
              onSelectTeam={selectTeam}
              races={selectableRaces}
              selected={selected}
              onSelectRace={setSelected}
            />
          </section>

          <section id="next-race" className="page-section" data-band="a">
            <NextRace
              data={raceWeekend.data?.race_weekend ?? null}
              loading={raceWeekend.loading}
              error={raceWeekend.error}
            />
          </section>

          <section id="last-race" className="page-section" data-band="b">
            <LastRace
              recap={raceWeekend.data?.race_weekend?.previous_race ?? null}
              recapLoading={raceWeekend.loading}
              result={officialResult.data?.official_result ?? null}
              resultLoading={officialResult.loading || bootstrapping}
              resultError={officialResult.error}
              raceLabel={raceLabel}
            />
          </section>

          <section id="season-standings" className="page-section" data-band="a">
            <Standings />
          </section>

          <section id="telemetry" className="page-section" data-band="b">
            <Telemetry
              races={selectableRaces}
              selected={selected}
              onSelectRace={setSelected}
              race={race}
              raceLabel={raceLabel}
              racesError={races.error}
              pair={pair}
              rosters={rosters}
              onSelectPair={selectH2h}
              onSelectTeam={selectTeam}
              laps={withBootstrap(laps)}
              stints={withBootstrap(stints)}
              pit={withBootstrap(pit)}
              positions={withBootstrap(positions)}
              weather={withBootstrap(weather)}
              raceControl={withBootstrap(raceControl)}
              deltaRows={deltaRows}
            />
          </section>

          <About />

          <motion.footer
            className="footer"
            variants={entrance}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
          >
            <nav className="footer__social" aria-label="Social links">
              <a
                href="https://github.com/Nem702/f1-tracker"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              {/* TODO: LinkedIn + X pills went here — re-add once the real
                  profile URLs exist (placeholder "#" links shipped to
                  production and read as broken). */}
            </nav>
            <p className="footer__credit">
              Data from{" "}
              <a href="https://openf1.org/" target="_blank" rel="noreferrer">
                OpenF1
              </a>{" "}
              and{" "}
              <a
                href="https://github.com/jolpica/jolpica-f1"
                target="_blank"
                rel="noreferrer"
              >
                Jolpica F1
              </a>
              , fetched weekly into Neon Postgres · built by{" "}
              <a
                href="https://github.com/Nem702"
                target="_blank"
                rel="noreferrer"
              >
                Nem702
              </a>{" "}
              · a skill-building project, not a finished product.
            </p>
            <p className="footer__credit footer__credit--attribution">
              {HERO_CIRCUITS_ATTRIBUTION}
            </p>
          </motion.footer>
        </div>
      </div>
    </MotionConfig>
  );
}
