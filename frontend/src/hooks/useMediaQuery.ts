import { useSyncExternalStore } from "react";
import { NAV_QUERY, PHONE_QUERY } from "../breakpoints";

/* Width-aware rendering (hiding Hero3D on phones, dropping table columns,
   narrowing Recharts margins) can't be done in CSS, so this is the one
   sanctioned matchMedia-for-layout hook. Same module-level store shape as
   hooks/useTheme.ts: the snapshot is read synchronously on first render
   (no wrong-breakpoint first paint), and `change` fires only when the
   query flips — never per resize pixel. Call it in leaf components so a
   breakpoint crossing re-renders only what actually changes. */

const cache = new Map<string, MediaQueryList>();

function mql(query: string): MediaQueryList {
  let m = cache.get(query);
  if (!m) {
    m = window.matchMedia(query);
    cache.set(query, m);
  }
  return m;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = mql(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => mql(query).matches,
  );
}

/** ≤640px — the phone tier (see breakpoints.ts). */
export const useIsPhone = (): boolean => useMediaQuery(PHONE_QUERY);

/** ≤840px — the navbar collapses from inline row to hamburger drawer. */
export const useIsNavCollapsed = (): boolean => useMediaQuery(NAV_QUERY);
