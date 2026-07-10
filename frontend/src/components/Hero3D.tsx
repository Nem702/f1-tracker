import { Component, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { animate, useMotionValue, useSpring, type MotionValue } from "framer-motion";
import type { Group } from "three";
import type { Lap } from "../api/types";
import type { DriverPair } from "../teams";
import { useTheme } from "../hooks/useTheme";
import { EASE, homeCascade } from "../motion";

/** Ribbon draw-in duration (seconds) — the reveal is bespoke to Hero3D (a
 *  progress value tweened via framer's imperative `animate()`, not a DOM
 *  variant), so it isn't one of motion.ts's Variants; it still borrows EASE
 *  and homeCascade's ribbonA/ribbonB delays from there. */
const RIBBON_DRAW_SECONDS = 0.9;

interface Props {
  laps: Lap[];
  pair: DriverPair | null;
}

type Point = [number, number, number];

/** Map one driver's lap durations onto a 3D ribbon: x = race progress,
 *  y = pace (faster laps sit higher), z = a fixed lane per driver. */
function ribbonPoints(laps: Lap[], driverNumber: number | null, z: number): Point[] {
  const times = laps
    .filter((l) => l.driver_number === driverNumber && l.lap_duration !== null)
    .sort((a, b) => a.lap_number - b.lap_number);
  if (times.length < 2) return [];
  const durations = times.map((l) => l.lap_duration!);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const range = max - min || 1;
  return times.map((lap, i) => [
    (i / (times.length - 1) - 0.5) * 12,
    ((max - lap.lap_duration!) / range) * 2.6 - 1.3,
    z,
  ]);
}

/** Decorative stand-in for races with no lap data, so the hero never dies. */
function decorativePoints(z: number, phase: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 80; i++) {
    const x = (i / 80 - 0.5) * 12;
    pts.push([x, Math.sin(i / 7 + phase) * 0.9, z]);
  }
  return pts;
}

// Reconciled (T3): pace used to read through a color ramp (lerp the crisp
// line's own vertex colors toward white). design-system ran that through
// the validator and it failed for real, not just as a formality — light
// mode dropped below the 3:1 contrast floor at the brightened end, and
// dark mode's warm hex already sat at the OKLCH lightness ceiling for its
// band with ~zero headroom to brighten *at all* without leaving the
// validated color. So pace is encoded on the glow duplicate's opacity
// instead: the crisp line stays exactly the flat validated hex in both
// modes (no hue/lightness shift, nothing to re-validate), and "faster lap"
// reads as "more glow" rather than "brighter line."
const GLOW_SEGMENTS = 12;
const GLOW_OPACITY_MIN = 0.07;
const GLOW_OPACITY_MAX = 0.22;

/** Splits a ribbon into a handful of overlapping segments (sharing their
 *  boundary points so there's no visible seam) so the glow duplicate can
 *  carry a different opacity per segment — three.js's fat-line material
 *  only exposes opacity as a single per-line uniform, not per-vertex, so a
 *  smooth-reading ramp means multiple `<Line>`s instead of one. */
function glowSegments(points: Point[]): { points: Point[]; opacity: number }[] {
  if (points.length < 2) {
    return [{ points, opacity: (GLOW_OPACITY_MIN + GLOW_OPACITY_MAX) / 2 }];
  }
  const ys = points.map((p) => p[1]);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min || 1;
  const chunkSize = Math.max(1, Math.ceil((points.length - 1) / GLOW_SEGMENTS));
  const segments: { points: Point[]; opacity: number }[] = [];
  for (let start = 0; start < points.length - 1; start += chunkSize) {
    const end = Math.min(points.length - 1, start + chunkSize);
    const slice = points.slice(start, end + 1);
    const avgY = slice.reduce((sum, p) => sum + p[1], 0) / slice.length;
    const t = (avgY - min) / range;
    segments.push({ points: slice, opacity: GLOW_OPACITY_MIN + t * (GLOW_OPACITY_MAX - GLOW_OPACITY_MIN) });
  }
  return segments;
}

function Ribbons({
  a,
  b,
  pointerX,
  pointerY,
  progressA,
  progressB,
}: {
  a: Point[];
  b: Point[];
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  progressA: MotionValue<number>;
  progressB: MotionValue<number>;
}) {
  // three.js materials need real color values (they can't read CSS vars) —
  // useTheme() works inside the Canvas because it's a module store, and the
  // driver slots retint with the selected pair like everything else.
  const theme = useTheme();
  const group = useRef<Group>(null);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The banner panel can be much narrower than it is tall on small screens.
  // Fit the 12-unit-wide ribbon to whatever width the camera exposes at
  // z=0, never upscaling past its designed size.
  const { viewport } = useThree();
  const fit = Math.min(1, viewport.width / 13.5);

  // Draw-in reveal: progressA/progressB are tweened 0→1 once by Hero3D (see
  // below); read them here each frame and slice the ribbon's points down to
  // that fraction, so the line grows in left-to-right. Stops re-rendering
  // once both reach 1 rather than tracking them forever at 60fps.
  const [revealA, setRevealA] = useState(still ? 1 : 0);
  const [revealB, setRevealB] = useState(still ? 1 : 0);
  const revealDone = useRef(still);

  // Gentle oscillation plus a subtle pointer-driven tilt — not a full spin
  // (a wide ribbon rotated 90° would be edge-on and vanish), and not a
  // scroll parallax (the hero is a fixed-size banner now, not a page you
  // scroll past).
  useFrame((state) => {
    if (!group.current || document.hidden) return;
    const sway = still ? 0 : Math.sin(state.clock.elapsedTime * 0.25) * 0.28;
    const tiltY = still ? 0 : pointerX.get() * 0.18;
    const tiltX = still ? 0 : pointerY.get() * 0.1;
    group.current.rotation.y = sway + tiltY;
    group.current.rotation.x = -0.3 + tiltX;

    if (!revealDone.current) {
      const pa = progressA.get();
      const pb = progressB.get();
      setRevealA(pa);
      setRevealB(pb);
      if (pa >= 1 && pb >= 1) revealDone.current = true;
    }
  });

  const aVisible = useMemo(
    () => (still || a.length < 2 ? a : a.slice(0, Math.max(2, Math.ceil(a.length * revealA)))),
    [a, revealA, still],
  );
  const bVisible = useMemo(
    () => (still || b.length < 2 ? b : b.slice(0, Math.max(2, Math.ceil(b.length * revealB)))),
    [b, revealB, still],
  );

  const aGlow = useMemo(() => glowSegments(aVisible), [aVisible]);
  const bGlow = useMemo(() => glowSegments(bVisible), [bVisible]);

  return (
    <group ref={group} rotation={[-0.3, 0, 0]} scale={[fit, fit, 1]}>
      {/* Soft glow: a wider, faint duplicate beneath the crisp line, opacity
       *  ramped per segment so the fastest laps glow more (see glowSegments). */}
      {aGlow.map((seg, i) => (
        <Line
          key={`a-glow-${i}`}
          points={seg.points}
          color={theme.driver1}
          lineWidth={7}
          transparent
          opacity={seg.opacity}
        />
      ))}
      {bGlow.map((seg, i) => (
        <Line
          key={`b-glow-${i}`}
          points={seg.points}
          color={theme.driver2}
          lineWidth={7}
          transparent
          opacity={seg.opacity}
        />
      ))}
      <Line points={aVisible} color={theme.driver1} lineWidth={2.5} />
      <Line points={bVisible} color={theme.driver2} lineWidth={2.5} />
    </group>
  );
}

/** If WebGL is unavailable or three throws, the hero degrades to the plain
 *  header — the dashboard below never depends on it. */
class HeroBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function Hero3D({ laps, pair }: Props) {
  const { a, b } = useMemo(() => {
    const ra = ribbonPoints(laps, pair?.[0].number ?? null, 0.4);
    const rb = ribbonPoints(laps, pair?.[1].number ?? null, -0.4);
    if (ra.length && rb.length) return { a: ra, b: rb };
    return { a: decorativePoints(0.4, 0), b: decorativePoints(-0.4, 2.1) };
  }, [laps, pair]);

  // Pointer parallax: DOM-level motion values read inside Ribbons' useFrame,
  // so pointer movement never triggers a React re-render — only the r3f
  // frame loop touches the group's rotation.
  const rawPointerX = useMotionValue(0);
  const rawPointerY = useMotionValue(0);
  const pointerX = useSpring(rawPointerX, { stiffness: 40, damping: 20, mass: 0.6 });
  const pointerY = useSpring(rawPointerY, { stiffness: 40, damping: 20, mass: 0.6 });

  // Ribbon draw-in: two motion values tweened 0→1 once on mount (Hero3D is
  // inside Overview's per-view conditional, so it naturally remounts — and
  // replays this — every time the user navigates back to Overview). Reduced
  // motion skips straight to 1, no reveal, no animation.
  const progressA = useMotionValue(0);
  const progressB = useMotionValue(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      progressA.set(1);
      progressB.set(1);
      return;
    }
    const controlsA = animate(progressA, 1, {
      duration: RIBBON_DRAW_SECONDS,
      ease: EASE,
      delay: homeCascade.ribbonA,
    });
    const controlsB = animate(progressB, 1, {
      duration: RIBBON_DRAW_SECONDS,
      ease: EASE,
      delay: homeCascade.ribbonB,
    });
    return () => {
      controlsA.stop();
      controlsB.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    rawPointerX.set(((e.clientX - rect.left) / rect.width) * 2 - 1);
    rawPointerY.set(((e.clientY - rect.top) / rect.height) * 2 - 1);
  };
  const handlePointerLeave = () => {
    rawPointerX.set(0);
    rawPointerY.set(0);
  };

  return (
    <div className="hero" onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
      <HeroBoundary>
        <Canvas
          className="hero__canvas"
          camera={{ position: [0, 0.6, 8.5], fov: 42 }}
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true }}
        >
          <Ribbons
            a={a}
            b={b}
            pointerX={pointerX}
            pointerY={pointerY}
            progressA={progressA}
            progressB={progressB}
          />
        </Canvas>
      </HeroBoundary>
    </div>
  );
}
