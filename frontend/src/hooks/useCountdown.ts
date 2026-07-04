import { useEffect, useState } from "react";

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True once the target has been reached — callers use this to trigger a refetch. */
  reached: boolean;
}

function partsFor(targetMs: number, now: number): CountdownParts {
  const remaining = Math.max(0, targetMs - now);
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    reached: remaining === 0,
  };
}

/** Ticks once a second and reports the remaining time to `targetIso`, purely
 *  from the local clock — no network involved between fetches. Pass null
 *  while there's no target yet (nothing to tick toward). */
export function useCountdown(targetIso: string | null): CountdownParts | null {
  const targetMs = targetIso ? new Date(targetIso).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetMs === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  if (targetMs === null) return null;
  return partsFor(targetMs, now);
}
