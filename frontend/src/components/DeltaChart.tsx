import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DriverPair } from "../teams";
import type { PairDelta } from "../lib/delta";
import { useTheme } from "../hooks/useTheme";
import { useDrawInOnce } from "../hooks/useDrawInOnce";
import { fmtDelta, fmtLapTime } from "../format";
import { ChartCard } from "./ChartCard";
import { PairLegend } from "./DriverChip";
import { ChartTooltip } from "./ChartTooltip";

interface Props {
  /** Client-derived per-lap delta (lib/delta.ts) — pit in/out laps already
   *  excluded there, positive = pair[0] faster. */
  rows: PairDelta[];
  pair: DriverPair | null;
  loading: boolean;
  error: string | null;
}

/**
 * Diverging bars around a zero baseline — polarity is the data's job here
 * (which of the pair was faster each lap), so each bar wears the faster
 * driver's color: above zero driver 1, below zero driver 2. The validated
 * diverging poles and the pair's colors are deliberately the same hues.
 */
export function DeltaChart({ rows, pair, loading, error }: Props) {
  const theme = useTheme();
  const drawIn = useDrawInOnce(rows.length > 0);
  const aName = pair?.[0].lastName ?? "Driver A";
  const bName = pair?.[1].lastName ?? "Driver B";
  const sameTeam = pair !== null && pair[0].teamSlug === pair[1].teamSlug;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const row: PairDelta = payload[0].payload;
    const faster = row.delta > 0 ? aName : row.delta < 0 ? bName : "Even";
    return (
      <ChartTooltip
        title={`Lap ${row.lap_number}`}
        rows={[
          {
            color: row.delta > 0 ? theme.driver1 : theme.driver2,
            value: fmtDelta(row.delta),
            label: faster === "Even" ? "dead even" : `${faster} faster`,
          },
          {
            color: theme.driver1,
            value: fmtLapTime(row.a_duration),
            label: aName,
          },
          {
            color: theme.driver2,
            value: fmtLapTime(row.b_duration),
            label: bName,
          },
        ]}
      />
    );
  };

  return (
    <ChartCard
      title={sameTeam ? "Teammate delta per lap" : "Head-to-head delta per lap"}
      subtitle={`Above zero: ${aName} faster · below zero: ${bName} faster. Pit in/out laps excluded; raw times live in the lap-times chart.`}
      legend={<PairLegend pair={pair} suffix="faster" />}
      loading={loading}
      error={error}
      hasData={rows.length > 0}
      emptyText="No comparable laps for this race."
      wide
      table={{
        columns: [
          { key: "lap_number", label: "Lap" },
          {
            key: "a_duration",
            label: aName,
            format: (v) => fmtLapTime(v as number),
          },
          {
            key: "b_duration",
            label: bName,
            format: (v) => fmtLapTime(v as number),
          },
          { key: "delta", label: "Delta", format: (v) => fmtDelta(v as number) },
        ],
        rows: rows as unknown as Record<string, unknown>[],
      }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={rows}
          margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
          barCategoryGap="20%"
        >
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="lap_number"
            type="number"
            domain={[1, "dataMax"]}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: theme.inkMuted, fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(v: number) =>
              v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}s`
            }
            tickLine={false}
            axisLine={false}
            tick={{ fill: theme.inkMuted, fontSize: 11 }}
            width={52}
          />
          <Tooltip content={renderTooltip} cursor={{ fill: theme.grid, fillOpacity: 0.4 }} />
          <ReferenceLine y={0} stroke={theme.axis} strokeWidth={1} />
          <Bar dataKey="delta" maxBarSize={24} {...drawIn}>
            {rows.map((row) => (
              <Cell
                key={row.lap_number}
                fill={row.delta > 0 ? theme.driver1 : theme.driver2}
                // rounded data-end, square at the zero baseline
                radius={
                  (row.delta > 0
                    ? [4, 4, 0, 0]
                    : [0, 0, 4, 4]) as unknown as number
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
