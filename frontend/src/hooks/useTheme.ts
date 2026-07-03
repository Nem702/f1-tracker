import { useSyncExternalStore } from "react";
import { themes, type Mode, type Theme } from "../theme";

/* Mode resolution: an explicit user choice (persisted in localStorage) wins;
   until one exists, follow the OS preference live — exactly the old behavior.
   This is a module-level store read via useSyncExternalStore rather than
   context because every chart calls useTheme() directly, including Ribbons
   inside the r3f <Canvas>, where React context doesn't cross the reconciler
   boundary. */

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

function getSnapshot(): Mode {
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

export function useMode(): Mode {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useTheme(): Theme {
  return themes[useMode()];
}
