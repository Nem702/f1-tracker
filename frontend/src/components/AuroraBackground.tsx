import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { EASE, homeCascade } from "../motion";

/** Each blob's own opacity stays exactly `var(--aurora-a|b|c)` (untouched,
 *  CSS-driven, still crossfades on a mode/retint change) — this wrapper
 *  multiplies a second, framer-owned opacity 0→1 on top of it for the
 *  one-time entrance sweep, so the reveal never has to animate *to* a CSS
 *  custom property (framer can't interpolate that) or touch the retint
 *  crossfade at all. */
function blobEntrance(duration: number, delay: number): Variants {
  return {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration, ease: EASE, delay } },
  };
}

const BLOBS = [
  { key: "a", variants: blobEntrance(1.1, homeCascade.auroraBlobs[0]) },
  { key: "b", variants: blobEntrance(1.2, homeCascade.auroraBlobs[1]) },
  { key: "c", variants: blobEntrance(1.3, homeCascade.auroraBlobs[2]) },
] as const;

/** The page-wide aurora: one fixed layer mounted once in the shell, behind
 *  all content. Three oversized blurred blobs colored by the active theme's
 *  accent/driver vars, statically washed (styles in index.css; never
 *  per-card blobs). The page is a single continuous scroll now (no more
 *  view-swapping), so this mounts exactly once for the life of the tab —
 *  a plain mount-time entrance is enough, no imperative replay needed. */
export function AuroraBackground() {
  return (
    <div className="aurora" aria-hidden="true">
      {BLOBS.map(({ key, variants }) => (
        <motion.div
          key={key}
          className={`aurora__blob-wrap aurora__blob-wrap--${key}`}
          variants={variants}
          initial="hidden"
          animate="show"
        >
          <div className={`aurora__blob aurora__blob--${key}`} />
        </motion.div>
      ))}
    </div>
  );
}
