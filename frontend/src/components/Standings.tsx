import type { ReactNode } from "react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { SectionHeading } from "./SectionHeading";
import { TeamDot } from "./TeamDot";
import { ChartCard } from "./ChartCard";
import { DataTable, type TableSpec } from "./DataTable";
import { Reveal } from "./Reveal";

/** Leader gets null (renders as the em dash); everyone else their points
 *  deficit, minus-signed. Rows arrive position-sorted from the backend. */
function withGap<T extends { points: number }>(rows: T[]): (T & { gap: string | null })[] {
  const leader = rows[0]?.points ?? 0;
  return rows.map((r, i) => ({
    ...r,
    gap: i === 0 ? null : `−${leader - r.points}`,
  }));
}

/** #season-standings section body: full/uncapped current-season driver +
 *  constructor championship tables — the one canonical standings table now
 *  (the old top-5 preview embedded in Race Weekend is gone; #next-race can
 *  deep-link here instead of duplicating it). Self-contained (owns its own
 *  fetch), same shape as About.tsx. Reuses ChartCard + DataTable exactly as
 *  #telemetry's table-only panels do; the drivers table opts into the same
 *  row-limit control the last-race tables use (22 rows is a full grid —
 *  "Showing 10 of 22" keeps the section scannable while saying, explicitly,
 *  that nothing is hidden for good). Tracked teams wear their swatch dot;
 *  untracked teams the muted default — the dots that are colored are the
 *  ones with telemetry below. */
export function Standings() {
  const s = useApi((_k) => api.standings(), 0);
  const data = s.data?.standings ?? null;

  const gapCell = (row: Record<string, unknown>): ReactNode =>
    row.gap == null ? "—" : <span className="data-table__dim">{String(row.gap)}</span>;

  const driverTable: TableSpec = {
    columns: [
      { key: "position", label: "Pos" },
      {
        key: "driver_name",
        label: "Driver",
        render: (row) => (
          <>
            <TeamDot teamName={row.team_name as string | null} />
            {String(row.driver_name ?? "—")}
          </>
        ),
      },
      { key: "team_name", label: "Team" },
      { key: "points", label: "Points", align: "right" },
      { key: "gap", label: "Gap", align: "right", render: gapCell },
    ],
    rows: withGap(data?.driver_standings ?? []) as unknown as Record<string, unknown>[],
  };

  const constructorTable: TableSpec = {
    columns: [
      { key: "position", label: "Pos" },
      {
        key: "team_name",
        label: "Team",
        render: (row) => (
          <>
            <TeamDot teamName={row.team_name as string | null} />
            {String(row.team_name ?? "—")}
          </>
        ),
      },
      { key: "points", label: "Points", align: "right" },
      { key: "gap", label: "Gap", align: "right", render: gapCell },
    ],
    rows: withGap(data?.constructor_standings ?? []) as unknown as Record<string, unknown>[],
  };

  return (
    <>
      <SectionHeading
        index={4}
        eyebrow="Season"
        title={data ? `${data.season} Championship` : "Championship standings"}
        description="Running totals, updated after every completed weekend."
        aside={
          data &&
          data.driver_standings.length > 0 &&
          data.constructor_standings.length > 0 ? (
            <div className="leaders-aside glass">
              <p className="leaders-aside__row">
                <span className="leaders-aside__kind">Drivers</span>
                <span className="leaders-aside__name">
                  <TeamDot teamName={data.driver_standings[0].team_name} />
                  {data.driver_standings[0].driver_name}
                </span>
                <span className="leaders-aside__points">{data.driver_standings[0].points}</span>
              </p>
              <p className="leaders-aside__row">
                <span className="leaders-aside__kind">Teams</span>
                <span className="leaders-aside__name">
                  <TeamDot teamName={data.constructor_standings[0].team_name} />
                  {data.constructor_standings[0].team_name}
                </span>
                <span className="leaders-aside__points">
                  {data.constructor_standings[0].points}
                </span>
              </p>
            </div>
          ) : undefined
        }
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
            <DataTable spec={driverTable} limits={[10, "all"]} fitContent />
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
            <DataTable spec={constructorTable} fitContent />
          </ChartCard>
        </Reveal>
      </div>
    </>
  );
}
