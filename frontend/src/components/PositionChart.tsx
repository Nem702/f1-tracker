import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PositionRow } from "../api/types";
import { useTheme } from "../hooks/useTheme";
import { fmtClock } from "../format";
import { ChartCard } from "./ChartCard";
import { ChartTooltip, type TooltipRow } from "./ChartTooltip";

interface Props {
  positions: PositionRow[];
  hamNumber: number | null;
  lecNumber: number | null;
  loading: boolean;
  error: string | null;
}

interface PosPoint {
  t: number; // epoch ms — positions are timestamped events, not per-lap
  ham: number | null;
  lec: number | null;
}

export function PositionChart({
  positions,
  hamNumber,
  lecNumber,
  loading,
  error,
}: Props) {
  const theme = useTheme();

  const data: PosPoint[] = useMemo(() => {
    const byTime = new Map<number, PosPoint>();
    for (const row of positions) {
      const t = new Date(row.date).getTime();
      let point = byTime.get(t);
      if (!point) {
        point = { t, ham: null, lec: null };
        byTime.set(t, point);
      }
      if (row.driver_number === hamNumber) point.ham = row.position;
      else if (row.driver_number === lecNumber) point.lec = row.position;
    }
    return [...byTime.values()].sort((a, b) => a.t - b.t);
  }, [positions, hamNumber, lecNumber]);

  const maxPos = useMemo(
    () => Math.max(10, ...positions.map((p) => p.position ?? 0)),
    [positions],
  );

  // Recharts' auto ticks skip P1 on a reversed axis; pin them so the top
  // line always has a label.
  const yTicks = useMemo(() => {
    const ticks = [1];
    for (let p = 5; p <= maxPos; p += 5) ticks.push(p);
    return ticks;
  }, [maxPos]);

  const t0 = data[0]?.t ?? 0;
  const elapsedMin = (t: number) => Math.round((t - t0) / 60000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const rows: TooltipRow[] = [];
    for (const entry of payload) {
      if (entry.value == null) continue;
      rows.push({
        color: entry.dataKey === "ham" ? theme.hamilton : theme.leclerc,
        value: `P${entry.value}`,
        label: entry.dataKey === "ham" ? "Hamilton" : "Leclerc",
      });
    }
    return (
      <ChartTooltip title={`+${elapsedMin(Number(label))} min`} rows={rows} />
    );
  };

  return (
    <ChartCard
      title="Track position"
      subtitle="Position changes over the race — P1 at the top."
      legend={[
        { label: "Hamilton", color: theme.hamilton, shape: "line" },
        { label: "Leclerc", color: theme.leclerc, shape: "line" },
      ]}
      loading={loading}
      error={error}
      hasData={data.length > 0}
      emptyText="No position data for this race."
      wide
      table={{
        columns: [
          { key: "date", label: "Time", format: (v) => fmtClock(v as string) },
          {
            key: "driver_number",
            label: "Driver",
            format: (v) => (v === hamNumber ? "Hamilton" : "Leclerc"),
          },
          { key: "position", label: "Position", format: (v) => `P${v as number}` },
        ],
        rows: positions as unknown as Record<string, unknown>[],
      }}
    >
      <ResponsiveContainer width="100%" height={240}>
        {/* extra headroom so the P1 tick label isn't clipped at the plot edge */}
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => `+${elapsedMin(t)}'`}
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
            tick={{ fill: theme.inkMuted, fontSize: 11 }}
          />
          <YAxis
            reversed
            domain={[1, maxPos]}
            ticks={yTicks}
            allowDecimals={false}
            tickFormatter={(v: number) => `P${v}`}
            tickLine={false}
            axisLine={false}
            tick={{ fill: theme.inkMuted, fontSize: 11 }}
            width={36}
          />
          <Tooltip
            content={renderTooltip}
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
          />
          {/* stepAfter + connectNulls: a position holds until the next change,
              so interpolating diagonals would misstate the data */}
          <Line
            dataKey="ham"
            type="stepAfter"
            connectNulls
            stroke={theme.hamilton}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="lec"
            type="stepAfter"
            connectNulls
            stroke={theme.leclerc}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
