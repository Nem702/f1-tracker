import type { RaceControlRow } from "../api/types";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../theme";
import { fmtClock } from "../format";
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
        {raceControl.map((row) => {
          const color = flagColor(row, theme);
          const tag = row.flag ?? row.category;
          return (
            <li key={row.id} className="rc-feed__item">
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
            </li>
          );
        })}
      </ol>
    </ChartCard>
  );
}
