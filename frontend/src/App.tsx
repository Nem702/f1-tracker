import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { MotionConfig, motion } from "framer-motion";
import { api } from "./api/client";
import { useApi } from "./hooks/useApi";
import { useScrollSpy } from "./hooks/useScrollSpy";
import { setTint, useMode, useTheme } from "./hooks/useTheme";
import { cssVars, tintForPair } from "./theme";
import { buildRosters, findDriver, pairTeamSlug, type DriverPair } from "./teams";
import { deriveDelta } from "./lib/delta";
import { fmtDate } from "./format";
import { Navbar } from "./components/Navbar";
import { SECTIONS, normalizeHash } from "./viewState";
import { AuroraBackground } from "./components/AuroraBackground";
import { Hero } from "./components/Hero";
import { NextRace } from "./components/NextRace";
import { LastRace } from "./components/LastRace";
import { LastRaceResults } from "./components/LastRaceResults";
import { Standings } from "./components/Standings";
import { Telemetry } from "./components/Telemetry";
import { About } from "./components/About";
import { entrance } from "./motion";

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

export default function App() {
  const mode = useMode();
  const active = useScrollSpy(SECTIONS, normalizeHash(window.location.hash));

  // On first load with a mid-page hash (a shared link, a reload after
  // scrolling), jump straight there with no animation instead of always
  // opening at the hero — same as a plain anchor link would. This can't
  // just scroll on the next frame: every section fetches its own data
  // independently (races, standings, official results, telemetry, …), each
  // resolving at its own pace, and Hero3D plus every telemetry chart are
  // lazy-loaded on top of that — so the page's height grows in several
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

  const [selected, setSelected] = useState<number | null>(null);

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
  const officialResult = useApi(api.officialResult, selected);

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
            <Hero laps={laps.data ?? []} pair={pair} rosters={rosters} onSelectPair={setPair} />
          </section>

          <section id="next-race" className="page-section">
            <NextRace
              data={raceWeekend.data?.race_weekend ?? null}
              loading={raceWeekend.loading}
              error={raceWeekend.error}
            />
          </section>

          <section id="last-race" className="page-section">
            <LastRace
              recap={raceWeekend.data?.race_weekend?.previous_race ?? null}
              loading={raceWeekend.loading}
            />
          </section>

          <section id="last-race-results" className="page-section">
            <LastRaceResults
              data={officialResult.data?.official_result ?? null}
              loading={officialResult.loading}
              error={officialResult.error}
              raceLabel={raceLabel}
            />
          </section>

          <section id="season-standings" className="page-section">
            <Standings />
          </section>

          <section id="telemetry" className="page-section">
            <Telemetry
              races={races.data ?? []}
              selected={selected}
              onSelectRace={setSelected}
              race={race}
              raceLabel={raceLabel}
              racesError={races.error}
              pair={pair}
              laps={laps}
              stints={stints}
              pit={pit}
              positions={positions}
              weather={weather}
              raceControl={raceControl}
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
              {/* TODO: replace with real URL */}
              <a href="#">LinkedIn</a>
              {/* TODO: replace with real URL */}
              <a href="#">X</a>
            </nav>
            <p className="footer__credit">
              Data from OpenF1, fetched weekly into Neon Postgres · a
              skill-building project, not a finished product.
            </p>
          </motion.footer>
        </div>
      </div>
    </MotionConfig>
  );
}
