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
import type { DriverPair } from "../teams";
import { useTheme } from "../hooks/useTheme";
import { useDrawInOnce } from "../hooks/useDrawInOnce";
import { fmtClock } from "../format";
import { ChartCard } from "./ChartCard";
import { PairLegend } from "./DriverChip";
import { ChartTooltip, type TooltipRow } from "./ChartTooltip";

interface Props {
  positions: PositionRow[];
  pair: DriverPair | null;
  loading: boolean;
  error: string | null;
}

interface PosPoint {
  t: number; // epoch ms — positions are timestamped events, not per-lap
  a: number | null;
  b: number | null;
}

export function PositionChart({ positions, pair, loading, error }: Props) {
  const theme = useTheme();
  const aNumber = pair?.[0].number ?? null;
  const bNumber = pair?.[1].number ?? null;
  const aName = pair?.[0].lastName ?? "Driver A";
  const bName = pair?.[1].lastName ?? "Driver B";

  const data: PosPoint[] = useMemo(() => {
    const byTime = new Map<number, PosPoint>();
    for (const row of positions) {
      if (row.driver_number !== aNumber && row.driver_number !== bNumber) continue;
      const t = new Date(row.date).getTime();
      let point = byTime.get(t);
      if (!point) {
        point = { t, a: null, b: null };
        byTime.set(t, point);
      }
      if (row.driver_number === aNumber) point.a = row.position;
      else point.b = row.position;
    }
    return [...byTime.values()].sort((a, b) => a.t - b.t);
  }, [positions, aNumber, bNumber]);
  const drawIn = useDrawInOnce(data.length > 0);

  // The table mirrors the chart: only the active pair's rows (the endpoint
  // carries every tracked driver since the four-team expansion).
  const pairRows = useMemo(
    () =>
      positions.filter(
        (p) => p.driver_number === aNumber || p.driver_number === bNumber,
      ),
    [positions, aNumber, bNumber],
  );

  const maxPos = useMemo(
    () => Math.max(10, ...pairRows.map((p) => p.position ?? 0)),
    [pairRows],
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
        color: entry.dataKey === "a" ? theme.driver1 : theme.driver2,
        value: `P${entry.value}`,
        label: entry.dataKey === "a" ? aName : bName,
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
      legend={<PairLegend pair={pair} />}
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
            format: (v) => (v === aNumber ? aName : bName),
          },
          { key: "position", label: "Position", format: (v) => `P${v as number}` },
        ],
        rows: pairRows as unknown as Record<string, unknown>[],
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
            dataKey="a"
            type="stepAfter"
            connectNulls
            stroke={theme.driver1}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            {...drawIn}
          />
          <Line
            dataKey="b"
            type="stepAfter"
            connectNulls
            stroke={theme.driver2}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            {...drawIn}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
