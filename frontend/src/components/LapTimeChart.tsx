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
import { useTheme } from "../hooks/useTheme";
import { fmtLapTime } from "../format";
import { ChartCard } from "./ChartCard";
import { ChartTooltip, type TooltipRow } from "./ChartTooltip";

interface Props {
  laps: Lap[];
  hamNumber: number | null;
  lecNumber: number | null;
  loading: boolean;
  error: string | null;
}

interface LapPoint {
  lap: number;
  ham: number | null;
  lec: number | null;
  hamPitOut: boolean;
  lecPitOut: boolean;
}

/** Merge the flat laps list into one row per lap number. Laps without a
 *  recorded duration stay null so the line shows a gap, not an invented value. */
function mergeLaps(
  laps: Lap[],
  hamNumber: number | null,
  lecNumber: number | null,
): LapPoint[] {
  const byLap = new Map<number, LapPoint>();
  for (const lap of laps) {
    let point = byLap.get(lap.lap_number);
    if (!point) {
      point = {
        lap: lap.lap_number,
        ham: null,
        lec: null,
        hamPitOut: false,
        lecPitOut: false,
      };
      byLap.set(lap.lap_number, point);
    }
    if (lap.driver_number === hamNumber) {
      point.ham = lap.lap_duration;
      point.hamPitOut = lap.is_pit_out_lap === true;
    } else if (lap.driver_number === lecNumber) {
      point.lec = lap.lap_duration;
      point.lecPitOut = lap.is_pit_out_lap === true;
    }
  }
  return [...byLap.values()].sort((a, b) => a.lap - b.lap);
}

export function LapTimeChart({
  laps,
  hamNumber,
  lecNumber,
  loading,
  error,
}: Props) {
  const theme = useTheme();
  const merged = useMemo(
    () => mergeLaps(laps, hamNumber, lecNumber),
    [laps, hamNumber, lecNumber],
  );

  // A red-flag stoppage records one absurd "lap" (30+ minutes at Monaco) that
  // flattens every real lap against the x-axis. Blank anything over 3× the
  // median from the chart — it reads as a gap, like other missing times — and
  // keep the raw value in the table view.
  const data = useMemo(() => {
    const durations = merged
      .flatMap((p) => [p.ham, p.lec])
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);
    if (durations.length === 0) return merged;
    const cutoff = durations[Math.floor(durations.length / 2)] * 3;
    return merged.map((p) => ({
      ...p,
      ham: p.ham !== null && p.ham > cutoff ? null : p.ham,
      lec: p.lec !== null && p.lec > cutoff ? null : p.lec,
    }));
  }, [merged]);

  // Index of each series' last real point, so the direct end-label sits on
  // the line's actual end (Leclerc's line stops early on a DNF).
  const lastIdx = useMemo(() => {
    let ham = -1;
    let lec = -1;
    data.forEach((p, i) => {
      if (p.ham !== null) ham = i;
      if (p.lec !== null) lec = i;
    });
    return { ham, lec };
  }, [data]);

  // Pit-out laps get a marker (≥8px with a 2px surface ring); every other
  // point renders no dot — the 2px line carries the series.
  const pitDot =
    (series: "ham" | "lec", color: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      const isPitOut =
        series === "ham" ? props.payload?.hamPitOut : props.payload?.lecPitOut;
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

  const endLabel =
    (series: "ham" | "lec", text: string) =>
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
    if (!active || !payload?.length) return null;
    const point: LapPoint | undefined = payload[0]?.payload;
    const rows: TooltipRow[] = [];
    if (point?.ham != null) {
      rows.push({
        color: theme.hamilton,
        value: fmtLapTime(point.ham),
        label: `Hamilton${point.hamPitOut ? " · pit out" : ""}`,
      });
    }
    if (point?.lec != null) {
      rows.push({
        color: theme.leclerc,
        value: fmtLapTime(point.lec),
        label: `Leclerc${point.lecPitOut ? " · pit out" : ""}`,
      });
    }
    return <ChartTooltip title={`Lap ${label}`} rows={rows} />;
  };

  return (
    <ChartCard
      title="Lap times"
      subtitle="Dots mark pit-out laps; gaps are missing times or red-flag laps (full values in the table)."
      legend={[
        { label: "Hamilton", color: theme.hamilton, shape: "line" },
        { label: "Leclerc", color: theme.leclerc, shape: "line" },
      ]}
      loading={loading}
      error={error}
      hasData={data.length > 0}
      wide
      table={{
        columns: [
          { key: "lap", label: "Lap" },
          {
            key: "ham",
            label: "Hamilton",
            format: (v) => fmtLapTime(v as number),
          },
          {
            key: "lec",
            label: "Leclerc",
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
            dataKey="ham"
            stroke={theme.hamilton}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            connectNulls={false}
            dot={pitDot("ham", theme.hamilton)}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            label={endLabel("ham", "HAM")}
            isAnimationActive={false}
          />
          <Line
            dataKey="lec"
            stroke={theme.leclerc}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            connectNulls={false}
            dot={pitDot("lec", theme.leclerc)}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            label={endLabel("lec", "LEC")}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
