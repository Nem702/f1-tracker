import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { DataTable, type TableSpec } from "./DataTable";

export interface LegendItem {
  label: string;
  color: string;
  shape: "line" | "rect"; // legend mirrors the mark: line for lines, rect for fills
}

interface Props {
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  loading?: boolean;
  error?: string | null;
  hasData: boolean;
  emptyText?: string;
  table?: TableSpec;
  wide?: boolean;
  children: ReactNode;
}

/**
 * The container every view mounts in: title, legend, the chart/table toggle
 * (every chart ships its accessible table twin), and the shared loading /
 * empty / error states. While a refetch runs, the previous render is held at
 * reduced opacity — no skeleton, no layout jump.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  loading = false,
  error = null,
  hasData,
  emptyText = "No data recorded for this race.",
  table,
  wide = false,
  children,
}: Props) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <motion.section
      className={`card${wide ? " card--wide" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <header className="card__header">
        <div>
          <h2 className="card__title">{title}</h2>
          {subtitle && <p className="card__subtitle">{subtitle}</p>}
        </div>
        <div className="card__tools">
          {legend && legend.length > 0 && (
            <ul className="legend">
              {legend.map((item) => (
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
          )}
          {table && hasData && (
            <button
              type="button"
              className="card__toggle"
              onClick={() => setView(view === "chart" ? "table" : "chart")}
            >
              {view === "chart" ? "Table" : "Chart"}
            </button>
          )}
        </div>
      </header>

      <div className="card__body" style={{ opacity: loading ? 0.55 : 1 }}>
        {error ? (
          <p className="card__state card__state--error">{error}</p>
        ) : !hasData && !loading ? (
          <p className="card__state">{emptyText}</p>
        ) : view === "table" && table ? (
          <DataTable spec={table} />
        ) : (
          children
        )}
      </div>
    </motion.section>
  );
}
