import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { entrance, staggerContainer, staggerItem } from "../motion";

interface Props {
  eyebrow: string;
  title: ReactNode;
  meta?: ReactNode;
}

/** Shared eyebrow+title heading for every below-the-fold section — a short
 *  two-beat text stagger (eyebrow, then title) playing once on scroll-in,
 *  the same whileInView-once mechanism Reveal.tsx uses for cards, just
 *  applied to a heading instead. The hero's own h1 (Hero3D.tsx) stays on
 *  the page-load cascade — it's above the fold, so "reveal on scroll"
 *  doesn't apply there. */
export function SectionHeading({ eyebrow, title, meta }: Props) {
  return (
    <motion.header
      className="view__header"
      variants={staggerContainer(0.08)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-100px" }}
    >
      <motion.p className="view__eyebrow" variants={staggerItem}>
        {eyebrow}
      </motion.p>
      <motion.h2 className="view__title" variants={entrance}>
        {title}
      </motion.h2>
      {meta}
    </motion.header>
  );
}
