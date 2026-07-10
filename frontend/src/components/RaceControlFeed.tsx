import { useEffect, useMemo, useRef, useState } from "react";
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

/** A race logs 200+ messages and the interesting ones (safety cars, red
 *  flags, penalties) drown in routine sector yellows — these filters make
 *  them reachable. Categories overlap deliberately (an SC deployment can
 *  carry a flag too); each filter answers its own question. */
type RcFilter = "all" | "flags" | "safety" | "stewarding";

const FILTERS: { id: RcFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "flags", label: "Flags" },
  { id: "safety", label: "Safety car" },
  { id: "stewarding", label: "Stewarding" },
];

function matchesFilter(row: RaceControlRow, filter: RcFilter): boolean {
  if (filter === "all") return true;
  const message = row.message?.toUpperCase() ?? "";
  const category = row.category?.toUpperCase() ?? "";
  switch (filter) {
    case "flags":
      return row.flag != null;
    case "safety":
      return (
        category.includes("SAFETYCAR") ||
        category.includes("SAFETY CAR") ||
        /SAFETY CAR|VIRTUAL|VSC/.test(message)
      );
    case "stewarding":
      return /PENALTY|INVESTIGAT|WARNING|DELETED|NOTED|REPRIMAND/.test(message);
  }
}

export function RaceControlFeed({ raceControl, loading, error }: Props) {
  const theme = useTheme();
  const [filter, setFilter] = useState<RcFilter>("all");

  const filtered = useMemo(
    () => raceControl.filter((row) => matchesFilter(row, filter)),
    [raceControl, filter],
  );

  // First-reveal cascade only, same semantics as useDrawInOnce: rows re-key
  // on a race switch and shouldn't replay their entrance on every refetch
  // (or on a filter change).
  const hasAnimated = useRef(false);
  const shouldAnimate = raceControl.length > 0 && !hasAnimated.current;
  useEffect(() => {
    if (raceControl.length > 0) hasAnimated.current = true;
  }, [raceControl.length]);

  const subtitle =
    filter === "all"
      ? `${raceControl.length} messages — flags, safety cars, penalties.`
      : `${filtered.length} of ${raceControl.length} messages shown.`;

  return (
    <ChartCard
      title="Race control"
      subtitle={subtitle}
      loading={loading}
      error={error}
      hasData={raceControl.length > 0}
      emptyText="No race control messages for this race."
    >
      <div className="rc-feed__filters" role="group" aria-label="Filter race control messages">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              className={`btn-pill rc-feed__filter${active ? " btn-pill--accent" : ""}`}
              aria-pressed={active}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <p className="rc-feed__none">No matching messages in this race.</p>
      ) : (
        <ol className="rc-feed">
          {filtered.map((row, i) => {
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
      )}
    </ChartCard>
  );
}
