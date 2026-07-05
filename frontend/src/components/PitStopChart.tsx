import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PitStop } from "../api/types";
import type { DriverPair } from "../teams";
import { useTheme } from "../hooks/useTheme";
import { useDrawInOnce } from "../hooks/useDrawInOnce";
import { fmtSeconds } from "../format";
import { ChartCard } from "./ChartCard";
import { PairLegend } from "./DriverChip";
import { ChartTooltip } from "./ChartTooltip";

interface Props {
  pit: PitStop[];
  pair: DriverPair | null;
  loading: boolean;
  error: string | null;
}

interface StopRow {
  key: string;
  lap: number;
  driverNumber: number;
  driver: string; // last name for the table/tooltip
  duration: number;
}

/** Total pit-lane time per stop (entry to exit), both drivers on one lap axis. */
export function PitStopChart({ pit, pair, loading, error }: Props) {
  const theme = useTheme();
  const aNumber = pair?.[0].number ?? null;
  const bNumber = pair?.[1].number ?? null;

  const allStops: StopRow[] = useMemo(
    () =>
      pit
        // The endpoint returns every tracked car's pit stops for the
        // session — without this filter other teams' stops would be
        // mislabeled as the active pair below.
        .filter(
          (p) =>
            p.pit_duration !== null &&
            (p.driver_number === aNumber || p.driver_number === bNumber),
        )
        .map((p) => ({
          key: `L${p.lap_number}-${p.driver_number}`,
          lap: p.lap_number,
          driverNumber: p.driver_number,
          driver:
            (p.driver_number === aNumber
              ? pair?.[0].lastName
              : pair?.[1].lastName) ?? "?",
          duration: p.pit_duration!,
        }))
        .sort((a, b) => a.lap - b.lap),
    [pit, pair, aNumber, bNumber],
  );

  // A car sitting out a red flag logs a 30+ minute "stop" that dwarfs every
  // real one (a normal pit-lane transit is 20–35s). Chart only plausible
  // stops; the outlier stays in the table and gets called out in the subtitle.
  const stops = useMemo(
    () => allStops.filter((s) => s.duration <= 180),
    [allStops],
  );
  const drawIn = useDrawInOnce(stops.length > 0);
  const outliers = allStops.length - stops.length;
  const subtitle =
    outliers > 0
      ? `Pit-lane time per stop. ${outliers} red-flag stoppage${outliers > 1 ? "s" : ""} left off the chart — see the table.`
      : "Pit-lane time per stop (entry to exit, not just the stationary time).";

  const color = (driverNumber: number) =>
    driverNumber === aNumber ? theme.driver1 : theme.driver2;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const row: StopRow = payload[0].payload;
    return (
      <ChartTooltip
        title={`Lap ${row.lap}`}
        rows={[
          {
            color: color(row.driverNumber),
            value: fmtSeconds(row.duration),
            label: `${row.driver} · pit lane total`,
          },
        ]}
      />
    );
  };

  return (
    <ChartCard
      title="Pit stops"
      subtitle={subtitle}
      legend={<PairLegend pair={pair} />}
      loading={loading}
      error={error}
      hasData={stops.length > 0}
      emptyText="No pit stop data for this race."
      table={{
        columns: [
          { key: "lap", label: "Lap" },
          { key: "driver", label: "Driver" },
          {
            key: "duration",
            label: "Pit lane time",
            format: (v) => fmtSeconds(v as number),
          },
        ],
        rows: allStops as unknown as Record<string, unknown>[],
      }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={stops} margin={{ top: 20, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="key"
            tickFormatter={(_: string, i: number) => `Lap ${stops[i]?.lap ?? ""}`}
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
            tick={{ fill: theme.inkMuted, fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}s`}
            tickLine={false}
            axisLine={false}
            tick={{ fill: theme.inkMuted, fontSize: 11 }}
            width={36}
          />
          <Tooltip content={renderTooltip} cursor={{ fill: theme.grid, fillOpacity: 0.4 }} />
          <Bar
            dataKey="duration"
            barSize={22}
            radius={[4, 4, 0, 0]}
            {...drawIn}
          >
            {/* value on the cap — few bars, so labeling each is the bar spec */}
            <LabelList
              dataKey="duration"
              position="top"
              formatter={(v) => fmtSeconds(typeof v === "number" ? v : null)}
              style={{ fill: theme.inkSecondary, fontSize: 11 }}
            />
            {stops.map((row) => (
              <Cell key={row.key} fill={color(row.driverNumber)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
