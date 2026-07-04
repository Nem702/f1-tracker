import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { viewTransition } from "../motion";

interface Props {
  /** Change this to switch views (e.g. "overview", "race-analysis", "about")
   *  — it's the AnimatePresence key, so a change is what triggers the
   *  exit/enter pair. */
  viewKey: string;
  children: ReactNode;
}

/** Wraps the sidebar's active view so switching views cross-fades+rises
 *  instead of hard-cutting. One instance should sit at the single point in
 *  the tree where views are swapped — nest content inside it, don't nest
 *  another AnimatePresence inside that. */
export function ViewTransition({ viewKey, children }: Props) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        variants={viewTransition}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
