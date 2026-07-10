import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  entranceX,
  SECTION_TITLE_SLIDE,
  staggerContainer,
  staggerItem,
} from "../motion";

interface Props {
  eyebrow: string;
  title: ReactNode;
  /** Section position (matches nav order) — drives the title's side-slide
   *  direction only: odd sections enter from the left, even from the right.
   *  Omit for a default left-slide. */
  index?: number;
  /** Short lead paragraph under the title explaining what the section shows. */
  description?: ReactNode;
  meta?: ReactNode;
  /** Live-data payload for the header's right column (podium, leaders,
   *  round progress, …) — fills what used to be dead space beside the
   *  title. Stacks below the text on narrow viewports. */
  aside?: ReactNode;
}

/** Shared eyebrow+title heading for every below-the-fold section — a short
 *  text stagger (eyebrow, then title, then lead copy) playing once on
 *  scroll-in, the same whileInView-once mechanism Reveal.tsx uses for cards.
 *  The title slides in from the side (alternating by section parity) while the
 *  eyebrow and lead fade+rise. The hero's own h1 (Hero3D.tsx) stays on the
 *  page-load cascade — it's above the fold, so "reveal on scroll" doesn't apply
 *  there. */
export function SectionHeading({ eyebrow, title, index, description, meta, aside }: Props) {
  // Even sections enter from the right, odd from the left. Undefined index
  // falls back to a left-slide (kept deterministic, never a no-op).
  const slideX =
    index !== undefined && index % 2 === 0 ? SECTION_TITLE_SLIDE : -SECTION_TITLE_SLIDE;

  return (
    <motion.header
      className="view__header"
      variants={staggerContainer(0.08)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-100px" }}
    >
      <div className="view__header-text">
        <motion.p className="view__eyebrow" variants={staggerItem}>
          {eyebrow}
        </motion.p>
        <motion.h2 className="view__title" variants={entranceX} custom={{ x: slideX }}>
          {title}
        </motion.h2>
        {description && (
          <motion.p className="section-lead" variants={staggerItem}>
            {description}
          </motion.p>
        )}
        {meta}
      </div>
      {aside && (
        <motion.div className="view__aside" variants={staggerItem}>
          {aside}
        </motion.div>
      )}
    </motion.header>
  );
}
