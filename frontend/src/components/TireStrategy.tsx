import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Stint } from "../api/types";
import type { DriverPair, DriverRef } from "../teams";
import { useTheme } from "../hooks/useTheme";
import { inkOn } from "../theme";
import { duration, EASE, stagger } from "../motion";
import { ChartCard, LegendList, type LegendItem } from "./ChartCard";
import { DriverChip } from "./DriverChip";
import { ChartTooltip } from "./ChartTooltip";

interface Props {
  stints: Stint[];
  pair: DriverPair | null;
  loading: boolean;
  error: string | null;
}

const ROW_HEIGHT = 26;
const ROW_GAP = 16;
const GUTTER = 64; // left space for the driver chips (dot + acronym)
const AXIS_BAND = 22; // bottom space for lap ticks — inside the SVG height

/** Compound colors follow the real-world Pirelli convention (a fixed semantic
 *  scale, like status colors) — so identity never rides on color alone: each
 *  segment carries its compound letter when it fits, plus legend + tooltip. */
export function TireStrategy({ stints, pair, loading, error }: Props) {
  const theme = useTheme();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<{ x: number; y: number; stint: Stint } | null>(null);

  // First-reveal grow-in only, same semantics as useDrawInOnce: stints re-key
  // on a race switch, and replaying the animation on every refetch would read
  // as churn. (useDrawInOnce itself returns Recharts props, so the ref pattern
  // is inlined here for a hand-rolled SVG.)
  const hasAnimated = useRef(false);
  const shouldAnimate = stints.length > 0 && !hasAnimated.current;
  useEffect(() => {
    if (stints.length > 0) hasAnimated.current = true;
  }, [stints.length]);

  // Measure via a callback ref, not a mount-only effect: ChartCard unmounts
  // this div for the empty/loading/table states, so observation has to follow
  // the element through every remount or the width goes stale at 600.
  const attachWrap = useCallback((el: HTMLDivElement | null) => {
    wrapRef.current = el;
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  const rows = useMemo(() => {
    const forDriver = (n: number | null) =>
      stints
        .filter((s) => s.driver_number === n && s.lap_start !== null && s.lap_end !== null)
        .sort((a, b) => a.stint_number - b.stint_number);
    if (!pair) return [];
    return pair.map((driver, slot) => ({
      driver,
      color: slot === 0 ? theme.driver1 : theme.driver2,
      stints: forDriver(driver.number),
    }));
  }, [stints, pair, theme]);

  // Chart + table cover the active pair only — the endpoint carries every
  // tracked driver since the four-team expansion.
  const pairStints = useMemo(
    () =>
      stints.filter((s) =>
        pair?.some((driver) => driver.number === s.driver_number),
      ),
    [stints, pair],
  );

  const totalLaps = useMemo(
    () => Math.max(1, ...pairStints.map((s) => s.lap_end ?? 0)),
    [pairStints],
  );

  const legend: LegendItem[] = useMemo(() => {
    const present = [...new Set(pairStints.map((s) => s.compound).filter(Boolean))] as string[];
    // fixed display order regardless of what order stints arrive in
    const order = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"];
    return present
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map((c) => ({
        label: c.charAt(0) + c.slice(1).toLowerCase(),
        color: theme.compounds[c] ?? theme.inkMuted,
        shape: "rect" as const,
      }));
  }, [pairStints, theme]);

  const driverName = (n: number): string =>
    pair?.find((d) => d.number === n)?.lastName ?? "?";

  const plotWidth = Math.max(50, width - GUTTER - 8);
  const lapX = (lap: number) => GUTTER + ((lap - 1) / totalLaps) * plotWidth;
  const rowCount = Math.max(1, rows.length);
  const height = rowCount * ROW_HEIGHT + (rowCount - 1) * ROW_GAP + AXIS_BAND;

  const tickStep = totalLaps > 45 ? 10 : 5;
  const ticks = [];
  for (let lap = tickStep; lap <= totalLaps; lap += tickStep) ticks.push(lap);

  return (
    <ChartCard
      title="Tire strategy"
      subtitle="One bar per stint; hover for compound, laps, and tyre age."
      legend={<LegendList items={legend} />}
      loading={loading}
      error={error}
      hasData={pairStints.length > 0}
      emptyText="No stint data for this race."
      table={{
        columns: [
          {
            key: "driver_number",
            label: "Driver",
            format: (v) => driverName(v as number),
          },
          { key: "stint_number", label: "Stint" },
          { key: "compound", label: "Compound" },
          { key: "lap_start", label: "From lap" },
          { key: "lap_end", label: "To lap" },
          { key: "tyre_age_at_start", label: "Tyre age at fit" },
        ],
        rows: pairStints as unknown as Record<string, unknown>[],
      }}
    >
      <div ref={attachWrap} className="tire-strip">
        <svg width={width} height={height} role="group" aria-label="Tire strategy by stint">
          {rows.map((row, rowIdx) => {
            const y = rowIdx * (ROW_HEIGHT + ROW_GAP);
            return (
              <g key={row.driver.number}>
                {row.stints.map((stint, stintIdx) => {
                  const x = lapX(stint.lap_start!);
                  // 2px surface gap between touching segments
                  const w = Math.max(
                    2,
                    lapX(stint.lap_end! + 1) - lapX(stint.lap_start!) - 2,
                  );
                  const fill = theme.compounds[stint.compound ?? ""] ?? theme.inkMuted;
                  const letter = (stint.compound ?? "?").charAt(0);
                  const growDelay = rowIdx * stagger.base + stintIdx * stagger.tight;
                  const compoundName = stint.compound
                    ? stint.compound.charAt(0) + stint.compound.slice(1).toLowerCase()
                    : "Unknown";
                  const segLabel =
                    `${row.driver.lastName}, ${compoundName} tyre, ` +
                    `laps ${stint.lap_start} to ${stint.lap_end}, ` +
                    `${stint.tyre_age_at_start ?? 0} lap tyre age at fit`;
                  return (
                    <g
                      key={stint.stint_number}
                      role="img"
                      aria-label={segLabel}
                      tabIndex={0}
                      onPointerMove={(e) => {
                        const rect = wrapRef.current!.getBoundingClientRect();
                        setHover({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                          stint,
                        });
                      }}
                      onPointerLeave={() => setHover(null)}
                      onFocus={() =>
                        setHover({ x: x + w / 2, y: y + ROW_HEIGHT, stint })
                      }
                      onBlur={() => setHover(null)}
                      className="tire-strip__seg"
                      style={{ cursor: "default" }}
                    >
                      <motion.rect
                        x={x}
                        y={y}
                        width={w}
                        height={ROW_HEIGHT}
                        rx={4}
                        fill={fill}
                        initial={shouldAnimate ? { scaleX: 0 } : false}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: duration.slower, ease: EASE, delay: growDelay }}
                        // fill-box scopes the transform to the rect itself, so
                        // scaleX grows each bar from its own left edge instead
                        // of the whole SVG's origin
                        style={{ transformBox: "fill-box", transformOrigin: "left center" }}
                      />
                      {w >= 20 && (
                        <motion.text
                          x={x + w / 2}
                          y={y + ROW_HEIGHT / 2}
                          fill={inkOn(fill)}
                          fontSize={11}
                          fontWeight={600}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          pointerEvents="none"
                          initial={shouldAnimate ? { opacity: 0 } : false}
                          animate={{ opacity: 1 }}
                          transition={{
                            duration: duration.base,
                            ease: EASE,
                            // hold the letter until its bar has grown past it
                            delay: growDelay + duration.base,
                          }}
                        >
                          {letter}
                        </motion.text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {ticks.map((lap) => (
            <text
              key={lap}
              x={lapX(lap)}
              y={height - 6}
              fill={theme.inkMuted}
              fontSize={11}
              textAnchor="middle"
            >
              {lap}
            </text>
          ))}
        </svg>
        {/* Row labels overlay the SVG gutter as HTML so driver identity
            renders through the same DriverChip as every legend. */}
        {rows.map((row, rowIdx) => (
          <RowLabel
            key={row.driver.number}
            driver={row.driver}
            color={row.color}
            top={rowIdx * (ROW_HEIGHT + ROW_GAP)}
          />
        ))}
        {hover && (
          <div
            className="tire-strip__tooltip"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            <ChartTooltip
              title={`Stint ${hover.stint.stint_number}`}
              rows={[
                {
                  color:
                    theme.compounds[hover.stint.compound ?? ""] ?? theme.inkMuted,
                  value: hover.stint.compound ?? "unknown",
                  label: `laps ${hover.stint.lap_start}–${hover.stint.lap_end}`,
                },
                {
                  value: `${hover.stint.tyre_age_at_start ?? 0} laps`,
                  label: "tyre age at fit",
                },
              ]}
            />
          </div>
        )}
      </div>
    </ChartCard>
  );
}

function RowLabel({
  driver,
  color,
  top,
}: {
  driver: DriverRef;
  color: string;
  top: number;
}) {
  return (
    <div className="tire-strip__label" style={{ top, height: ROW_HEIGHT }}>
      <DriverChip driver={driver} color={color} compact />
    </div>
  );
}
