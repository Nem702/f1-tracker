import type { ReactElement } from "react";
import { motion } from "framer-motion";
import { setMode, useMode } from "../hooks/useTheme";
import type { Mode } from "../theme";
import { type View } from "../viewState";
import { NAV_PILL_LAYOUT_ID, navPillTransition } from "../motion";

const navItems: { id: View; label: string; icon: (props: { active: boolean }) => ReactElement }[] = [
  { id: "overview", label: "Overview", icon: OverviewIcon },
  { id: "race-analysis", label: "Race Analysis", icon: RaceIcon },
  { id: "about", label: "About", icon: AboutIcon },
];

function OverviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function RaceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 21V4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M5 4.5h9.5l-1.6 3 1.6 3H5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AboutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.2 14.5A8.3 8.3 0 0 1 9.5 3.8a8.3 8.3 0 1 0 10.7 10.7Z" />
    </svg>
  );
}

interface Props {
  view: View;
}

/** Admin-shell sidebar: wordmark, icon+label nav (active item on a `raised`
 *  pill), theme toggle pinned to the bottom. Nav is plain anchor links —
 *  App.tsx listens for `hashchange` and derives `view` from `location.hash`,
 *  so this needs no router and no click handlers of its own. The active-pill
 *  background is a flat CSS class for now; motion's layoutId morph (T3/T4)
 *  drops in without changing this markup. */
export function Sidebar({ view }: Props) {
  const mode = useMode();
  const nextMode: Mode = mode === "dark" ? "light" : "dark";

  return (
    <aside className="sidebar">
      <a className="sidebar__brand" href="#overview">
        <span className="sidebar__brand-mark" aria-hidden="true" />
        <span className="sidebar__brand-word">F1 Tracker</span>
      </a>

      <nav className="sidebar__nav" aria-label="Primary">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <a
              key={id}
              href={`#${id}`}
              className={`sidebar__nav-item${active ? " sidebar__nav-item--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.div
                  layoutId={NAV_PILL_LAYOUT_ID}
                  className="sidebar__nav-pill"
                  transition={navPillTransition}
                />
              )}
              <span className="sidebar__nav-icon">
                <Icon active={active} />
              </span>
              <span className="sidebar__nav-label">{label}</span>
            </a>
          );
        })}
      </nav>

      <button
        type="button"
        className="sidebar__theme-toggle"
        aria-label={`Switch to ${nextMode} mode`}
        onClick={() => setMode(nextMode)}
      >
        {mode === "dark" ? <SunIcon /> : <MoonIcon />}
        <span className="sidebar__nav-label">
          {mode === "dark" ? "Light mode" : "Dark mode"}
        </span>
      </button>
    </aside>
  );
}
