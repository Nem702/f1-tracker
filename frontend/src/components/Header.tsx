import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { setMode } from "../hooks/useTheme";
import type { Mode } from "../theme";

interface Props {
  mode: Mode;
  /** True once the user has scrolled past the hero — switches the bar from
   *  transparent-over-hero to blurred surface with a hairline border. */
  solid: boolean;
}

const links = [
  { href: "#about", label: "About" },
  { href: "#race-info", label: "Race Info" },
  { href: "#contact", label: "Contact" },
];

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
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
      width="18"
      height="18"
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

export function Header({ mode, solid }: Props) {
  const [open, setOpen] = useState(false);
  const nextMode: Mode = mode === "dark" ? "light" : "dark";

  return (
    <header className={`header${solid ? " header--solid" : ""}`}>
      <a className="header__wordmark" href="#top">
        F1 TRACKER
      </a>

      <nav className="header__nav" aria-label="Primary">
        {links.map((link) => (
          <a key={link.href} className="header__link" href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>

      <div className="header__actions">
        <button
          type="button"
          className="header__icon-btn"
          aria-label={`Switch to ${nextMode} mode`}
          onClick={() => setMode(nextMode)}
        >
          {mode === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          className="header__icon-btn header__menu-btn"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="primary-mobile-nav"
          onClick={() => setOpen(!open)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? (
              <path d="M5 5l14 14M19 5L5 19" />
            ) : (
              <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
            )}
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="primary-mobile-nav"
            className="header__panel"
            aria-label="Primary"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {links.map((link) => (
              <a
                key={link.href}
                className="header__link"
                href={link.href}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
