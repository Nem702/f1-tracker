import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { MotionConfig } from "framer-motion";
import { api } from "./api/client";
import { useApi } from "./hooks/useApi";
import { setTint, useMode, useTheme } from "./hooks/useTheme";
import { cssVars, tintForPair } from "./theme";
import { buildRosters, findDriver, pairTeamSlug, type DriverPair } from "./teams";
import { deriveDelta } from "./lib/delta";
import { fmtDate } from "./format";
import { Sidebar } from "./components/Sidebar";
import { normalizeHash, type View } from "./viewState";
import { ViewTransition } from "./components/ViewTransition";
import { AuroraBackground } from "./components/AuroraBackground";
import { Hero3D } from "./components/Hero3D";
import { Countdown } from "./components/Countdown";
import { About } from "./components/About";
import { Reveal } from "./components/Reveal";
import { StatTiles } from "./components/StatTiles";
import { RaceSelector } from "./components/RaceSelector";
import { TeamSwitcher } from "./components/TeamSwitcher";
import { LapTimeChart } from "./components/LapTimeChart";
import { DeltaChart } from "./components/DeltaChart";
import { TireStrategy } from "./components/TireStrategy";
import { PitStopChart } from "./components/PitStopChart";
import { PositionChart } from "./components/PositionChart";
import { WeatherChart } from "./components/WeatherChart";
import { RaceControlFeed } from "./components/RaceControlFeed";

/* Sidebar collapse: an explicit user choice persists (same storage pattern
   as hooks/useTheme.ts); first visit defaults to collapsed on narrow
   screens. Below 900px the CSS media query forces the icon rail regardless
   of this state, and the toggle button is hidden there. */
const SIDEBAR_KEY = "f1-tracker-sidebar";

function readStoredCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY);
    if (raw === "collapsed") return true;
    if (raw === "expanded") return false;
  } catch {
    // Storage being unavailable only loses persistence, not the toggle.
  }
  return window.innerWidth < 900;
}

/* The selected pair persists as two driver numbers. They're validated
   against the fetched roster on every resolve (a stale number from a past
   season falls back to the Ferrari duo), so a bad stored value can never
   brick the dashboard. */
const PAIR_KEY = "f1-tracker-pair";

function readStoredPair(): [number, number] | null {
  try {
    const raw = localStorage.getItem(PAIR_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      parsed.every((n) => typeof n === "number")
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // Unparseable storage just means the default pair.
  }
  return null;
}

/** Hash-synced view state — no router. Sidebar owns the view list; this
 *  just mirrors `location.hash` into it so back/forward and reload both
 *  land on the right view. */
function useView(): View {
  const [view, setView] = useState<View>(() => normalizeHash(window.location.hash));
  useEffect(() => {
    const onHashChange = () => setView(normalizeHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return view;
}

export default function App() {
  const mode = useMode();
  const view = useView();

  const races = useApi((_k) => api.races(), 0);
  const drivers = useApi((_k) => api.drivers(), 0);

  const [selected, setSelected] = useState<number | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(readStoredCollapsed);
  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded");
    } catch {
      // Storage being unavailable only loses persistence, not the toggle.
    }
  };

  // Default to the most recent race once the list arrives.
  useEffect(() => {
    if (selected === null && races.data && races.data.length > 0) {
      setSelected(races.data[0].session_key);
    }
  }, [races.data, selected]);

  // ---- pair model -----------------------------------------------------------
  // Rosters come from the API (which resolved drivers per-session from
  // OpenF1) — same rule as the backend: numbers are never hardcoded.
  const rosters = useMemo(() => buildRosters(drivers.data ?? []), [drivers.data]);

  const [pairNumbers, setPairNumbers] = useState<[number, number] | null>(
    readStoredPair,
  );
  const setPair = (a: number, b: number) => {
    setPairNumbers([a, b]);
    try {
      localStorage.setItem(PAIR_KEY, JSON.stringify([a, b]));
    } catch {
      // Storage being unavailable only loses persistence, not the switch.
    }
  };

  const pair: DriverPair | null = useMemo(() => {
    if (rosters.length === 0) return null;
    if (pairNumbers) {
      const a = findDriver(rosters, pairNumbers[0]);
      const b = findDriver(rosters, pairNumbers[1]);
      if (a && b && a.number !== b.number) return [a, b];
    }
    const ferrari = rosters.find((r) => r.slug === "ferrari") ?? rosters[0];
    return ferrari.duo;
  }, [rosters, pairNumbers]);

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

  const laps = useApi(api.laps, selected);
  const stints = useApi(api.stints, selected);
  const pit = useApi(api.pit, selected);
  const positions = useApi(api.positions, selected);
  const weather = useApi(api.weather, selected);
  const raceControl = useApi(api.raceControl, selected);

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

  // Sakhir/Jeddah exist on OpenF1 with a roster but zero telemetry — the
  // charts each show their own empty state; this banner explains why.
  const emptyRace = laps.data !== null && laps.data.length === 0;

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`app-shell${sidebarCollapsed ? " app-shell--collapsed" : ""}`}
        data-team={teamSlug ?? undefined}
        style={{ ...cssVars(theme), colorScheme: mode } as CSSProperties}
      >
        <AuroraBackground />
        <Sidebar
          view={view}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />

        <div className="content">
          <ViewTransition viewKey={view}>
            {view === "overview" && (
              <section className="view view--overview">
                <header className="view__header">
                  <p className="view__eyebrow">Overview</p>
                  <h1 className="view__title">
                    {pair ? `${pair[0].lastName} vs. ${pair[1].lastName}.` : "Head to head."}
                  </h1>
                </header>

                <Hero3D laps={laps.data ?? []} pair={pair} raceLabel={raceLabel} />

                <div className="overview__selectors">
                  {rosters.length > 0 && pair && (
                    <TeamSwitcher
                      rosters={rosters}
                      pair={pair}
                      onSelectPair={setPair}
                    />
                  )}
                  <RaceSelector
                    races={races.data ?? []}
                    value={selected}
                    onChange={setSelected}
                  />
                </div>

                <div className="overview__row">
                  <Countdown />
                  <div className="overview__stats-slot">
                    <StatTiles
                      laps={laps.data ?? []}
                      pit={pit.data ?? []}
                      delta={deltaRows}
                      pair={pair}
                      loading={laps.loading || pit.loading}
                    />
                  </div>
                </div>
              </section>
            )}

            {view === "race-analysis" && (
              <section className="view view--race-analysis race-info">
                <header className="view__header">
                  <p className="view__eyebrow">Race Analysis</p>
                  <h1 className="view__title">Pick a race. See how it unfolded.</h1>
                </header>

                <div className="filters">
                  <RaceSelector
                    races={races.data ?? []}
                    value={selected}
                    onChange={setSelected}
                  />
                  {race && (
                    <span className="filters__meta">
                      {race.country_name} · {race.circuit_short_name}
                    </span>
                  )}
                  {emptyRace && (
                    <span className="filters__note">
                      OpenF1 published no telemetry for this race — every panel
                      below is empty by design, not by error.
                    </span>
                  )}
                  {races.error && (
                    <span className="filters__note">{races.error}</span>
                  )}
                </div>

                <main className="grid">
                  <Reveal wide>
                    <LapTimeChart
                      laps={laps.data ?? []}
                      pair={pair}
                      loading={laps.loading}
                      error={laps.error}
                    />
                  </Reveal>
                  <Reveal wide>
                    <DeltaChart
                      rows={deltaRows}
                      pair={pair}
                      loading={laps.loading}
                      error={laps.error}
                    />
                  </Reveal>
                  <Reveal>
                    <TireStrategy
                      stints={stints.data ?? []}
                      pair={pair}
                      loading={stints.loading}
                      error={stints.error}
                    />
                  </Reveal>
                  <Reveal delay={0.08}>
                    <PitStopChart
                      pit={pit.data ?? []}
                      pair={pair}
                      loading={pit.loading}
                      error={pit.error}
                    />
                  </Reveal>
                  <Reveal wide>
                    <PositionChart
                      positions={positions.data ?? []}
                      pair={pair}
                      loading={positions.loading}
                      error={positions.error}
                    />
                  </Reveal>
                  <Reveal>
                    <WeatherChart
                      weather={weather.data ?? []}
                      loading={weather.loading}
                      error={weather.error}
                    />
                  </Reveal>
                  <Reveal delay={0.08}>
                    <RaceControlFeed
                      raceControl={raceControl.data ?? []}
                      loading={raceControl.loading}
                      error={raceControl.error}
                    />
                  </Reveal>
                </main>
              </section>
            )}

            {view === "about" && (
              <section className="view view--about">
                <About />
              </section>
            )}
          </ViewTransition>

          <footer className="footer">
            <nav className="footer__social" aria-label="Social links">
              <a
                href="https://github.com/Nem702/f1-tracker"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              {/* TODO: replace with real URL */}
              <a href="#">LinkedIn</a>
              {/* TODO: replace with real URL */}
              <a href="#">X</a>
            </nav>
            <p className="footer__credit">
              Data from OpenF1, fetched weekly into Neon Postgres · a
              skill-building project, not a finished product.
            </p>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
}
