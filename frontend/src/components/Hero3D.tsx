import { Component, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { motion } from "framer-motion";
import type { Group } from "three";
import type { Lap } from "../api/types";
import { useTheme } from "../hooks/useTheme";

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

function Ribbons({ ham, lec }: { ham: Point[]; lec: Point[] }) {
  const theme = useTheme();
  const group = useRef<Group>(null);
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The full-viewport hero can be much narrower than it is tall (phones).
  // Fit the 12-unit-wide ribbon to whatever width the camera exposes at z=0,
  // never upscaling past its designed size.
  const { viewport } = useThree();
  const fit = Math.min(1, viewport.width / 13.5);

  // Gentle oscillation, not a full spin — a wide ribbon rotated 90° would be
  // edge-on and vanish.
  useFrame((state) => {
    if (still || !group.current) return;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.25) * 0.28;
  });

  return (
    <group ref={group} rotation={[-0.3, 0, 0]} scale={[fit, fit, 1]}>
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

  return (
    <div className="hero">
      <HeroBoundary>
        <Canvas
          className="hero__canvas"
          camera={{ position: [0, 0.6, 8.5], fov: 42 }}
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true }}
        >
          <Ribbons ham={ham} lec={lec} />
        </Canvas>
      </HeroBoundary>

      <div className="hero__overlay">
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          Hamilton vs. Leclerc,
          <br />
          lap by lap.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
        >
          Real timing data from every 2026 race weekend — pulled from OpenF1,
          stored in Postgres, charted here.
        </motion.p>
      </div>

      <p className="hero__caption">
        {raceLabel}
        {isRealData ? " — each ribbon is a driver's lap times" : ""}
      </p>

      <motion.a
        className="hero__cue"
        href="#about"
        aria-label="Scroll to the About section"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 1.1 }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 9l8 8 8-8" />
        </svg>
      </motion.a>
    </div>
  );
}
