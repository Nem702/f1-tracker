import { useCountUp } from "../motion";

interface Props {
  value: number;
  decimals?: number;
  durationSeconds?: number;
  /** Seconds to wait before the count-up starts — lets a stat tile's number
   *  begin only once its own tile has visually landed in the home cascade. */
  startDelay?: number;
  /** Custom formatter, e.g. `(n) => `${n}%``. Defaults to locale grouping. */
  formatter?: (n: number) => string;
  className?: string;
}

/** Stat-tile number that counts up to `value` on mount, and again from
 *  whatever it's currently showing whenever `value` changes (e.g. switching
 *  races). Tabular numerals so digit-width changes don't jitter the layout
 *  around it. */
export function CountUp({
  value,
  decimals = 0,
  durationSeconds,
  startDelay,
  formatter,
  className,
}: Props) {
  const current = useCountUp(value, { duration: durationSeconds, decimals, startDelay });
  const text = formatter ? formatter(current) : current.toLocaleString();
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {text}
    </span>
  );
}
