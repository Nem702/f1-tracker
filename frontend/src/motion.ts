import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { Transition, Variants } from "framer-motion";

/* ---------------------------------------------------------------------------
 * Motion tokens — the single source every animation in the app draws from.
 * One signature ease, one duration scale, one stagger scale. If a component
 * needs a timing value that isn't here yet, it belongs here, not inline.
 * ------------------------------------------------------------------------- */

/** The signature ease: fast start, long calm settle ("expo out"). Every
 *  entrance, hover and nav-pill morph in the app uses this — nothing else.
 *  Declared as a plain (non-readonly) tuple: framer-motion's `Easing` type
 *  wants a mutable `[number, number, number, number]`, and `as const` would
 *  make this a `readonly` tuple that doesn't structurally match. */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Mirror of EASE for exits: quick and decisive, no lingering settle. */
export const EASE_EXIT: [number, number, number, number] = [0.7, 0, 0.84, 0];

export const duration = {
  instant: 0.12,
  fast: 0.2,
  base: 0.35,
  slow: 0.5,
  slower: 0.8,
} as const;

export const stagger = {
  tight: 0.04,
  base: 0.08,
  loose: 0.14,
} as const;

/* ---------------------------------------------------------------------------
 * Entrance: fade + rise, the one motion every card/section/heading uses to
 * arrive. "show" is a dynamic variant — the `custom` prop on the consuming
 * motion component carries the per-item delay, so callers never hand-roll a
 * transition object of their own.
 * ------------------------------------------------------------------------- */

export const entrance: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: duration.slow, ease: EASE, delay },
  }),
};

/** Stagger container: wrap a list of `entrance`-variant children in this to
 *  cascade them (nav items, stat tiles, card grids). Children use `entrance`
 *  directly (aliased below as `staggerItem`) with no `custom` of their own —
 *  `staggerChildren` supplies the offset between them instead. */
export function staggerContainer(
  amount: number = stagger.base,
  delayChildren = 0,
): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: amount, delayChildren } },
  };
}
export const staggerItem: Variants = entrance;

/* ---------------------------------------------------------------------------
 * View transition: AnimatePresence enter/exit for the sidebar's view switch
 * (Overview / Race Analysis / About). See components/ViewTransition.tsx for
 * the wrapper that applies this.
 * ------------------------------------------------------------------------- */

export const viewTransition: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.base, ease: EASE },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: duration.fast, ease: EASE_EXIT },
  },
};

/* ---------------------------------------------------------------------------
 * Active-nav pill: shared layoutId convention. The sidebar renders exactly
 * one `<motion.div layoutId={NAV_PILL_LAYOUT_ID} />` positioned behind the
 * active nav item; framer-motion animates that one element between DOM
 * positions whenever the active item changes — no per-item exit/enter logic
 * needed on the sidebar's side.
 * ------------------------------------------------------------------------- */

export const NAV_PILL_LAYOUT_ID = "sidebar-nav-active-pill";
export const navPillTransition: Transition = { duration: duration.base, ease: EASE };

/* ---------------------------------------------------------------------------
 * Digit-roll transitions — see components/DigitRoll.tsx for the primitive
 * (used by the countdown, per-digit vertical roll, tabular numerals).
 * ------------------------------------------------------------------------- */

export const digitRollEnter: Transition = { duration: duration.fast, ease: EASE };
export const digitRollExit: Transition = { duration: duration.fast, ease: EASE_EXIT };

/* ---------------------------------------------------------------------------
 * Chart draw-in guidance for Recharts (teammate "components"). Spread onto
 * <Line>/<Bar>/<Area> etc. for the first-reveal draw-in only — flip
 * `isAnimationActive` off (or key the chart so it doesn't remount) for
 * subsequent re-renders, e.g. switching races, so the draw-in doesn't replay
 * on every data change.
 *
 * Recharts' `animationEasing` only accepts named keywords ("linear" | "ease"
 * | "ease-in" | "ease-out" | "ease-in-out"), not an arbitrary cubic-bezier
 * tuple — it cannot take EASE directly. "ease-out" is the closest built-in
 * shape to our signature ease (fast start, gentle settle).
 * ------------------------------------------------------------------------- */

export const CHART_DRAW_IN = {
  isAnimationActive: true,
  animationDuration: duration.slower * 1000, // Recharts wants milliseconds
  animationEasing: "ease-out" as const,
};

/* ---------------------------------------------------------------------------
 * Count-up hook: animates a number from its last committed value to `target`
 * whenever `target` changes (mount included, so it counts up from 0 the
 * first time — that first cascade is the point of a stat tile). Instant
 * under reduced motion. Consumed by components/CountUp.tsx.
 * ------------------------------------------------------------------------- */

// Matches the shape of EASE closely enough for a plain numeric tween: fast
// start, long settle. framer-motion's cubic-bezier easing isn't reusable
// outside its own animate() calls, so this is a from-scratch curve of the
// same family rather than a literal evaluation of the EASE control points.
function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function useCountUp(
  target: number,
  opts: { duration?: number; decimals?: number } = {},
): number {
  const prefersReducedMotion = useReducedMotion();
  const { duration: seconds = duration.slower, decimals = 0 } = opts;
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1000 / seconds);
      const eased = easeOutExpo(t);
      setValue(from + (target - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, seconds, prefersReducedMotion]);

  return decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
}
