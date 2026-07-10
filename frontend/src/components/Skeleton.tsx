import type { CSSProperties } from "react";

interface Props {
  width?: number | string;
  height?: number | string;
  variant?: "block" | "line";
  className?: string;
}

/** First-load shimmer placeholder (see .skeleton in index.css). Renders a
 *  span so it can sit inside phrasing content like .stat-tile__value.
 *  aria-hidden: loading is conveyed by the content's absence — these are
 *  purely decorative stand-ins, not announced state. */
export function Skeleton({ width, height, variant = "block", className }: Props) {
  const style: CSSProperties = { width, height };
  return (
    <span
      className={`skeleton${variant === "line" ? " skeleton--line" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Stacked text-line placeholders for table-ish content. Deterministic
 *  varied widths (no randomness — stable across re-renders). */
const LINE_WIDTHS = ["82%", "64%", "91%", "70%", "78%", "58%"];

export function SkeletonLines({ count = 5 }: { count?: number }) {
  return (
    <span style={{ display: "grid", gap: 12 }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} variant="line" width={LINE_WIDTHS[i % LINE_WIDTHS.length]} />
      ))}
    </span>
  );
}
