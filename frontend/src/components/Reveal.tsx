import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { entrance, wipeReveal } from "../motion";

interface Props {
  /** Stagger offset in seconds — cards later in a grid row enter a beat apart. */
  delay?: number;
  /** The wrapper is the grid item now, so it carries the full-row span. */
  wide?: boolean;
  /** "fade" (default) is the shared fade+rise every card uses; "wipe" is a
   *  clip-path reveal reserved for the odd standout card — see motion.ts's
   *  wipeReveal doc comment for why it stays rare. */
  variant?: "fade" | "wipe";
  children: ReactNode;
}

/** Scroll-reveal wrapper for grid cards: fade + slight rise (the shared
 *  `entrance` token) by default, played once when the card scrolls into
 *  view. */
export function Reveal({ delay = 0, wide = false, variant = "fade", children }: Props) {
  return (
    <motion.div
      className={`reveal${wide ? " reveal--wide" : ""}`}
      variants={variant === "wipe" ? wipeReveal : entrance}
      custom={delay}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
    >
      {children}
    </motion.div>
  );
}
