import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface Props {
  /** Stagger offset in seconds — cards later in a grid row enter a beat apart. */
  delay?: number;
  /** The wrapper is the grid item now, so it carries the full-row span. */
  wide?: boolean;
  children: ReactNode;
}

/** Scroll-reveal wrapper for grid cards: fade + slight rise, played once when
 *  the card scrolls into view. Opacity/transform only; reduced motion is
 *  handled by the app-level MotionConfig. */
export function Reveal({ delay = 0, wide = false, children }: Props) {
  return (
    <motion.div
      className={`reveal${wide ? " reveal--wide" : ""}`}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
