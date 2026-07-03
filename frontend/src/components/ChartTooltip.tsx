export interface TooltipRow {
  label: string;
  value: string;
  color?: string; // short line-key stroke; omit for context rows (weather extras)
}

/**
 * Shared tooltip shell for every chart. Value leads (strong, high-contrast),
 * label follows — the reader already knows the series and wants the number.
 * Series names come from API data, so they render via JSX text (never HTML).
 */
export function ChartTooltip({
  title,
  rows,
}: {
  title: string;
  rows: TooltipRow[];
}) {
  return (
    <div className="viz-tooltip">
      <div className="viz-tooltip__title">{title}</div>
      {rows.map((row, i) => (
        <div key={i} className="viz-tooltip__row">
          {row.color && (
            <span
              className="viz-tooltip__key"
              style={{ backgroundColor: row.color }}
              aria-hidden="true"
            />
          )}
          <span className="viz-tooltip__value">{row.value}</span>
          <span className="viz-tooltip__label">{row.label}</span>
        </div>
      ))}
    </div>
  );
}
