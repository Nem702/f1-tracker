import type { RaceResultRow } from "../api/types";
import { ChartCard } from "./ChartCard";
import { DataTable, type TableSpec } from "./DataTable";
import { TeamDot } from "./TeamDot";

interface Props {
  title: string;
  subtitle?: string;
  rows: RaceResultRow[];
  loading: boolean;
  error: string | null;
  emptyText?: string;
}

/** Full grid classification — every driver, not just the tracked pair —
 *  for whichever past race is selected. Jolpica-backed (see
 *  /api/races/{session_key}/official-result). Reused for both the main
 *  race result and the sprint result (same row shape, own ChartCard
 *  instance each time — title/subtitle/emptyText tell them apart, not a
 *  second near-duplicate component). */
export function OfficialResult({ title, subtitle, rows, loading, error, emptyText }: Props) {
  // Time/Gap + Status + Laps collapse into one Result column: finishers
  // show their time/gap (Status was "Finished" and Laps the full distance
  // for every one of them — zero-information columns); a retirement shows
  // its status and the lap it ended on, which is the only case where
  // either mattered.
  const table: TableSpec = {
    columns: [
      { key: "position", label: "Pos" },
      {
        key: "driver_name",
        label: "Driver",
        render: (row) => (
          <>
            <TeamDot teamName={row.constructor_name as string | null} />
            {String(row.driver_name ?? "—")}
          </>
        ),
      },
      /* Phone drops: the TeamDot beside the driver keeps team identity, and
         Grid is the lowest-value number here next to Result/Pts. */
      { key: "constructor_name", label: "Team", hideOnPhone: true },
      { key: "grid", label: "Grid", align: "right", hideOnPhone: true },
      {
        key: "time",
        label: "Result",
        align: "right",
        render: (row) => {
          if (row.time != null) return String(row.time);
          if (row.status == null) return "—";
          return (
            <span className="data-table__dim">
              {String(row.status)}
              {row.laps != null ? ` · L${row.laps}` : ""}
            </span>
          );
        },
      },
      { key: "points", label: "Pts", align: "right" },
    ],
    rows: rows as unknown as Record<string, unknown>[],
  };

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      hasData={rows.length > 0}
      loading={loading}
      error={error}
      emptyText={emptyText ?? "No official result published yet for this race."}
    >
      <DataTable spec={table} limits={[5, 10, "all"]} defaultLimit={10} />
    </ChartCard>
  );
}
