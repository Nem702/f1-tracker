import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useCountdown } from "../hooks/useCountdown";
import { useMode, useTint } from "../hooks/useTheme";
import { cssVars, getTheme } from "../theme";
import { entranceX } from "../motion";
import { DigitRoll } from "./DigitRoll";
import "./Countdown.css";

function CountdownUnit({ value, label }: { value: number; label: string }) {
  const clamped = Math.min(99, Math.max(0, value));
  const padded = String(clamped).padStart(2, "0");
  return (
    <div className="countdown__unit">
      <div className="countdown__digits">
        <DigitRoll value={padded[0]} />
        <DigitRoll value={padded[1]} />
      </div>
      <span className="countdown__unit-label">{label}</span>
    </div>
  );
}

function fmtLocalStart(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** #next-race's frosted-glass card: the live next-race countdown. Renders
 *  nothing when OpenF1 has no upcoming session (or the endpoint has never
 *  had anything to cache) — the card simply doesn't exist rather than
 *  showing an empty/error state. Below the fold now, so it reveals on
 *  scroll-in (whileInView) like every other section card rather than on a
 *  mount-time cascade clock it would finish before ever being seen. */
export function Countdown() {
  // `fetchEpoch` doubles as the refetch trigger: bumping it changes useApi's
  // key, which re-runs the fetch, following the app's existing
  // keyless-endpoint pattern (see App.tsx's races/drivers calls).
  const [fetchEpoch, setFetchEpoch] = useState(0);
  // Dark emphasis card: this surface wears the DARK theme's tokens in both
  // modes (in light mode it's the page's one dark anchor — the reference
  // design's "dark inset emphasis card" trick). Re-deriving from the live
  // tint keeps the team accent correct, in dark's vivid variants.
  //
  // But pinning dark wholesale also pins dark's PAGE-RELATIVE values onto a
  // light page, which is what made this card read as unthemed: its elevation
  // was a black-on-black shadow tuned for a near-black page, and its accent
  // ring resolved to dark's 30% scaled ×0.4-0.85 — 1.49:1 against the card's
  // own fill, i.e. invisible. So the override set below is split by WHAT THE
  // TOKEN DESCRIBES:
  //
  //   · the card's OWN dark surface — ink ramp, fills, accent — comes from
  //     dark. That inversion is the entire point of this card.
  //   · the card's RELATIONSHIP TO THE PAGE BENEATH IT — elevation, outer
  //     bloom, accent edge weight — comes from the ACTIVE mode, because that
  //     page is light half the time.
  //
  // Anyone adding a token here should be able to place it from that sentence.
  const tint = useTint();
  const mode = useMode();
  const active = getTheme(mode, tint);
  const darkVars = {
    ...cssVars(getTheme("dark", tint)),
    "--shadow-card": active.shadowCard, // elevation reads against the page
    "--shadow-raised": active.shadowRaised,
    "--glow-blur-pct": active.glowBlurPct, // outer bloom spills onto the page
    "--countdown-edge-pct": active.countdownEdgePct, // edge weight vs the page
  } as CSSProperties;
  const nextRace = useApi((_k) => api.nextRace(), fetchEpoch);
  const session = nextRace.data?.next_session ?? null;
  const countdown = useCountdown(session?.date_start ?? null);

  const refetchedForTarget = useRef<string | null>(null);
  useEffect(() => {
    if (!session || !countdown?.reached) return;
    if (refetchedForTarget.current === session.date_start) return;
    refetchedForTarget.current = session.date_start;
    setFetchEpoch((e) => e + 1);
  }, [session, countdown?.reached]);

  if (!session) return null;

  const gpName = session.circuit_short_name ?? session.location ?? "Next race";
  const parts = countdown ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return (
    <motion.div
      className="countdown glass"
      style={darkVars}
      variants={entranceX}
      custom={{ x: 16 }}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
    >
      <p className="countdown__eyebrow">Up next</p>
      <h3 className="countdown__title">
        {gpName}
        {session.country_name ? ` · ${session.country_name}` : ""}
      </h3>
      {session.session_name && (
        <p className="countdown__session">{session.session_name}</p>
      )}

      <div
        className="countdown__clock"
        role="timer"
        aria-live="off"
        aria-label={`Time until ${session.session_name ?? "next session"}: ${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds`}
      >
        <CountdownUnit value={parts.days} label="Days" />
        <span className="countdown__sep">:</span>
        <CountdownUnit value={parts.hours} label="Hrs" />
        <span className="countdown__sep">:</span>
        <CountdownUnit value={parts.minutes} label="Min" />
        <span className="countdown__sep">:</span>
        <CountdownUnit value={parts.seconds} label="Sec" />
      </div>

      <p className="countdown__local">{fmtLocalStart(session.date_start)} local time</p>
    </motion.div>
  );
}
