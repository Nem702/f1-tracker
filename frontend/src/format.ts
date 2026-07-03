// Number/date formatting helpers shared by charts, tooltips, and table views.

/** 76.178 → "1:16.178" (lap times); pass digits=1 for axis ticks ("1:16.2"). */
export function fmtLapTime(seconds: number | null, digits = 3): string {
  if (seconds === null || Number.isNaN(seconds)) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  const s = secs.toFixed(digits).padStart(digits > 0 ? digits + 3 : 2, "0");
  return `${mins}:${s}`;
}

/** 0.342 → "+0.342s", -1.2 → "−1.200s" (real minus sign, reads better). */
export function fmtDelta(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return "—";
  const sign = seconds > 0 ? "+" : seconds < 0 ? "−" : "±";
  return `${sign}${Math.abs(seconds).toFixed(3)}s`;
}

export function fmtSeconds(seconds: number | null, digits = 1): string {
  if (seconds === null || Number.isNaN(seconds)) return "—";
  return `${seconds.toFixed(digits)}s`;
}

/** ISO timestamp → local wall-clock "14:03" for time axes and event feeds. */
export function fmtClock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ISO timestamp → "Mar 7, 2026" for the race selector. */
export function fmtDate(iso: string | null): string {
  if (!iso) return "date unknown";
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
