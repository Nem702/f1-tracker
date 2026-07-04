import { AnimatePresence, motion } from "framer-motion";
import { digitRollEnter, digitRollExit } from "../motion";

interface Props {
  /** A single character to roll — typically one digit (0-9). Static
   *  separators (":", " ") should be rendered as plain text beside this,
   *  not passed through it. */
  value: string | number;
  className?: string;
}

/** Per-character vertical roll: the old value slides up and out while the
 *  new one slides in from below. Built for the countdown's d/h/m/s digits.
 *
 *  Zero layout shift comes from two things working together: tabular
 *  numerals (so every digit glyph is the same width) and a fixed `1ch`
 *  frame with `overflow: hidden` — the exiting digit is popped to
 *  `position: absolute` by AnimatePresence's `popLayout` mode, so it can
 *  slide out without the frame (or anything after it) ever resizing.
 *
 *  Reconciled (T3): this component only sets the structural guarantee (no
 *  layout shift) inline — cosmetics (color/weight/font-size) are left to
 *  inherit from the caller. Confirmed working via Countdown.css's
 *  `.countdown__digits`, which sizes the digits this component renders
 *  without needing any `.digit-roll`-specific rule. */
export function DigitRoll({ value, className }: Props) {
  return (
    <span
      className={`digit-roll${className ? ` ${className}` : ""}`}
      style={{
        position: "relative",
        display: "inline-block",
        overflow: "hidden",
        width: "1ch",
        textAlign: "center",
        fontVariantNumeric: "tabular-nums",
        verticalAlign: "top",
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          style={{ display: "inline-block" }}
          initial={{ y: "0.6em", opacity: 0 }}
          animate={{ y: "0em", opacity: 1, transition: digitRollEnter }}
          exit={{ y: "-0.6em", opacity: 0, transition: digitRollExit }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
