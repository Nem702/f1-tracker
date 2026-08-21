import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useReducedMotion } from "framer-motion";
import type { Lap, PitStop, Race, RaceControlRow } from "../api/types";
import type { DriverPair } from "../teams";
import { useMode, useTheme } from "../hooks/useTheme";
import { circuitForRace } from "../lib/heroCircuit";
import { buildHeroRace, gapAt, positionAt, type HeroRace, type LapKind } from "../lib/heroRace";
import { trackStatusColor, type TrackStatus } from "../lib/trackStatus";

/* ---------------------------------------------------------------------------
 * The hero: a real circuit outline, one light per driver, moving at real pace.
 *
 * ONE ANIMATION LAP IS ONE RACE LAP. The separation between the two cars is
 * drawn as an arc of track between their lights, and it loops a 12-lap window
 * chosen from the data for having the most pit stops — so there is a dramatic
 * moment every loop instead of once per race. Nothing is time-compressed and
 * nothing is exaggerated: real teammate gaps move at ~0.3s per ~83s lap, so
 * between stops the arc's breathing is genuinely almost imperceptible. That is
 * what the data does. An exaggeration multiplier was offered and declined.
 *
 * WHAT THIS CLAIMS. The outline is real geometry; the start/finish line and
 * race direction are telemetry-registered; the lap counter and gap figure come
 * from real lap times. The PIT LANE POSITION IS APPROXIMATE — every circuit in
 * the pack gets the same heuristic window (420 m before the line, 300 m after)
 * and it decides only where a car leaves the racing line. It is never drawn as
 * geometry, labelled, or measured from. Mid-lap angular position is
 * interpolated, which makes no false promise only because nothing on screen
 * claims a distance: DO NOT add a "metres of track between them" readout — the
 * outline is a centreline, not a racing line.
 *
 * WHY THE ANIMATION LIVES OUTSIDE REACT. The loop writes transforms, dash
 * offsets and narration text straight to DOM nodes through refs. Driving it
 * from state would re-render the whole subtree ~60 times a second for an
 * element that is decorative. React owns the structure; rAF owns the frame.
 * ------------------------------------------------------------------------- */

/** Milliseconds of wall clock per race lap. The mockup offered 2.6 / 3.6 / 5.0
 *  seconds; only two ship as the settings panel's "Lap pace" choice — Normal
 *  (the original default) and Slow. */
const MS_PER_LAP_NORMAL = 3600;
const MS_PER_LAP_SLOW = 5000;
/** The track draws itself once before the lights appear. */
const DRAW_MS = 1300;
/** Dead time at the end of a cycle before the draw-in replays. */
const FADE_MS = 700;
/** Where in the window the composed static frame sits (reduced motion, or a
 *  paused loop). A *composed* still, never a blank one. */
const STATIC_U = 0.3;
/** Padding around the circuit bounds, in viewBox units. */
const PAD = 52;
/** Below this boundsW/boundsH ratio, the stage gets a taller height floor
 *  (Fix 1). Chosen empirically: it captures the cluster of circuits that
 *  render distinctly small at the stage's usual height (Budapest 0.884,
 *  Shanghai 1.141, Zandvoort 1.173, Losail 1.181, Barcelona 1.224, Albert
 *  Park 1.225) while leaving Monaco (1.323) — already close to full width —
 *  and everything wider untouched. */
const NARROW_ASPECT_THRESHOLD = 1.3;
/** The taller floor narrow circuits get, in px. This is NOT new headroom: it
 *  equals the clamp's own existing 440px cap, which any circuit already
 *  reaches on a tall-enough viewport (34vh >= 440px, i.e. viewport height
 *  >= ~1294px). Narrow circuits just reach it reliably at ordinary viewport
 *  heights instead of sitting at the ~260-340px the 34vh term gives them. */
const NARROW_STAGE_MIN_H = 440;
/** How far a car slides toward the pit side, in screen px. */
const PIT_OFFSET_PX = 13;
/** Fraction of the in-lap crawl over which the car eases out to the pit side. */
const PIT_EASE = 0.22;
/** The gap arc never wraps more than this much of the lap — past that it stops
 *  reading as "the space between them" and becomes a ring. */
const MAX_ARC = 0.72;
/** The gap arc's minimum drawn span, as a fraction of the lap — only applied
 *  when the real gap is nonzero (Fix 2). Budapest's LEC/HAM teammate gap is
 *  0.7s, ~0.9% of a lap (0.009 in these units), which renders as two nearly
 *  overlapping lights with no visible arc between stops. 0.009-0.012 turned
 *  out to still be visually swallowed by the lights' own ~11px halo radius —
 *  checked by eye against zoomed screenshots, not assumed. 0.02 is the
 *  smallest value that reads as a clear separate sliver rather than
 *  disappearing into the halo, while staying tiny next to MAX_ARC (0.72) so
 *  it never reads as a real quarter-lap gap. This is a RENDERING floor
 *  only — the `Gap` narration figure (gapAt()) is untouched and keeps
 *  reporting the real number. */
const MIN_ARC = 0.02;

/** Parity with RaceControlFeed: the two states both components map (green,
 *  safety car) point at the same tokens via trackStatusColor; the states the
 *  hero has that Race control doesn't need a dot for (pit, out, unknown) map
 *  to "none", which trackStatusColor resolves to no colour at all. */
const LAP_KIND_TRACK_STATUS: Record<LapKind, TrackStatus> = {
  green: "green",
  sc: "safetyCar",
  pit: "none",
  out: "none",
  unknown: "none",
};

/** The two lights' halo and mid-ring opacities, per mode. These are ORNAMENT,
 *  not encoding — nothing here carries a value the way the old WebGL hero's
 *  pace ramp did — so they are plain constants rather than theme tokens. They
 *  still differ by mode for the same reason that ramp did: on a pale ground
 *  the opacities that read as atmosphere over near-black read as a smudge, so
 *  light compresses them. Delivered as CSS custom properties because the
 *  stylesheet, not the frame loop, is the right owner of a value that never
 *  changes between frames. */
const LIGHT_LAYERS: Record<"light" | "dark", CSSProperties> = {
  dark: {
    "--hero-halo-opacity": 0.18,
    "--hero-mid-opacity": 0.4,
  } as CSSProperties,
  light: {
    "--hero-halo-opacity": 0.14,
    "--hero-mid-opacity": 0.32,
  } as CSSProperties,
};

/** Arc opacities. Unlike the halo/mid values above these can't live in CSS:
 *  the frame loop has to set arc opacity to 0 whenever a car is in the pits,
 *  so it must own the property outright rather than hand it back to a
 *  stylesheet with `style.opacity = ""`. */
const ARC_OPACITY: Record<"light" | "dark", { lead: number; chase: number }> = {
  dark: { lead: 0.85, chase: 0.55 },
  light: { lead: 0.8, chase: 0.5 },
};

interface Props {
  race: Race | null;
  laps: Lap[];
  pit: PitStop[];
  raceControl: RaceControlRow[];
  pair: DriverPair | null;
}

function GearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M17.7 17.7l-1.6-1.6M7.9 7.9L6.3 6.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Halo + mid + core, moved as one group. The PIT label is a sibling inside
 *  the same group so it inherits the light's own translate for free — its own
 *  x/y are a small fixed offset from that origin, set in viewBox units by the
 *  geometry effect (Fix 4). It starts hidden; the frame loop is authoritative
 *  for its opacity from then on, same convention as the light group itself. */
function Light({
  innerRef,
  labelRef,
}: {
  innerRef: React.RefObject<SVGGElement | null>;
  labelRef: React.RefObject<SVGTextElement | null>;
}) {
  return (
    <g ref={innerRef} className="hero-circuit__light">
      <circle className="hero-circuit__light-halo" />
      <circle className="hero-circuit__light-mid" />
      <circle className="hero-circuit__light-core" />
      <text ref={labelRef} className="hero-circuit__pit-label" aria-hidden="true">
        PIT
      </text>
    </g>
  );
}

export function HeroCircuit({ race, laps, pit, raceControl, pair }: Props) {
  const theme = useTheme();
  const mode = useMode();
  const prefersReducedMotion = useReducedMotion();

  const circuit = useMemo(() => circuitForRace(race), [race]);

  const driverA = pair?.[0] ?? null;
  const driverB = pair?.[1] ?? null;

  // Memoised on its real inputs so an unrelated parent re-render (a theme
  // tint, a hover somewhere) never rebuilds the model.
  const model = useMemo<HeroRace | null>(() => {
    if (!driverA || !driverB) return null;
    return buildHeroRace(laps, pit, raceControl, driverA.number, driverB.number);
  }, [laps, pit, raceControl, driverA, driverB]);

  const [narrationOn, setNarrationOn] = useState(true);

  // ---- settings panel state. NOT persisted anywhere (no localStorage /
  // sessionStorage) — both reset to their defaults on reload, by design. ----
  const [msPerLap, setMsPerLap] = useState(MS_PER_LAP_NORMAL);
  const [motionPaused, setMotionPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsPanelId = useId();
  const gearRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  // ---- element refs the frame loop writes to -------------------------------
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const trackRef = useRef<SVGPathElement>(null);
  const sfRef = useRef<SVGLineElement>(null);
  const arcLeadRef = useRef<SVGPathElement>(null);
  const arcChaseRef = useRef<SVGPathElement>(null);
  const lightARef = useRef<SVGGElement>(null);
  const lightBRef = useRef<SVGGElement>(null);
  const pitLabelARef = useRef<SVGTextElement>(null);
  const pitLabelBRef = useRef<SVGTextElement>(null);
  const lapRef = useRef<HTMLSpanElement>(null);
  const gapRef = useRef<HTMLSpanElement>(null);
  const whoRef = useRef<HTMLSpanElement>(null);
  const noteRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);

  /** Geometry measured from the rendered path — filled by the layout effect,
   *  read every frame. `px` converts SCREEN pixels to viewBox units, which is
   *  what keeps stroke widths and light radii constant across circuits whose
   *  aspect ratios span 0.21 to 4.68. */
  const geom = useRef({ len: 0, nx: 0, ny: 0, px: (n: number) => n });

  /** The running loop's `sync`, so the geometry effect can ask for a repaint
   *  without being a dependency of the loop (which would restart it). */
  const syncRef = useRef<(() => void) | null>(null);

  // ---- size the viewBox and measure the path ------------------------------
  const [box, setBox] = useState({ w: 0, h: 0 });
  // `circuit` is in the dependency list and MUST stay there. The stage div is
  // behind `if (!circuit) return null`, and on first render the races fetch has
  // not resolved, so `circuit` is null and `stageRef.current` is null with it.
  // With `[]` deps this effect would run exactly once, against that null ref,
  // and never again — the observer would never attach, `box` would stay 0×0,
  // the measuring effect below would bail on `box.w === 0`, and the frame loop
  // would return early forever on `len === 0`. The whole hero renders as a
  // bare unscaled path with no lights, silently and with no console error.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: Math.round(width), h: Math.round(height) });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [circuit]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const track = trackRef.current;
    if (!svg || !track || !circuit || box.w === 0 || box.h === 0) return;

    const vw = circuit.boundsW + PAD * 2;
    const vh = circuit.boundsH + PAD * 2;
    const vx = (1000 - circuit.boundsW) / 2 - PAD;
    const vy = (1000 - circuit.boundsH) / 2 - PAD;
    const scale = Math.min(box.w / vw, box.h / vh);
    const px = (n: number) => n / scale;

    svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
    svg.setAttribute("width", (vw * scale).toFixed(1));
    svg.setAttribute("height", (vh * scale).toFixed(1));

    track.setAttribute("stroke-width", String(px(3.0)));
    const len = track.getTotalLength();

    // pitNormalDeg is used VERBATIM — it already encodes the +180 for the
    // pack's outward-pointing normal, the −rotation, and the second +180 for
    // the two "outer" circuits. Re-deriving it puts pit lanes at right angles
    // to the straight on the 14 rotated circuits.
    const angle = (circuit.pitNormalDeg * Math.PI) / 180;
    geom.current = { len, nx: Math.cos(angle), ny: Math.sin(angle), px };

    // Start/finish tick: perpendicular to the path's own direction at t=0.
    // The line is real, telemetry-registered data, so it gets drawn.
    const sf = sfRef.current;
    if (sf) {
      const p0 = track.getPointAtLength(0);
      const p1 = track.getPointAtLength(5);
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const m = Math.hypot(dx, dy) || 1;
      sf.setAttribute("x1", String(p0.x + (dy / m) * px(6)));
      sf.setAttribute("y1", String(p0.y - (dx / m) * px(6)));
      sf.setAttribute("x2", String(p0.x - (dy / m) * px(6)));
      sf.setAttribute("y2", String(p0.y + (dx / m) * px(6)));
      sf.setAttribute("stroke-width", String(px(2.0)));
    }

    for (const arc of [arcLeadRef.current, arcChaseRef.current]) {
      arc?.setAttribute("stroke-width", String(px(3.4)));
    }
    for (const light of [lightARef.current, lightBRef.current]) {
      if (!light) continue;
      const [halo, mid, core, label] = Array.from(light.children) as [
        SVGCircleElement,
        SVGCircleElement,
        SVGCircleElement,
        SVGTextElement,
      ];
      halo?.setAttribute("r", String(px(11)));
      mid?.setAttribute("r", String(px(5.8)));
      core?.setAttribute("r", String(px(3.0)));
      // Fix 4: PIT label, offset up-and-right from the light's own origin —
      // px() keeps it a constant ~8.5 SCREEN px regardless of circuit scale,
      // same reasoning as the radii just above.
      label?.setAttribute("x", String(px(13)));
      label?.setAttribute("y", String(px(-10)));
      label?.setAttribute("font-size", String(px(8.5)));
    }

    // Repaint now that the geometry exists. Load-bearing for the REDUCED
    // MOTION path: there is no rAF loop there, so the only frame ever drawn is
    // the one sync() composes — and on a cold load sync() runs before the
    // ResizeObserver has reported, when the path length is still 0 and frame()
    // bails. Without this call the static frame is never composed at all.
    // When the loop IS running this is a no-op: sync() leaves a live rAF
    // alone, so it cannot restart the draw-in.
    syncRef.current?.();
  }, [circuit, box]);

  // ---- the frame loop ------------------------------------------------------
  // The draw-in's restart key is [session_key, pair, circuit] and NOT the
  // model object. `raceControl` arrives on a separate, later fetch than `laps`
  // and `pit`; when it resolves it changes only `kind` labels — no geometry,
  // no lap times, no gap — so the animation must carry on and pick the new
  // labels up on the next frame. Keying on the model's identity instead would
  // replay the whole draw-in on every cold load, one beat after first paint.
  const restartKey = `${race?.session_key ?? "none"}|${driverA?.number ?? "-"}|${driverB?.number ?? "-"}|${circuit?.id ?? "none"}`;

  const colorA = theme.driver1;
  const colorB = theme.driver2;

  // EVERYTHING THE LOOP READS BUT MUST NOT RESTART FOR GOES THROUGH THIS REF.
  // Putting `model` (or the colours, or the narration toggle) in the effect's
  // dependency list tears the effect down and sets it up again, which nulls
  // `start` and replays the draw-in from zero. That is not hypothetical: it
  // was measured — with `model` as a dependency, a cold load whose
  // race-control fetch resolved 6.2s after navigation drew the hero in a
  // second time, because the new `kind` labels produced a new model object.
  // The restart key above is the ONLY thing allowed to replay the draw-in.
  const arcOpacity = ARC_OPACITY[mode];
  const live = useRef({ model, colorA, colorB, narrationOn, driverA, driverB, arcOpacity, theme });
  live.current = { model, colorA, colorB, narrationOn, driverA, driverB, arcOpacity, theme };

  useEffect(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!stage || !track || !circuit) return;

    // The OS preference still wins: if it says reduce motion, this is true
    // regardless of motionPaused, and the settings panel disables its own
    // toggle rather than pretending it can override an a11y preference.
    const staticFromSettings = prefersReducedMotion === true || motionPaused;

    let raf: number | null = null;
    let start: number | null = null;
    let visible = true;


    /** Draw an arbitrary sub-arc of the closed path: make the dash period the
     *  whole path length, so one dash of `span` starting at `from` wraps the
     *  start/finish line for free. */
    const seg = (path: SVGPathElement, from: number, span: number) => {
      const { len } = geom.current;
      const s = Math.max(0.0001, Math.min(span, len * 0.98));
      path.style.strokeDasharray = `${s} ${len - s}`;
      path.style.strokeDashoffset = String(s - ((from + s) % len));
    };

    const place = (light: SVGGElement, at: ReturnType<typeof positionAt>) => {
      const { len, nx, ny, px } = geom.current;
      const point = track.getPointAtLength((((at.frac * len) % len) + len) % len);
      let { x, y } = point;
      let dim = 1;
      if (at.pit >= 0) {
        // In-lap: ease out to the pit lane and hold, dimming as it goes.
        const k = Math.min(1, at.pit / PIT_EASE);
        x += nx * px(PIT_OFFSET_PX) * k;
        y += ny * px(PIT_OFFSET_PX) * k;
        dim = 1 - 0.5 * k;
      } else if (at.pit === -2) {
        // Out-lap: still in the lane, easing back onto the racing line.
        x += nx * px(PIT_OFFSET_PX);
        y += ny * px(PIT_OFFSET_PX);
        dim = 0.55;
      }
      light.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      return dim;
    };

    const frame = (ms: number, forceStatic: boolean) => {
      const { model, colorA, colorB, narrationOn, driverA, driverB, arcOpacity, theme } = live.current;
      const isStatic = forceStatic || staticFromSettings;
      const { len } = geom.current;
      // The path has not been measured yet (the ResizeObserver has not
      // reported, or the circuit just changed). Rebase the clock instead of
      // burning the draw-in against an unmeasured path: tick() re-seeds
      // `start` on the next frame, so the animation begins the moment the
      // geometry exists rather than partway through.
      if (len === 0) {
        start = null;
        return;
      }

      // One animation lap is one race lap; the window length is a pure
      // function of laps + pit, so this is stable across a late raceControl.
      const windowLaps = model ? model.windowEnd - model.windowStart + 1 : 0;
      const duration = windowLaps * msPerLap;
      const cycle = DRAW_MS + duration + FADE_MS;

      let drawn = 1;
      let u = STATIC_U;
      if (!isStatic) {
        const t = ms % cycle;
        drawn = Math.min(1, t / DRAW_MS);
        u = Math.max(0, Math.min(1, (t - DRAW_MS) / duration));
      }
      const eased = 1 - Math.pow(1 - drawn, 3);
      track.style.strokeDasharray = `${len} ${len}`;
      track.style.strokeDashoffset = String(len * (1 - eased));

      const on = drawn >= 1 || isStatic;
      if (sfRef.current) sfRef.current.style.opacity = on ? "1" : "0";

      const arcLead = arcLeadRef.current;
      const arcChase = arcChaseRef.current;
      const lightA = lightARef.current;
      const lightB = lightBRef.current;

      // No model (a cancelled race, an early DNF, a driver the session
      // doesn't hold): the outline and its start/finish tick are still real,
      // so compose that much and stop. No lights, no arcs, no figures.
      if (!model || !lightA || !lightB || !arcLead || !arcChase) {
        for (const node of [arcLead, arcChase, lightA, lightB]) {
          if (node) node.style.opacity = "0";
        }
        return;
      }

      const clock = model.t0 + u * (model.t1 - model.t0);
      const A = positionAt(model.a, clock, circuit.pitEntryT, circuit.pitExitT);
      const B = positionAt(model.b, clock, circuit.pitEntryT, circuit.pitExitT);

      lightA.style.opacity = String((on ? 1 : 0) * place(lightA, A));
      lightB.style.opacity = String((on ? 1 : 0) * place(lightB, B));

      // Fix 4: the PIT label reuses the SAME per-car classification the
      // narration text already checks (A.kind/B.kind === "pit"/"out") — no
      // second, possibly-drifting threshold derived from at.pit/dim.
      if (pitLabelARef.current) {
        pitLabelARef.current.style.opacity = A.kind === "pit" || A.kind === "out" ? "1" : "0";
      }
      if (pitLabelBRef.current) {
        pitLabelBRef.current.style.opacity = B.kind === "pit" || B.kind === "out" ? "1" : "0";
      }

      // The arc is suppressed entirely while either car is in the pits: the
      // separation is no longer "an arc of track between them" when one of
      // them has left the racing line.
      if (!on || A.pit !== -1 || B.pit !== -1) {
        arcLead.style.opacity = "0";
        arcChase.style.opacity = "0";
      } else {
        const aAhead = A.dist >= B.dist;
        const lead = aAhead ? A : B;
        const chase = aAhead ? B : A;
        // Split so the leading half carries the leader's colour and the
        // trailing half the chaser's; they swap on a lead change.
        arcLead.setAttribute("stroke", aAhead ? colorA : colorB);
        arcChase.setAttribute("stroke", aAhead ? colorB : colorA);
        arcLead.style.opacity = String(arcOpacity.lead);
        arcChase.style.opacity = String(arcOpacity.chase);
        // Only floor a genuinely nonzero gap — if the two cars are exactly
        // together (should not happen in real data, but don't assume), the
        // arc stays at 0 rather than manufacturing separation that isn't there.
        const rawGap = lead.dist - chase.dist;
        const span =
          rawGap > 0 ? Math.max(len * MIN_ARC, Math.min(rawGap * len, len * MAX_ARC)) : 0;
        const from = (((chase.frac * len) % len) + len) % len;
        seg(arcChase, from, span * 0.55);
        seg(arcLead, from + span * 0.45, span * 0.55);
      }

      if (!narrationOn) return;
      const ahead = A.dist >= B.dist ? driverA : driverB;
      const index = Math.max(A.index, B.index);
      if (lapRef.current) lapRef.current.textContent = String(Math.max(A.lap, B.lap));
      if (gapRef.current) gapRef.current.textContent = gapAt(model, index).toFixed(1);
      if (whoRef.current) whoRef.current.textContent = `${ahead?.acronym ?? ""} ahead`;
      if (noteRef.current) {
        // "unknown" is never reported as green — the note goes silent rather
        // than claiming green flag racing for a lap it cannot vouch for.
        let note = "—";
        let noteKind: LapKind = "unknown";
        if (A.kind === "pit") {
          note = `${driverA?.acronym ?? "Car"} pits.`;
          noteKind = "pit";
        } else if (B.kind === "pit") {
          note = `${driverB?.acronym ?? "Car"} pits.`;
          noteKind = "pit";
        } else if (A.kind === "out") {
          note = `${driverA?.acronym ?? "Car"} rejoins.`;
          noteKind = "out";
        } else if (B.kind === "out") {
          note = `${driverB?.acronym ?? "Car"} rejoins.`;
          noteKind = "out";
        } else if (A.kind === "sc" || B.kind === "sc") {
          note = "Safety car.";
          noteKind = "sc";
        } else if (A.kind === "green" && B.kind === "green") {
          note = "Green flag racing.";
          noteKind = "green";
        }
        noteRef.current.textContent = note;

        // Reserve the dot's box with visibility, not opacity/colour — a
        // transparent-but-present dot would still take up space correctly,
        // but colouring it "away" is the wrong tool: visibility keeps the
        // text from shifting left and right as the dot appears/disappears
        // while making unmistakably clear (incl. to a11y tooling) there is
        // nothing to announce for this state.
        if (dotRef.current) {
          const color = trackStatusColor(LAP_KIND_TRACK_STATUS[noteKind], theme);
          if (color) {
            dotRef.current.style.backgroundColor = color;
            dotRef.current.style.visibility = "visible";
          } else {
            dotRef.current.style.visibility = "hidden";
          }
        }
      }
    };

    const tick = (ts: number) => {
      if (start === null) start = ts;
      frame(ts - start, false);
      raf = requestAnimationFrame(tick);
    };

    /** Three gates, one loop, cancelAnimationFrame on every off-path: the
     *  hero must not burn a frame budget while it is off screen, in a hidden
     *  tab, or under reduced motion. */
    const sync = () => {
      const run = visible && !document.hidden && !staticFromSettings;
      if (run) {
        if (raf === null) {
          start = null;
          raf = requestAnimationFrame(tick);
        }
      } else {
        if (raf !== null) {
          cancelAnimationFrame(raf);
          raf = null;
        }
        frame(0, true);
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { rootMargin: "80px" },
    );
    observer.observe(stage);
    document.addEventListener("visibilitychange", sync);
    syncRef.current = sync;
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      if (raf !== null) cancelAnimationFrame(raf);
      syncRef.current = null;
    };
    // THIS DEPENDENCY LIST IS DELIBERATELY MINIMAL — every entry here restarts
    // the loop and therefore replays the draw-in, so only things that SHOULD
    // replay it belong: `restartKey` (race / pair / circuit), the reduced-
    // motion preference (changes which loop runs at all), and the two settings
    // panel controls added in task 07:
    //   - `motionPaused` — resuming replays the draw-in ON PURPOSE. Pressing
    //     play is expected to redraw the track, not resume mid-orbit.
    //   - `msPerLap` — changing pace replays the draw-in once, and this is why
    //     it's a dependency rather than routed through `live.current` like
    //     the values below: `msPerLap` sets `cycle`, and mutating `cycle`
    //     underneath a running `ms % cycle` would teleport both lights
    //     mid-orbit — exactly the failure the window-stability rule below
    //     exists to prevent.
    // `circuit` is carried by `restartKey`. Everything else the loop reads —
    // the model, the driver colours, the narration toggle, the flag-colour
    // theme tokens — comes from `live.current`, so a late `raceControl`, a
    // team switch's retint, or hiding the readout all take effect on the very
    // next frame without interrupting the animation. `box` is absent for the
    // same reason: the layout effect writes the new geometry into
    // `geom.current`, and a window resize must not restart the draw-in either.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartKey, circuit, prefersReducedMotion, motionPaused, msPerLap]);

  // Repaint the composed still whenever anything the frame reads changes.
  // While the rAF loop is running this is a NO-OP — sync() leaves a live loop
  // alone and never re-seeds `start`, so it cannot replay the draw-in. It
  // matters when there is no loop at all: under reduced motion, scrolled out of
  // view, or in a hidden tab, the only frame ever drawn is the one sync()
  // composes, and the model arrives on a LATER fetch than the geometry does.
  // Without this, reduced motion renders the outline with no lights and a
  // narration stuck on "—", because the last frame ran while model was null.
  useEffect(() => {
    syncRef.current?.();
  }, [model, colorA, colorB, narrationOn, arcOpacity, theme]);

  // Dismissal: Escape closes the settings popover and returns focus to the
  // gear that opened it; a press outside both the panel and the gear closes
  // it too. Same pattern as GlassSelect's popup (pointerdown, not click, so
  // it also fires when the outside press starts a drag/scroll).
  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !settingsPanelRef.current?.contains(target) &&
        !gearRef.current?.contains(target)
      ) {
        setSettingsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettingsOpen(false);
        gearRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  if (!circuit) return null;

  const label = model
    ? `${circuit.name}: ${driverA?.acronym ?? "car"} and ${driverB?.acronym ?? "car"} over laps ${model.a.rows[model.windowStart]?.lap ?? ""} to ${model.a.rows[model.windowEnd]?.lap ?? ""}`
    : `${circuit.name} circuit outline`;

  // Fix 1: only narrow-aspect circuits get the taller floor — everything else
  // renders with the stage's normal clamp, untouched.
  const stageStyle: CSSProperties = {
    ...LIGHT_LAYERS[mode],
    ...(circuit.boundsW / circuit.boundsH < NARROW_ASPECT_THRESHOLD
      ? ({ "--hero-stage-min-h": `${NARROW_STAGE_MIN_H}px` } as CSSProperties)
      : {}),
  };

  return (
    <div className="hero-circuit" style={stageStyle}>
      <div className="hero-circuit__stage" ref={stageRef}>
        <svg ref={svgRef} className="hero-circuit__svg" role="img" aria-label={label}>
          <path ref={trackRef} className="hero-circuit__track" d={circuit.path} />
          <line ref={sfRef} className="hero-circuit__sf" />
          <path ref={arcChaseRef} className="hero-circuit__arc hero-circuit__arc--chase" d={circuit.path} />
          <path ref={arcLeadRef} className="hero-circuit__arc hero-circuit__arc--lead" d={circuit.path} />
          <Light innerRef={lightARef} labelRef={pitLabelARef} />
          <Light innerRef={lightBRef} labelRef={pitLabelBRef} />
        </svg>
      </div>

      <div className="hero-circuit__readout">
        {model && (
          <div className={`hero-circuit__narration${narrationOn ? "" : " is-hidden"}`}>
            <div className="hero-circuit__field">
              <span className="hero-circuit__key">Lap</span>
              <span className="hero-circuit__value">
                <span ref={lapRef}>—</span>
              </span>
            </div>
            <div className="hero-circuit__field">
              <span className="hero-circuit__key" ref={whoRef}>
                Gap
              </span>
              <span className="hero-circuit__value">
                <span ref={gapRef}>—</span>
                <small>s</small>
              </span>
            </div>
            <div className="hero-circuit__field hero-circuit__field--note">
              <span className="hero-circuit__key">On track</span>
              <span className="hero-circuit__note-value">
                <span className="hero-circuit__dot" ref={dotRef} aria-hidden="true" />
                <span className="hero-circuit__note" ref={noteRef}>
                  —
                </span>
              </span>
            </div>
          </div>
        )}
        {model && (
          <div className="hero-circuit__controls">
            <button
              type="button"
              className="hero-circuit__toggle"
              aria-pressed={narrationOn}
              aria-label={narrationOn ? "Hide the lap readout" : "Show the lap readout"}
              onClick={() => setNarrationOn((on) => !on)}
            >
              i
            </button>
            <button
              ref={gearRef}
              type="button"
              className="hero-circuit__toggle"
              aria-expanded={settingsOpen}
              aria-controls={settingsPanelId}
              aria-label="Animation settings"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <GearIcon />
            </button>

            {settingsOpen && (
              <div
                id={settingsPanelId}
                ref={settingsPanelRef}
                className="hero-circuit__settings glass"
                aria-label="Animation settings"
              >
                <div className="hero-circuit__settings-group">
                  <span className="hero-circuit__settings-label">Lap pace</span>
                  <div
                    className="hero-circuit__settings-row"
                    role="group"
                    aria-label="Lap pace"
                  >
                    <button
                      type="button"
                      className={`btn-pill${msPerLap === MS_PER_LAP_NORMAL ? " btn-pill--accent" : ""}`}
                      aria-pressed={msPerLap === MS_PER_LAP_NORMAL}
                      onClick={() => setMsPerLap(MS_PER_LAP_NORMAL)}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      className={`btn-pill${msPerLap === MS_PER_LAP_SLOW ? " btn-pill--accent" : ""}`}
                      aria-pressed={msPerLap === MS_PER_LAP_SLOW}
                      onClick={() => setMsPerLap(MS_PER_LAP_SLOW)}
                    >
                      Slow
                    </button>
                  </div>
                </div>

                <div className="hero-circuit__settings-group">
                  <span className="hero-circuit__settings-label">Motion</span>
                  <div className="hero-circuit__settings-row">
                    <button
                      type="button"
                      className={`btn-pill${!motionPaused ? " btn-pill--accent" : ""}`}
                      aria-pressed={!motionPaused}
                      aria-disabled={prefersReducedMotion === true || undefined}
                      onClick={() => {
                        // The OS preference cannot be overridden from here —
                        // a page that could would be a bug, not a feature.
                        if (prefersReducedMotion === true) return;
                        setMotionPaused((paused) => !paused);
                      }}
                    >
                      {motionPaused ? "Paused" : "Playing"}
                    </button>
                  </div>
                  {prefersReducedMotion === true && (
                    <p className="hero-circuit__settings-note">
                      Reduced motion is on in your system settings, so the
                      animation stays paused.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
