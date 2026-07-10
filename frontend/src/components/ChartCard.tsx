import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { DataTable, type TableSpec } from "./DataTable";
import { Skeleton } from "./Skeleton";
import { duration, EASE } from "../motion";

export interface LegendItem {
  label: string;
  color: string;
  shape: "line" | "rect"; // legend mirrors the mark: line for lines, rect for fills
}

/** Classic swatch legend for non-pair series (compounds, weather). Pair
 *  charts use PairLegend (DriverChip.tsx) instead — same .legend list. */
export function LegendList({ items }: { items: LegendItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="legend">
      {items.map((item) => (
        <li key={item.label} className="legend__item">
          <span
            className={`legend__swatch legend__swatch--${item.shape}`}
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  loading?: boolean;
  error?: string | null;
  hasData: boolean;
  emptyText?: string;
  /** Approximate height of the eventual content, so the first-load skeleton
   *  holds the card near its final size and data landing doesn't shift the
   *  page. Callers with taller charts pass their chart height. */
  skeletonHeight?: number;
  table?: TableSpec;
  wide?: boolean;
  children: ReactNode;
}

function SwapIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8h13l-3.2-3.2M20 16H7l3.2 3.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The container every view mounts in: title, legend, the chart/table toggle
 * (every chart ships its accessible table twin), and the shared loading /
 * empty / error states. The very first load (no data yet) shows a shimmer
 * skeleton plate; while a refetch runs, the previous render is held at
 * reduced opacity instead — no skeleton, no layout jump.
 *
 * Liquid-glass layering: the card is a solid (non-blurred) surface — see
 * .card--solid in index.css. Race Analysis stacks 6-7 of these, and scroll
 * profiling showed backdrop-filter here (re-blurring the moving aurora
 * under every card, every frame) as the site's actual scroll-jank source;
 * the navbar and #hero keep the full frosted .glass treatment, since
 * they don't compound the same way. The data (chart or table) still draws
 * on a near-opaque inset plate underneath the header/legend/toggle.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  loading = false,
  error = null,
  hasData,
  emptyText = "No data recorded for this race.",
  skeletonHeight = 260,
  table,
  wide = false,
  children,
}: Props) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <motion.section
      className={`card card--solid${wide ? " card--wide" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: EASE }}
    >
      <header className="card__header">
        <div>
          <h2 className="card__title">{title}</h2>
          {subtitle && <p className="card__subtitle">{subtitle}</p>}
        </div>
        <div className="card__tools">
          {legend}
          {table && hasData && (
            <button
              type="button"
              className="btn-pill card__toggle"
              onClick={() => setView(view === "chart" ? "table" : "chart")}
            >
              <SwapIcon />
              {view === "chart" ? "Table" : "Chart"}
            </button>
          )}
        </div>
      </header>

      <div className="card__body" style={{ opacity: loading ? 0.55 : 1 }}>
        {error ? (
          <p className="card__state card__state--error">{error}</p>
        ) : !hasData && loading ? (
          // First load only — refetches keep hasData (useApi holds the
          // previous payload) and land in the children branch dimmed to 0.55.
          <div className="card__plate">
            <Skeleton height={skeletonHeight} />
          </div>
        ) : !hasData && !loading ? (
          <p className="card__state">{emptyText}</p>
        ) : view === "table" && table ? (
          <div className="card__plate">
            <DataTable spec={table} />
          </div>
        ) : (
          <div className="card__plate">{children}</div>
        )}
      </div>
    </motion.section>
  );
}
