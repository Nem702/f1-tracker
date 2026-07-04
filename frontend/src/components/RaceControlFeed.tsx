import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { RaceControlRow } from "../api/types";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";
import { fmtClock } from "../format";
import { entrance, stagger } from "../motion";
import { ChartCard } from "./ChartCard";

interface Props {
  raceControl: RaceControlRow[];
  loading: boolean;
  error: string | null;
}

/** Flags map onto the reserved status scale (a yellow flag IS a warning);
 *  the label always rides next to the dot, so color never carries it alone. */
function flagColor(row: RaceControlRow, theme: Theme): string | null {
  const flag = row.flag?.toUpperCase() ?? "";
  const category = row.category?.toUpperCase() ?? "";
  if (flag.includes("RED")) return theme.flagCritical;
  if (flag.includes("YELLOW")) return theme.flagWarning;
  if (category.includes("SAFETYCAR") || category.includes("SAFETY CAR"))
    return theme.flagSerious;
  if (flag.includes("GREEN") || flag.includes("CLEAR")) return theme.flagGood;
  return null;
}

export function RaceControlFeed({ raceControl, loading, error }: Props) {
  const theme = useTheme();

  // First-reveal cascade only, same semantics as useDrawInOnce: rows re-key
  // on a race switch and shouldn't replay their entrance on every refetch.
  const hasAnimated = useRef(false);
  const shouldAnimate = raceControl.length > 0 && !hasAnimated.current;
  useEffect(() => {
    if (raceControl.length > 0) hasAnimated.current = true;
  }, [raceControl.length]);

  return (
    <ChartCard
      title="Race control"
      subtitle={`${raceControl.length} messages — flags, safety cars, penalties.`}
      loading={loading}
      error={error}
      hasData={raceControl.length > 0}
      emptyText="No race control messages for this race."
    >
      <ol className="rc-feed">
        {raceControl.map((row, i) => {
          const color = flagColor(row, theme);
          const tag = row.flag ?? row.category;
          return (
            <motion.li
              key={row.id}
              className="rc-feed__item"
              variants={entrance}
              initial={shouldAnimate ? "hidden" : false}
              animate="show"
              // a race can have 50+ messages — cap the cascade so rows past
              // the first dozen arrive together instead of trickling for seconds
              custom={Math.min(i * stagger.tight, 0.5)}
            >
              <span className="rc-feed__time">{fmtClock(row.date)}</span>
              {tag && (
                <span className="rc-feed__tag">
                  {color && (
                    <span
                      className="rc-feed__dot"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                  )}
                  {tag}
                </span>
              )}
              <span className="rc-feed__message">{row.message}</span>
            </motion.li>
          );
        })}
      </ol>
    </ChartCard>
  );
}
