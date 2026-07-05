import type { DriverPair, DriverRef } from "../teams";
import { useTheme } from "../hooks/useTheme";

interface ChipProps {
  driver: DriverRef;
  /** The driver's resolved slot color (theme.driver1/driver2 by pair position). */
  color: string;
  /** Trailing text, e.g. "faster" for the delta legend. */
  suffix?: string;
  /** Dot + acronym only — the tire-strategy row gutter. */
  compact?: boolean;
}

/** The one place driver identity renders: color dot + acronym (+ last name).
 *  Charts' legends and the tire-strategy row labels all compose this, so a
 *  pair switch re-labels every chart from a single component. */
export function DriverChip({ driver, color, suffix, compact = false }: ChipProps) {
  return (
    <span className="driver-chip">
      <span
        className="driver-chip__dot"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="driver-chip__acr">{driver.acronym}</span>
      {!compact && <span className="driver-chip__name">{driver.lastName}</span>}
      {suffix && <span className="driver-chip__suffix">{suffix}</span>}
    </span>
  );
}

interface PairLegendProps {
  pair: DriverPair | null;
  suffix?: string;
}

/** Legend for the five pair charts: two DriverChips in the shared legend
 *  list markup. Colors come from the same theme slots the marks use, so the
 *  legend can never disagree with the chart. */
export function PairLegend({ pair, suffix }: PairLegendProps) {
  const theme = useTheme();
  if (!pair) return null;
  const colors = [theme.driver1, theme.driver2];
  return (
    <ul className="legend">
      {pair.map((driver, i) => (
        <li key={driver.number} className="legend__item">
          <DriverChip driver={driver} color={colors[i]} suffix={suffix} />
        </li>
      ))}
    </ul>
  );
}
