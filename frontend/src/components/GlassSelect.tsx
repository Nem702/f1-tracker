import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { duration, EASE, EASE_EXIT } from "../motion";

export interface GlassSelectOption {
  value: number;
  label: string;
  disabled?: boolean;
}

export interface GlassSelectGroup {
  /** Optional group heading (e.g. a team name); omit for a flat list. */
  label?: string;
  options: GlassSelectOption[];
}

interface Props {
  /** The pill's uppercase micro-label (icon + text or plain text). */
  label: ReactNode;
  /** Accessible name for the trigger and listbox. */
  ariaLabel: string;
  groups: GlassSelectGroup[];
  value: number | null;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 12.5l5 5 10-11"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Custom dropdown that replaced the app's native <select>s: the OS popup
 * can't be themed (dark mode rendered near-white ink on a white menu) and
 * never matched the glass look. Trigger is a glass pill; the popup is a
 * frosted panel of grouped options.
 *
 * A11y follows the WAI-ARIA listbox pattern: the trigger reports
 * aria-haspopup/aria-expanded; on open, focus moves to the listbox and
 * aria-activedescendant tracks the active option. Arrow keys move (skipping
 * disabled options, no wrap — native behavior), Home/End jump, Enter/Space
 * select, Esc closes back to the trigger, Tab and outside-clicks close.
 */
export function GlassSelect({
  label,
  ariaLabel,
  groups,
  value,
  placeholder = "Select…",
  disabled = false,
  onChange,
}: Props) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // Keyboard state indexes this flat view of the grouped options.
  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const [activeIdx, setActiveIdx] = useState(-1);

  const selected = flat.find((o) => o.value === value) ?? null;
  const optionId = (opt: GlassSelectOption) => `${id}-opt-${opt.value}`;

  const openList = () => {
    const startAt = flat.findIndex((o) => o.value === value && !o.disabled);
    setActiveIdx(startAt >= 0 ? startAt : flat.findIndex((o) => !o.disabled));
    setOpen(true);
  };

  const close = (refocusTrigger: boolean) => {
    setOpen(false);
    if (refocusTrigger) triggerRef.current?.focus();
  };

  const pick = (opt: GlassSelectOption) => {
    if (opt.disabled) return;
    onChange(opt.value);
    close(true);
  };

  // The popup steals focus while open, so outside interactions need an
  // explicit listener; pointerdown (not click) so it also fires when the
  // outside press starts a drag/scroll.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Keep the active option visible while arrowing through a scrolled list.
  useEffect(() => {
    if (!open || activeIdx < 0) return;
    const opt = flat[activeIdx];
    if (opt) {
      document
        .getElementById(`${id}-opt-${opt.value}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIdx, flat, id]);

  const move = (from: number, dir: 1 | -1): number => {
    let i = from + dir;
    while (i >= 0 && i < flat.length && flat[i].disabled) i += dir;
    return i >= 0 && i < flat.length ? i : from;
  };
  const edge = (dir: 1 | -1): number => {
    const start = dir === 1 ? 0 : flat.length - 1;
    return flat[start]?.disabled ? move(start, dir) : start;
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    // Enter/Space already toggle via the button's native click; the arrows
    // are the extra affordance the pattern asks for.
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openList();
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => move(i, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActiveIdx(edge(e.key === "Home" ? 1 : -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (flat[activeIdx]) pick(flat[activeIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close(false); // let focus move on naturally
    }
  };

  return (
    <div
      ref={rootRef}
      className={`glass-select glass${open ? " glass-select--open" : ""}`}
    >
      <span className="glass-select__label">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="glass-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        {selected?.label ?? placeholder}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="glass-select__popup glass"
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { duration: duration.fast, ease: EASE },
            }}
            exit={{
              opacity: 0,
              scale: 0.98,
              y: -4,
              transition: { duration: duration.instant, ease: EASE_EXIT },
            }}
            // A press on an option must not blur the listbox (blur-then-click
            // would close the popup before the option's click handler fires).
            // A press on the popup element itself is the scrollbar — that one
            // must keep its default so dragging it still works.
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget) e.preventDefault();
            }}
          >
            <div
              ref={listRef}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel}
              aria-activedescendant={
                flat[activeIdx] ? optionId(flat[activeIdx]) : undefined
              }
              className="glass-select__listbox"
              onKeyDown={onListKeyDown}
            >
              {groups.map((group, gi) => (
                <div key={group.label ?? gi} role="group" aria-label={group.label}>
                  {group.label && (
                    <div className="glass-select__group" aria-hidden="true">
                      {group.label}
                    </div>
                  )}
                  {group.options.map((opt) => {
                    const idx = flat.indexOf(opt);
                    const isSelected = opt.value === value;
                    const mods = [
                      idx === activeIdx ? " glass-select__option--active" : "",
                      isSelected ? " glass-select__option--selected" : "",
                      opt.disabled ? " glass-select__option--disabled" : "",
                    ].join("");
                    return (
                      <div
                        key={opt.value}
                        id={optionId(opt)}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={opt.disabled || undefined}
                        className={`glass-select__option${mods}`}
                        onClick={() => pick(opt)}
                        // Hover and keyboard share one highlight state.
                        onPointerMove={() => {
                          if (!opt.disabled && idx !== activeIdx) setActiveIdx(idx);
                        }}
                      >
                        <span className="glass-select__check" aria-hidden="true">
                          {isSelected && <CheckIcon />}
                        </span>
                        <span className="glass-select__option-label">{opt.label}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
