import { useEffect, useState, type CSSProperties } from "react";
import { MotionConfig } from "framer-motion";
import { api } from "./api/client";
import { useApi } from "./hooks/useApi";
import { useMode } from "./hooks/useTheme";
import { cssVars, themes } from "./theme";
import { fmtDate } from "./format";
import { Sidebar } from "./components/Sidebar";
import { normalizeHash, type View } from "./viewState";
import { ViewTransition } from "./components/ViewTransition";
import { Hero3D } from "./components/Hero3D";
import { Countdown } from "./components/Countdown";
import { About } from "./components/About";
import { Reveal } from "./components/Reveal";
import { StatTiles } from "./components/StatTiles";
import { RaceSelector } from "./components/RaceSelector";
import { TeamSelector, type TeamOption } from "./components/TeamSelector";
import { LapTimeChart } from "./components/LapTimeChart";
import { DeltaChart } from "./components/DeltaChart";
import { TireStrategy } from "./components/TireStrategy";
import { PitStopChart } from "./components/PitStopChart";
import { PositionChart } from "./components/PositionChart";
import { WeatherChart } from "./components/WeatherChart";
import { RaceControlFeed } from "./components/RaceControlFeed";

/** UI shell for the multi-team expansion (Ferrari → Mercedes → McLaren →
 *  Red Bull): one option today, so choosing a team drives no fetches yet —
 *  the dashboard still resolves the Hamilton/Leclerc pair below. Adding a
 *  team later means adding an option here and wiring the pair swap. */
const TEAMS: TeamOption[] = [
  { id: "ferrari", name: "Ferrari", drivers: "Hamilton vs. Leclerc" },
];

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
  const theme = themes[mode];
  const view = useView();

  const races = useApi((_k) => api.races(), 0);
  const drivers = useApi((_k) => api.drivers(), 0);

  const [selected, setSelected] = useState<number | null>(null);
  const [teamId, setTeamId] = useState(TEAMS[0].id);

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

  // Driver numbers come from the API (which resolved them per-session from
  // OpenF1) — same rule as the backend: never hardcode 44/16.
  const hamNumber =
    drivers.data?.find((d) => d.name.toLowerCase().includes("hamilton"))
      ?.driver_number ?? null;
  const lecNumber =
    drivers.data?.find((d) => d.name.toLowerCase().includes("leclerc"))
      ?.driver_number ?? null;

  const laps = useApi(api.laps, selected);
  const delta = useApi(api.delta, selected);
  const stints = useApi(api.stints, selected);
  const pit = useApi(api.pit, selected);
  const positions = useApi(api.positions, selected);
  const weather = useApi(api.weather, selected);
  const raceControl = useApi(api.raceControl, selected);

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
        style={{ ...cssVars(theme), colorScheme: mode } as CSSProperties}
      >
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
                  <h1 className="view__title">Hamilton vs. Leclerc.</h1>
                </header>

                <Hero3D
                  laps={laps.data ?? []}
                  hamNumber={hamNumber}
                  lecNumber={lecNumber}
                  raceLabel={raceLabel}
                />

                <div className="overview__selectors">
                  <TeamSelector
                    teams={TEAMS}
                    value={teamId}
                    onChange={setTeamId}
                  />
                  <RaceSelector
                    races={races.data ?? []}
                    value={selected}
                    onChange={setSelected}
                    glass
                  />
                </div>

                <div className="overview__row">
                  <Countdown />
                  <div className="overview__stats-slot">
                    <StatTiles
                      laps={laps.data ?? []}
                      pit={pit.data ?? []}
                      delta={delta.data ?? []}
                      hamNumber={hamNumber}
                      lecNumber={lecNumber}
                      loading={laps.loading || pit.loading || delta.loading}
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
                      hamNumber={hamNumber}
                      lecNumber={lecNumber}
                      loading={laps.loading}
                      error={laps.error}
                    />
                  </Reveal>
                  <Reveal wide>
                    <DeltaChart
                      delta={delta.data ?? []}
                      laps={laps.data ?? []}
                      loading={delta.loading}
                      error={delta.error}
                    />
                  </Reveal>
                  <Reveal>
                    <TireStrategy
                      stints={stints.data ?? []}
                      hamNumber={hamNumber}
                      lecNumber={lecNumber}
                      loading={stints.loading}
                      error={stints.error}
                    />
                  </Reveal>
                  <Reveal delay={0.08}>
                    <PitStopChart
                      pit={pit.data ?? []}
                      hamNumber={hamNumber}
                      lecNumber={lecNumber}
                      loading={pit.loading}
                      error={pit.error}
                    />
                  </Reveal>
                  <Reveal wide>
                    <PositionChart
                      positions={positions.data ?? []}
                      hamNumber={hamNumber}
                      lecNumber={lecNumber}
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
