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

/** Reveal.tsx's alternate variant: a clip-path wipe instead of fade+rise —
 *  same whileInView-once mechanism, just a different entrance shape for
 *  visual variety on one or two standout cards. `clip-path` + `opacity` are
 *  both compositor-friendly (no layout thrash), which is what keeps this
 *  safe to use alongside `entrance` rather than something scroll-linked —
 *  see App.tsx's scroll-performance notes. Used sparingly (one card, not a
 *  whole grid) so it reads as a deliberate accent, not visual noise. */
export const wipeReveal: Variants = {
  hidden: { opacity: 0, clipPath: "inset(0 0 100% 0)" },
  show: (delay: number = 0) => ({
    opacity: 1,
    clipPath: "inset(0 0 0% 0)",
    transition: { duration: duration.slower, ease: EASE, delay },
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

/** Like `entrance` but slides in on x instead of y — the countdown's own
 *  right-slide. Unlike `entrance`, both
 *  `hidden` and `show` are dynamic: the travel distance (and its sign/
 *  direction) varies by caller, so it rides along on `custom` next to the
 *  delay instead of being baked into the variant. */
export const entranceX: Variants = {
  hidden: (custom: { x: number }) => ({ opacity: 0, x: custom.x }),
  show: (custom: { x: number; delay?: number }) => ({
    opacity: 1,
    x: 0,
    transition: { duration: duration.slow, ease: EASE, delay: custom.delay ?? 0 },
  }),
};

/** Factory for cascade rows whose travel distance/duration don't match
 *  `entrance`'s fixed y:16/duration.slow shape (compact navbar chrome,
 *  quicker control rows) — same fade+rise shape and `custom`-delay
 *  convention, just parameterized. Values live in motion.ts either way. */
export function riseIn(y: number, seconds: number): Variants {
  return {
    hidden: { opacity: 0, y },
    show: (delay: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: seconds, ease: EASE, delay },
    }),
  };
}

/** Navbar nav items + theme toggle: a shorter, quicker rise than content
 *  cards get. */
export const navItemEntrance: Variants = riseIn(6, 0.4);
/** Team switcher chips. */
export const chipEntrance: Variants = riseIn(16, 0.4);

/** Navbar brand mark: scale + fade rather than a rise. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: (delay: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: EASE, delay },
  }),
};

/* ---------------------------------------------------------------------------
 * Home cascade: the page's landing choreography — delay offsets (seconds
 * from mount) for every element that's visible without scrolling, i.e. the
 * navbar chrome and the #hero section. Everything further down the page
 * reveals on scroll instead (see Reveal.tsx / whileInView) rather than
 * racing a mount-time clock it'll finish before it's ever seen. Durations
 * live with the variants above; this is purely "when does each row start."
 * Every consumer imports from here rather than hardcoding a delay inline.
 * ------------------------------------------------------------------------- */

export const homeCascade = {
  brandMark: 0.05,
  nav: [0.12, 0.18, 0.24, 0.3, 0.36, 0.42, 0.48] as const,
  themeToggle: 0.54,
  auroraBlobs: [0.05, 0.1, 0.15] as const,
  ribbonA: 0.15,
  ribbonB: 0.25,
  heroText: 0.55,
  chips: 0.75,
  chipStagger: 0.05,
  countdown: 0.95,
} as const;

/* ---------------------------------------------------------------------------
 * Active-nav pill: shared layoutId convention. The navbar renders exactly
 * one `<motion.div layoutId={NAV_PILL_LAYOUT_ID} />` positioned behind the
 * active nav item; framer-motion animates that one element between DOM
 * positions whenever the active item changes — no per-item exit/enter logic
 * needed on the navbar's side.
 * ------------------------------------------------------------------------- */

export const NAV_PILL_LAYOUT_ID = "navbar-nav-active-pill";
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
  opts: { duration?: number; decimals?: number; startDelay?: number } = {},
): number {
  const prefersReducedMotion = useReducedMotion();
  const { duration: seconds = duration.slower, decimals = 0, startDelay = 0 } = opts;
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    let raf = 0;
    const start = (now: number) => {
      const startedAt = now;
      const tick = (t: number) => {
        const p = Math.min(1, (t - startedAt) / 1000 / seconds);
        const eased = easeOutExpo(p);
        setValue(from + (target - from) * eased);
        if (p < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          fromRef.current = target;
        }
      };
      raf = requestAnimationFrame(tick);
    };
    const timeout = window.setTimeout(() => {
      raf = requestAnimationFrame(start);
    }, startDelay * 1000);
    return () => {
      window.clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [target, seconds, startDelay, prefersReducedMotion]);

  return decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
}
