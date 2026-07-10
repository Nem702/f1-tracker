import { useState } from "react";

export interface TableColumn {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

export interface TableSpec {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
}

/** A row-limit choice: a number of rows, or "all". */
export type RowLimit = number | "all";

function cell(col: TableColumn, row: Record<string, unknown>): string {
  const value = row[col.key];
  if (value === null || value === undefined) return "—";
  return col.format ? col.format(value) : String(value);
}

interface Props {
  spec: TableSpec;
  /** When set, renders a "5 · 10 · All" segmented control above the table and
   *  caps the visible rows. Omit for a plain, fully-rendered table (the
   *  default everywhere a table is a chart's accessible twin). */
  limits?: RowLimit[];
  /** Which of `limits` is selected initially (defaults to the first). */
  defaultLimit?: RowLimit;
}

/** The accessible twin of every chart — same rows, plain HTML, no color.
 *  Tables that stand on their own (the last-race classification / qualifying /
 *  sprint results) opt into a row-limit control via `limits`. */
export function DataTable({ spec, limits, defaultLimit }: Props) {
  const [limit, setLimit] = useState<RowLimit>(defaultLimit ?? limits?.[0] ?? "all");

  // Only worth a control if the shortest limit would actually hide rows.
  const smallest = limits?.reduce<number | null>(
    (min, l) => (typeof l === "number" ? (min === null ? l : Math.min(min, l)) : min),
    null,
  );
  const showControl = !!limits && smallest != null && spec.rows.length > smallest;

  const visibleRows =
    showControl && limit !== "all" ? spec.rows.slice(0, limit) : spec.rows;

  const table = (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {spec.columns.map((col) => (
              <th key={col.key} scope="col">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i}>
              {spec.columns.map((col) => (
                <td key={col.key}>{cell(col, row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!showControl) return table;

  return (
    <div className="data-table__wrap">
      <div className="data-table__limit">
        <span className="data-table__limit-label" aria-hidden="true">
          Rows
        </span>
        <div className="data-table__limit-group" role="group" aria-label="Rows to show">
          {(limits ?? []).map((opt) => {
            const active = opt === limit;
            return (
              <button
                key={String(opt)}
                type="button"
                className={`btn-pill data-table__limit-btn${active ? " btn-pill--accent" : ""}`}
                aria-pressed={active}
                onClick={() => setLimit(opt)}
              >
                {opt === "all" ? "All" : opt}
              </button>
            );
          })}
        </div>
        <span className="data-table__count">
          Showing {visibleRows.length} of {spec.rows.length}
        </span>
      </div>
      {table}
    </div>
  );
}
