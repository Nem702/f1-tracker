import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { entrance } from "../motion";

interface Props {
  /** Stagger offset in seconds — cards later in a grid row enter a beat apart. */
  delay?: number;
  /** The wrapper is the grid item now, so it carries the full-row span. */
  wide?: boolean;
  children: ReactNode;
}

/** Scroll-reveal wrapper for grid cards: fade + slight rise (the shared
 *  `entrance` token), played once when the card scrolls into view. */
export function Reveal({ delay = 0, wide = false, children }: Props) {
  return (
    <motion.div
      className={`reveal${wide ? " reveal--wide" : ""}`}
      variants={entrance}
      custom={delay}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
    >
      {children}
    </motion.div>
  );
}
