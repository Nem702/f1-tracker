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
import type { WeatherRow } from "../api/types";
import { useTheme } from "../hooks/useTheme";
import { useDrawInOnce } from "../hooks/useDrawInOnce";
import { fmtClock } from "../format";
import { ChartCard } from "./ChartCard";
import { ChartTooltip, type TooltipRow } from "./ChartTooltip";

interface Props {
  weather: WeatherRow[];
  loading: boolean;
  error: string | null;
}

interface WeatherPoint {
  t: number;
  track: number | null;
  air: number | null;
  humidity: number | null;
  rainfall: number | null;
}

/** Two related measures on the same °C scale — one hue, two shades (not two
 *  categorical hues; track vs air temp are the same kind of thing). */
export function WeatherChart({ weather, loading, error }: Props) {
  const theme = useTheme();

  const data: WeatherPoint[] = useMemo(
    () =>
      weather
        .map((w) => ({
          t: new Date(w.date).getTime(),
          track: w.track_temperature,
          air: w.air_temperature,
          humidity: w.humidity,
          rainfall: w.rainfall,
        }))
        .sort((a, b) => a.t - b.t),
    [weather],
  );
  const drawIn = useDrawInOnce(data.length > 0);

  const rained = useMemo(
    () => weather.some((w) => (w.rainfall ?? 0) > 0),
    [weather],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point: WeatherPoint | undefined = payload[0]?.payload;
    const rows: TooltipRow[] = [];
    if (point?.track != null)
      rows.push({ color: theme.tempTrack, value: `${point.track}°C`, label: "track" });
    if (point?.air != null)
      rows.push({ color: theme.tempAir, value: `${point.air}°C`, label: "air" });
    if (point?.humidity != null)
      rows.push({ value: `${point.humidity}%`, label: "humidity" });
    if (point?.rainfall != null && point.rainfall > 0)
      rows.push({ value: "yes", label: "rainfall" });
    return (
      <ChartTooltip title={fmtClock(new Date(Number(label)).toISOString())} rows={rows} />
    );
  };

  return (
    <ChartCard
      title="Weather"
      subtitle={rained ? "Rain fell during this session." : "Track and air temperature over the session."}
      legend={[
        { label: "Track temp", color: theme.tempTrack, shape: "line" },
        { label: "Air temp", color: theme.tempAir, shape: "line" },
      ]}
      loading={loading}
      error={error}
      hasData={data.length > 0}
      emptyText="No weather data for this race."
      table={{
        columns: [
          { key: "date", label: "Time", format: (v) => fmtClock(v as string) },
          { key: "track_temperature", label: "Track °C" },
          { key: "air_temperature", label: "Air °C" },
          { key: "humidity", label: "Humidity %" },
          { key: "rainfall", label: "Rainfall" },
        ],
        rows: weather as unknown as Record<string, unknown>[],
      }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t: number) => fmtClock(new Date(t).toISOString())}
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
            tick={{ fill: theme.inkMuted, fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}°`}
            tickLine={false}
            axisLine={false}
            tick={{ fill: theme.inkMuted, fontSize: 11 }}
            width={36}
            domain={["auto", "auto"]}
          />
          <Tooltip
            content={renderTooltip}
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
          />
          <Line
            dataKey="track"
            stroke={theme.tempTrack}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            {...drawIn}
          />
          <Line
            dataKey="air"
            stroke={theme.tempAir}
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
