import { useSyncExternalStore } from "react";
import {
  DEFAULT_TINT,
  getTheme,
  type Mode,
  type Theme,
  type Tint,
} from "../theme";

/* Mode resolution: an explicit user choice (persisted in localStorage) wins;
   until one exists, follow the OS preference live — exactly the old behavior.
   This is a module-level store read via useSyncExternalStore rather than
   context because every chart calls useTheme() directly, including Ribbons
   inside the r3f <Canvas>, where React context doesn't cross the reconciler
   boundary.

   The store also carries the active TINT (team chrome + the pair's two color
   slots, derived from the selected pair in App via theme.ts's tintForPair) —
   same reasoning: the ribbons and every chart re-render with the new pair
   colors through one subscription, no context needed. */

const STORAGE_KEY = "f1-tracker-mode";

function readStoredMode(): Mode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

let override: Mode | null = readStoredMode();
let tint: Tint = DEFAULT_TINT;

const osQuery = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

// Notifying with an override in place is harmless: useSyncExternalStore
// re-reads the snapshot, sees the same value, and skips the re-render.
osQuery.addEventListener("change", notify);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getMode(): Mode {
  return override ?? (osQuery.matches ? "dark" : "light");
}

/** Explicit user choice: persist it and stop following the OS from now on. */
export function setMode(next: Mode): void {
  override = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage being unavailable only loses persistence, not the toggle.
  }
  notify();
}

/** App pushes the tint derived from the selected pair (tintForPair). The
 *  pair itself is persisted by App (f1-tracker-pair) — nothing to store
 *  here. getTheme memoizes per (mode, tint), so an unchanged tint resolves
 *  to the same snapshot object and re-renders skip. */
export function setTint(next: Tint): void {
  tint = next;
  notify();
}

export function useMode(): Mode {
  return useSyncExternalStore(subscribe, getMode);
}

/** The active tint itself, for the one surface that themes AGAINST the mode:
 *  the countdown card stays dark in light mode (the reference design's "dark
 *  inset emphasis card"), so it needs the tint to build the dark theme's
 *  vars locally. `tint` is replaced wholesale by setTint, so the snapshot
 *  reference is stable between updates. */
export function useTint(): Tint {
  return useSyncExternalStore(subscribe, () => tint);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => getTheme(getMode(), tint));
}
