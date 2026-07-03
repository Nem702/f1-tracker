import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MotionConfig, motion } from "framer-motion";
import { api } from "./api/client";
import { useApi } from "./hooks/useApi";
import { useMode } from "./hooks/useTheme";
import { cssVars, themes } from "./theme";
import { fmtDate } from "./format";
import { Header } from "./components/Header";
import { Hero3D } from "./components/Hero3D";
import { About } from "./components/About";
import { Reveal } from "./components/Reveal";
import { RaceSelector } from "./components/RaceSelector";
import { LapTimeChart } from "./components/LapTimeChart";
import { DeltaChart } from "./components/DeltaChart";
import { TireStrategy } from "./components/TireStrategy";
import { PitStopChart } from "./components/PitStopChart";
import { PositionChart } from "./components/PositionChart";
import { WeatherChart } from "./components/WeatherChart";
import { RaceControlFeed } from "./components/RaceControlFeed";

export default function App() {
  const mode = useMode();
  const theme = themes[mode];

  const races = useApi((_k) => api.races(), 0);
  const drivers = useApi((_k) => api.drivers(), 0);

  const [selected, setSelected] = useState<number | null>(null);

  // Default to the most recent race once the list arrives.
  useEffect(() => {
    if (selected === null && races.data && races.data.length > 0) {
      setSelected(races.data[0].session_key);
    }
  }, [races.data, selected]);

  // The header is transparent over the hero and gains a blurred surface once
  // the hero scrolls out — observed, not recomputed per scroll frame.
  const heroRef = useRef<HTMLDivElement>(null);
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(!entry.isIntersecting),
      // Anchor links land with the hero's last 72px still on screen
      // (scroll-margin-top), so the bar must switch before that point.
      { rootMargin: "-96px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
        className="app"
        style={{ ...cssVars(theme), colorScheme: mode } as CSSProperties}
      >
        <Header mode={mode} solid={pastHero} />

        <div ref={heroRef}>
          <Hero3D
            laps={laps.data ?? []}
            hamNumber={hamNumber}
            lecNumber={lecNumber}
            raceLabel={raceLabel}
          />
        </div>

        <About />

        <section id="race-info" className="race-info">
          <motion.div
            className="race-info__intro"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <p className="section__eyebrow">Race Info</p>
            <h2 className="section__title">Pick a race. See how it unfolded.</h2>
          </motion.div>

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
                OpenF1 published no telemetry for this race — every panel below
                is empty by design, not by error.
              </span>
            )}
            {races.error && <span className="filters__note">{races.error}</span>}
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

        <footer id="contact" className="footer">
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
    </MotionConfig>
  );
}
