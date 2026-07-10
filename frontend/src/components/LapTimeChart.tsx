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
import type { Lap } from "../api/types";
import type { DriverPair } from "../teams";
import { useTheme } from "../hooks/useTheme";
import { useDrawInOnce } from "../hooks/useDrawInOnce";
import { fmtLapTime } from "../format";
import { ChartCard } from "./ChartCard";
import { PairLegend } from "./DriverChip";
import { ChartTooltip, type TooltipRow } from "./ChartTooltip";

interface Props {
  laps: Lap[];
  pair: DriverPair | null;
  loading: boolean;
  error: string | null;
}

interface LapPoint {
  lap: number;
  a: number | null;
  b: number | null;
  aPitOut: boolean;
  bPitOut: boolean;
}

/** Merge the flat laps list into one row per lap number for the active pair.
 *  Laps without a recorded duration stay null so the line shows a gap, not
 *  an invented value. */
function mergeLaps(
  laps: Lap[],
  aNumber: number | null,
  bNumber: number | null,
): LapPoint[] {
  const byLap = new Map<number, LapPoint>();
  for (const lap of laps) {
    if (lap.driver_number !== aNumber && lap.driver_number !== bNumber) continue;
    let point = byLap.get(lap.lap_number);
    if (!point) {
      point = {
        lap: lap.lap_number,
        a: null,
        b: null,
        aPitOut: false,
        bPitOut: false,
      };
      byLap.set(lap.lap_number, point);
    }
    if (lap.driver_number === aNumber) {
      point.a = lap.lap_duration;
      point.aPitOut = lap.is_pit_out_lap === true;
    } else {
      point.b = lap.lap_duration;
      point.bPitOut = lap.is_pit_out_lap === true;
    }
  }
  return [...byLap.values()].sort((a, b) => a.lap - b.lap);
}

export function LapTimeChart({ laps, pair, loading, error }: Props) {
  const theme = useTheme();
  const aNumber = pair?.[0].number ?? null;
  const bNumber = pair?.[1].number ?? null;
  const merged = useMemo(
    () => mergeLaps(laps, aNumber, bNumber),
    [laps, aNumber, bNumber],
  );
  const drawIn = useDrawInOnce(merged.length > 0);

  // Slow outliers ruin the y-axis: a red-flag stoppage records one absurd
  // "lap" (30+ minutes at Monaco), and even ordinary SC/red-flag crawl laps
  // (~1.6×+ race pace) squash the actual pace battle into a sliver. Blank
  // anything over 1.5× the median from the chart — pit in/out laps
  // (~1.2–1.35×) stay, so the strategy spikes still read — and let the
  // auto domain fit the racing story. Blanked laps read as gaps, like
  // other missing times; the raw values stay in the table view, and the
  // card subtitle reports how many went off-scale.
  const { data, offScale } = useMemo(() => {
    const durations = merged
      .flatMap((p) => [p.a, p.b])
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);
    if (durations.length === 0) return { data: merged, offScale: 0 };
    const cutoff = durations[Math.floor(durations.length / 2)] * 1.5;
    let offScale = 0;
    const data = merged.map((p) => {
      const aOver = p.a !== null && p.a > cutoff;
      const bOver = p.b !== null && p.b > cutoff;
      offScale += (aOver ? 1 : 0) + (bOver ? 1 : 0);
      return {
        ...p,
        a: aOver ? null : p.a,
        b: bOver ? null : p.b,
      };
    });
    return { data, offScale };
  }, [merged]);

  // Index of each series' last real point, so the direct end-label sits on
  // the line's actual end (a line stops early on a DNF).
  const lastIdx = useMemo(() => {
    let a = -1;
    let b = -1;
    data.forEach((p, i) => {
      if (p.a !== null) a = i;
      if (p.b !== null) b = i;
    });
    return { a, b };
  }, [data]);

  // Pit-out laps get a marker (≥8px with a 2px surface ring); every other
  // point renders no dot — the 2px line carries the series.
  const pitDot =
    (series: "a" | "b", color: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      const isPitOut =
        series === "a" ? props.payload?.aPitOut : props.payload?.bPitOut;
      if (!isPitOut || props.value == null) {
        return <circle key={`${series}-${props.index}`} r={0} />;
      }
      return (
        <circle
          key={`${series}-${props.index}`}
          cx={props.cx}
          cy={props.cy}
          r={4.5}
          fill={color}
          stroke={theme.surface}
          strokeWidth={2}
        />
      );
    };

  // Direct end-labels wear the driver's acronym from the API data.
  const endLabel =
    (series: "a" | "b", text: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      if (props.index !== lastIdx[series] || props.value == null) {
        return <g key={`${series}-lbl-${props.index}`} />;
      }
      return (
        <text
          key={`${series}-lbl-${props.index}`}
          x={props.x + 8}
          y={props.y}
          fill={theme.inkSecondary}
          fontSize={11}
          dominantBaseline="middle"
        >
          {text}
        </text>
      );
    };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length || !pair) return null;
    const point: LapPoint | undefined = payload[0]?.payload;
    const rows: TooltipRow[] = [];
    if (point?.a != null) {
      rows.push({
        color: theme.driver1,
        value: fmtLapTime(point.a),
        label: `${pair[0].lastName}${point.aPitOut ? " · pit out" : ""}`,
      });
    }
    if (point?.b != null) {
      rows.push({
        color: theme.driver2,
        value: fmtLapTime(point.b),
        label: `${pair[1].lastName}${point.bPitOut ? " · pit out" : ""}`,
      });
    }
    return <ChartTooltip title={`Lap ${label}`} rows={rows} />;
  };

  return (
    <ChartCard
      title="Lap times"
      subtitle={
        offScale > 0
          ? `Dots mark pit-out laps; gaps are missing times. ${offScale} slow ${offScale === 1 ? "lap" : "laps"} (safety car / red flag) off-scale — full values in the table.`
          : "Dots mark pit-out laps; gaps are missing times or red-flag laps (full values in the table)."
      }
      legend={<PairLegend pair={pair} />}
      loading={loading}
      error={error}
      hasData={data.length > 0}
      wide
      table={{
        columns: [
          { key: "lap", label: "Lap" },
          {
            key: "a",
            label: pair?.[0].lastName ?? "Driver A",
            format: (v) => fmtLapTime(v as number),
          },
          {
            key: "b",
            label: pair?.[1].lastName ?? "Driver B",
            format: (v) => fmtLapTime(v as number),
          },
        ],
        rows: merged as unknown as Record<string, unknown>[],
      }}
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 46, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="lap"
            type="number"
            domain={[1, "dataMax"]}
            allowDecimals={false}
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
            tick={{ fill: theme.inkMuted, fontSize: 11 }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => fmtLapTime(v, 0)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: theme.inkMuted, fontSize: 11 }}
            width={44}
          />
          <Tooltip
            content={renderTooltip}
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
          />
          <Line
            dataKey="a"
            stroke={theme.driver1}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            connectNulls={false}
            dot={pitDot("a", theme.driver1)}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            label={endLabel("a", pair?.[0].acronym ?? "")}
            {...drawIn}
          />
          <Line
            dataKey="b"
            stroke={theme.driver2}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            connectNulls={false}
            dot={pitDot("b", theme.driver2)}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            label={endLabel("b", pair?.[1].acronym ?? "")}
            {...drawIn}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
