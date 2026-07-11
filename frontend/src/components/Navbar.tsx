import { useEffect, useRef, useState, type MouseEvent, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { setMode, useMode } from "../hooks/useTheme";
import { useIsNavCollapsed } from "../hooks/useMediaQuery";
import type { Mode } from "../theme";
import { type SectionId } from "../viewState";
import {
  NAV_PILL_LAYOUT_ID,
  navPillTransition,
  entrance,
  navItemEntrance,
  scaleIn,
  homeCascade,
  staggerContainer,
  stagger,
  drawerPanel,
  drawerBackdrop,
} from "../motion";

const navItems: { id: SectionId; label: string; icon: (props: { active: boolean }) => ReactElement }[] = [
  { id: "hero", label: "Overview", icon: OverviewIcon },
  { id: "next-race", label: "Next Race", icon: NextRaceIcon },
  { id: "last-race", label: "Last Race", icon: LastRaceIcon },
  { id: "season-standings", label: "Standings", icon: StandingsIcon },
  { id: "telemetry", label: "Telemetry", icon: TelemetryIcon },
  { id: "about", label: "About", icon: AboutIcon },
];

/** Smooth-scrolls to a section (respecting reduced-motion) and records the
 *  jump as a real history entry — unlike useScrollSpy's continuous
 *  replaceState-only sync, an explicit nav click is a deliberate
 *  navigation and should be back-button-able. */
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  history.pushState(null, "", `#${id}`);
}

function OverviewIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function NextRaceIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function LastRaceIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 21V3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

function StandingsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4.5h10v3.2a5 5 0 0 1-10 0V4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M7 5.3H4.8a2.1 2.1 0 0 0 2.2 3.6M17 5.3h2.2a2.1 2.1 0 0 1-2.2 3.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M12 11.7v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 19.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M9.6 19.5 10 16h4l.4 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TelemetryIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 20V4M4.5 20h15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M6.8 15.6 10.2 11l3 2.6 4.5-6.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AboutIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11v5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
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
      width="16"
      height="16"
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

function MenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  /** The section currently most in view (see hooks/useScrollSpy.ts) —
   *  drives which nav item wears the active pill. Not the same thing as
   *  "which section did the user last click"; scrolling updates this on
   *  its own. */
  active: SectionId;
}

/** Top navbar: wordmark, icon+label nav (active item on a `raised` pill),
 *  theme toggle. Sticky to the top of the viewport, floating glass like
 *  every other surface in the app. The page is one continuous scroll —
 *  nav items scroll-into-view instead of swapping mounted content, and the
 *  active item comes from scroll position (useScrollSpy), not a router.
 *
 *  At and below the nav breakpoint (breakpoints.ts) the inline row is
 *  swapped for a hamburger + right-side drawer. Swapped, not CSS-hidden:
 *  a hidden row would still mount a second NAV_PILL_LAYOUT_ID element
 *  (framer-motion shared layout must be unique) and leave phantom tab
 *  stops. The drawer portals into .app-shell because the navbar's
 *  backdrop-filter creates a containing block that would trap
 *  position:fixed descendants inside the bar — and the theme's CSS vars
 *  live on .app-shell, so document.body won't do. */
export function Navbar({ active }: Props) {
  const mode = useMode();
  const nextMode: Mode = mode === "dark" ? "light" : "dark";
  const collapsed = useIsNavCollapsed();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerHost, setDrawerHost] = useState<Element | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDrawerHost(document.querySelector(".app-shell"));
  }, []);

  // Growing past the breakpoint while the drawer is open would strand an
  // orphaned overlay (its hamburger is gone) — close it.
  useEffect(() => {
    if (!collapsed) setMenuOpen(false);
  }, [collapsed]);

  // Dialog behavior while open: focus moves in, Tab wraps, Escape closes,
  // page scroll locks. Cleanup restores scroll and hands focus back.
  useEffect(() => {
    if (!menuOpen) return;
    // Captured at open time: if the viewport grows past the breakpoint the
    // hamburger unmounts and focusing the detached node is a no-op.
    const menuBtn = menuBtnRef.current;
    const focusables = () =>
      Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [],
      );
    focusables()[0]?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      menuBtn?.focus();
    };
  }, [menuOpen]);

  const onNavClick = (e: MouseEvent<HTMLAnchorElement>, id: SectionId) => {
    e.preventDefault();
    scrollToSection(id);
    setMenuOpen(false);
  };

  const themeToggleContent = (
    <>
      {mode === "dark" ? <SunIcon /> : <MoonIcon />}
      <span className="navbar__nav-label">{mode === "dark" ? "Light" : "Dark"}</span>
    </>
  );

  return (
    <motion.header
      className="navbar glass"
      variants={entrance}
      initial="hidden"
      animate="show"
    >
      <a
        className="navbar__brand"
        href="#hero"
        onClick={(e) => onNavClick(e, "hero")}
      >
        <motion.span
          className="navbar__brand-mark"
          aria-hidden="true"
          variants={scaleIn}
          custom={homeCascade.brandMark}
        />
        <span className="navbar__brand-word">F1 Tracker</span>
      </a>

      {!collapsed && (
        <>
          <nav className="navbar__nav" aria-label="Primary">
            {navItems.map(({ id, label, icon: Icon }, i) => {
              const isActive = active === id;
              return (
                <motion.a
                  key={id}
                  href={`#${id}`}
                  className={`navbar__nav-item${isActive ? " navbar__nav-item--active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(e) => onNavClick(e, id)}
                  variants={navItemEntrance}
                  custom={homeCascade.nav[i]}
                >
                  {isActive && (
                    <motion.div
                      layoutId={NAV_PILL_LAYOUT_ID}
                      className="navbar__nav-pill"
                      transition={navPillTransition}
                    />
                  )}
                  <span className="navbar__nav-icon">
                    <Icon active={isActive} />
                  </span>
                  <span className="navbar__nav-label">{label}</span>
                </motion.a>
              );
            })}
          </nav>

          <motion.button
            type="button"
            className="navbar__theme-toggle"
            aria-label={`Switch to ${nextMode} mode`}
            onClick={() => setMode(nextMode)}
            variants={navItemEntrance}
            custom={homeCascade.themeToggle}
          >
            {themeToggleContent}
          </motion.button>
        </>
      )}

      {collapsed && (
        <motion.button
          ref={menuBtnRef}
          type="button"
          className="navbar__menu-btn"
          aria-expanded={menuOpen}
          aria-controls="navbar-drawer"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMenuOpen((open) => !open)}
          variants={navItemEntrance}
          custom={homeCascade.themeToggle}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </motion.button>
      )}

      {drawerHost &&
        createPortal(
          <AnimatePresence>
            {collapsed && menuOpen && (
              <>
                <motion.div
                  className="navbar-drawer__backdrop"
                  variants={drawerBackdrop}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  onClick={() => setMenuOpen(false)}
                />
                <motion.div
                  ref={drawerRef}
                  id="navbar-drawer"
                  className="navbar-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Navigation"
                  variants={drawerPanel}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                >
                  <motion.nav
                    className="navbar-drawer__nav"
                    aria-label="Primary"
                    variants={staggerContainer(stagger.tight)}
                  >
                    {navItems.map(({ id, label, icon: Icon }) => {
                      const isActive = active === id;
                      return (
                        <motion.a
                          key={id}
                          href={`#${id}`}
                          className={`navbar__nav-item navbar__nav-item--drawer${isActive ? " navbar__nav-item--active" : ""}`}
                          aria-current={isActive ? "page" : undefined}
                          onClick={(e) => onNavClick(e, id)}
                          variants={navItemEntrance}
                        >
                          {/* Plain pill, no layoutId: the morph is invisible
                              inside a transient drawer, and the shared id
                              must stay unique to the desktop row. */}
                          {isActive && <div className="navbar__nav-pill" />}
                          <span className="navbar__nav-icon">
                            <Icon active={isActive} />
                          </span>
                          <span className="navbar__nav-label">{label}</span>
                        </motion.a>
                      );
                    })}
                  </motion.nav>

                  <motion.button
                    type="button"
                    className="navbar__theme-toggle navbar__theme-toggle--drawer"
                    aria-label={`Switch to ${nextMode} mode`}
                    onClick={() => setMode(nextMode)}
                    variants={navItemEntrance}
                  >
                    {themeToggleContent}
                  </motion.button>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          drawerHost,
        )}
    </motion.header>
  );
}
