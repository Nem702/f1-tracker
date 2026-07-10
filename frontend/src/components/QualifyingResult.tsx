import type { QualifyingRow } from "../api/types";
import { ChartCard } from "./ChartCard";
import { DataTable, type TableSpec } from "./DataTable";
import { TeamDot } from "./TeamDot";

interface Props {
  rows: QualifyingRow[];
  loading: boolean;
  error: string | null;
}

/** Grid order + Q1/Q2/Q3 times for whichever past race is selected —
 *  Jolpica-backed, same source call as OfficialResult (both come from
 *  /api/races/{session_key}/official-result). */
export function QualifyingResult({ rows, loading, error }: Props) {
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
      { key: "constructor_name", label: "Team" },
      { key: "q1", label: "Q1", align: "right" },
      { key: "q2", label: "Q2", align: "right" },
      { key: "q3", label: "Q3", align: "right" },
    ],
    rows: rows as unknown as Record<string, unknown>[],
  };

  return (
    <ChartCard
      title="Qualifying"
      subtitle="Grid order and session times"
      hasData={rows.length > 0}
      loading={loading}
      error={error}
      emptyText="No qualifying result published yet for this race."
    >
      <DataTable spec={table} limits={[5, 10, "all"]} defaultLimit={10} />
    </ChartCard>
  );
}
