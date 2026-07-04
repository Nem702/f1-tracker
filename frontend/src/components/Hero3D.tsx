import { Component, useMemo, useRef, type PointerEvent, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { motion, useMotionValue, useSpring, type MotionValue } from "framer-motion";
import type { Group } from "three";
import type { Lap } from "../api/types";
import { useTheme } from "../hooks/useTheme";
import { entrance, staggerContainer, stagger } from "../motion";

interface Props {
  laps: Lap[];
  hamNumber: number | null;
  lecNumber: number | null;
  raceLabel: string;
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
// dark mode's leclerc hex already sits at the OKLCH lightness ceiling for
// its band with ~zero headroom to brighten *at all* without leaving the
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
  ham,
  lec,
  pointerX,
  pointerY,
}: {
  ham: Point[];
  lec: Point[];
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
}) {
  const theme = useTheme();
  const group = useRef<Group>(null);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The banner panel can be much narrower than it is tall on small screens.
  // Fit the 12-unit-wide ribbon to whatever width the camera exposes at
  // z=0, never upscaling past its designed size.
  const { viewport } = useThree();
  const fit = Math.min(1, viewport.width / 13.5);

  // Gentle oscillation plus a subtle pointer-driven tilt — not a full spin
  // (a wide ribbon rotated 90° would be edge-on and vanish), and not a
  // scroll parallax (the hero is a fixed-size banner now, not a page you
  // scroll past).
  useFrame((state) => {
    if (!group.current) return;
    const sway = still ? 0 : Math.sin(state.clock.elapsedTime * 0.25) * 0.28;
    const tiltY = still ? 0 : pointerX.get() * 0.18;
    const tiltX = still ? 0 : pointerY.get() * 0.1;
    group.current.rotation.y = sway + tiltY;
    group.current.rotation.x = -0.3 + tiltX;
  });

  const hamGlow = useMemo(() => glowSegments(ham), [ham]);
  const lecGlow = useMemo(() => glowSegments(lec), [lec]);

  return (
    <group ref={group} rotation={[-0.3, 0, 0]} scale={[fit, fit, 1]}>
      {/* Soft glow: a wider, faint duplicate beneath the crisp line, opacity
       *  ramped per segment so the fastest laps glow more (see glowSegments). */}
      {hamGlow.map((seg, i) => (
        <Line
          key={`ham-glow-${i}`}
          points={seg.points}
          color={theme.hamilton}
          lineWidth={7}
          transparent
          opacity={seg.opacity}
        />
      ))}
      {lecGlow.map((seg, i) => (
        <Line
          key={`lec-glow-${i}`}
          points={seg.points}
          color={theme.leclerc}
          lineWidth={7}
          transparent
          opacity={seg.opacity}
        />
      ))}
      <Line points={ham} color={theme.hamilton} lineWidth={2.5} />
      <Line points={lec} color={theme.leclerc} lineWidth={2.5} />
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

export function Hero3D({ laps, hamNumber, lecNumber, raceLabel }: Props) {
  const { ham, lec } = useMemo(() => {
    const h = ribbonPoints(laps, hamNumber, 0.4);
    const l = ribbonPoints(laps, lecNumber, -0.4);
    if (h.length && l.length) return { ham: h, lec: l };
    return { ham: decorativePoints(0.4, 0), lec: decorativePoints(-0.4, 2.1) };
  }, [laps, hamNumber, lecNumber]);

  const isRealData = laps.length > 0;

  // Pointer parallax: DOM-level motion values read inside Ribbons' useFrame,
  // so pointer movement never triggers a React re-render — only the r3f
  // frame loop touches the group's rotation.
  const rawPointerX = useMotionValue(0);
  const rawPointerY = useMotionValue(0);
  const pointerX = useSpring(rawPointerX, { stiffness: 40, damping: 20, mass: 0.6 });
  const pointerY = useSpring(rawPointerY, { stiffness: 40, damping: 20, mass: 0.6 });

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
          <Ribbons ham={ham} lec={lec} pointerX={pointerX} pointerY={pointerY} />
        </Canvas>
      </HeroBoundary>

      <motion.div
        className="hero__overlay"
        variants={staggerContainer(stagger.base, 0.1)}
        initial="hidden"
        animate="show"
      >
        <motion.h1 variants={entrance}>
          Hamilton vs. Leclerc,
          <br />
          lap by lap.
        </motion.h1>
        <motion.p variants={entrance}>
          Real timing data from every 2026 race weekend — pulled from OpenF1,
          stored in Postgres, charted here.
        </motion.p>
      </motion.div>

      <motion.p
        className="hero__caption"
        variants={entrance}
        custom={0.5}
        initial="hidden"
        animate="show"
      >
        {raceLabel}
        {isRealData ? " — each ribbon is a driver's lap times" : ""}
      </motion.p>
    </div>
  );
}
