import { useMemo } from "react";
import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DeltaRow, Lap } from "../api/types";
import { useTheme } from "../hooks/useTheme";
import { useDrawInOnce } from "../hooks/useDrawInOnce";
import { fmtDelta, fmtLapTime } from "../format";
import { ChartCard } from "./ChartCard";
import { ChartTooltip } from "./ChartTooltip";

interface Props {
  delta: DeltaRow[];
  laps: Lap[];
  loading: boolean;
  error: string | null;
}

/**
 * Diverging bars around a zero baseline — polarity is the data's job here
 * (which teammate was faster each lap), so each bar wears the faster
 * driver's color: above zero red (Leclerc faster), below zero blue
 * (Hamilton faster). Same blue/red pair as everywhere else; the validated
 * diverging poles and the driver colors are deliberately the same hues.
 */
export function DeltaChart({ delta, laps, loading, error }: Props) {
  const theme = useTheme();

  // A pit cycle puts ±20s on the in-lap and out-lap and buries the actual
  // pace story (±1s), so those laps are excluded here. A pit-out flag marks
  // the out-lap; the lap before it is the in-lap. The raw times stay
  // reachable in the lap-times chart and its table.
  const racingLaps = useMemo(() => {
    const excluded = new Set<number>();
    for (const lap of laps) {
      if (lap.is_pit_out_lap) {
        excluded.add(lap.lap_number);
        excluded.add(lap.lap_number - 1);
      }
    }
    return delta.filter((row) => !excluded.has(row.lap_number));
  }, [delta, laps]);
  const drawIn = useDrawInOnce(racingLaps.length > 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const row: DeltaRow = payload[0].payload;
    const faster = row.delta > 0 ? "Leclerc" : row.delta < 0 ? "Hamilton" : "Even";
    return (
      <ChartTooltip
        title={`Lap ${row.lap_number}`}
        rows={[
          {
            color: row.delta > 0 ? theme.leclerc : theme.hamilton,
            value: fmtDelta(row.delta),
            label: faster === "Even" ? "dead even" : `${faster} faster`,
          },
          {
            color: theme.hamilton,
            value: fmtLapTime(row.hamilton_duration),
            label: "Hamilton",
          },
          {
            color: theme.leclerc,
            value: fmtLapTime(row.leclerc_duration),
            label: "Leclerc",
          },
        ]}
      />
    );
  };

  return (
    <ChartCard
      title="Teammate delta per lap"
      subtitle="Above zero: Leclerc faster · below zero: Hamilton faster. Pit in/out laps excluded; raw times live in the lap-times chart."
      legend={[
        { label: "Leclerc faster", color: theme.leclerc, shape: "rect" },
        { label: "Hamilton faster", color: theme.hamilton, shape: "rect" },
      ]}
      loading={loading}
      error={error}
      hasData={racingLaps.length > 0}
      emptyText="No comparable laps for this race."
      wide
      table={{
        columns: [
          { key: "lap_number", label: "Lap" },
          {
            key: "hamilton_duration",
            label: "Hamilton",
            format: (v) => fmtLapTime(v as number),
          },
          {
            key: "leclerc_duration",
            label: "Leclerc",
            format: (v) => fmtLapTime(v as number),
          },
          { key: "delta", label: "Delta", format: (v) => fmtDelta(v as number) },
        ],
        rows: racingLaps as unknown as Record<string, unknown>[],
      }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={racingLaps}
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
            {racingLaps.map((row) => (
              <Cell
                key={row.lap_number}
                fill={row.delta > 0 ? theme.leclerc : theme.hamilton}
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
