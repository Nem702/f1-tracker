import type { RaceResultRow } from "../api/types";
import { ChartCard } from "./ChartCard";
import { DataTable, type TableSpec } from "./DataTable";

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
  const table: TableSpec = {
    columns: [
      { key: "position", label: "Pos" },
      { key: "driver_name", label: "Driver" },
      { key: "constructor_name", label: "Team" },
      { key: "grid", label: "Grid" },
      { key: "laps", label: "Laps" },
      { key: "time", label: "Time/Gap" },
      { key: "status", label: "Status" },
      { key: "points", label: "Pts" },
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
      <DataTable spec={table} />
    </ChartCard>
  );
}
