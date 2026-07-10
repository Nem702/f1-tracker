import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { SectionHeading } from "./SectionHeading";
import { ChartCard } from "./ChartCard";
import { DataTable, type TableSpec } from "./DataTable";
import { Reveal } from "./Reveal";

/** #season-standings section body: full/uncapped current-season driver +
 *  constructor championship tables — the one canonical standings table now
 *  (the old top-5 preview embedded in Race Weekend is gone; #next-race can
 *  deep-link here instead of duplicating it). Self-contained (owns its own
 *  fetch), same shape as About.tsx. Reuses ChartCard + DataTable exactly as
 *  #telemetry's table-only panels do: a DataTable passed as children with
 *  no `table` prop renders with no chart/table toggle, since there's no
 *  chart to toggle from. */
export function Standings() {
  const s = useApi((_k) => api.standings(), 0);
  const data = s.data?.standings ?? null;

  const driverTable: TableSpec = {
    columns: [
      { key: "position", label: "Pos" },
      { key: "driver_name", label: "Driver" },
      { key: "team_name", label: "Team" },
      { key: "points", label: "Points" },
    ],
    rows: (data?.driver_standings ?? []) as unknown as Record<string, unknown>[],
  };

  const constructorTable: TableSpec = {
    columns: [
      { key: "position", label: "Pos" },
      { key: "team_name", label: "Team" },
      { key: "points", label: "Points" },
    ],
    rows: (data?.constructor_standings ?? []) as unknown as Record<string, unknown>[],
  };

  return (
    <>
      <SectionHeading
        index={4}
        eyebrow="Season"
        title={data ? `${data.season} Championship` : "Championship standings"}
        description="The running season total, not a single race — driver and constructor points accumulate here after every completed weekend."
      />

      <div className="grid">
        <Reveal>
          <ChartCard
            title="Drivers"
            hasData={driverTable.rows.length > 0}
            loading={s.loading}
            error={s.error}
            emptyText="No driver standings available yet."
          >
            <DataTable spec={driverTable} />
          </ChartCard>
        </Reveal>
        <Reveal delay={0.08}>
          <ChartCard
            title="Constructors"
            hasData={constructorTable.rows.length > 0}
            loading={s.loading}
            error={s.error}
            emptyText="No constructor standings available yet."
          >
            <DataTable spec={constructorTable} />
          </ChartCard>
        </Reveal>
      </div>
    </>
  );
}
