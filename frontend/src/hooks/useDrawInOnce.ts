import { useEffect, useRef } from "react";
import { CHART_DRAW_IN } from "../motion";

/** Recharts animation props for a chart's first meaningful paint only.
 *  `ready` should be true once the chart has real data to draw. Per
 *  CHART_DRAW_IN's own guidance: isAnimationActive replays on every data
 *  change Recharts sees, so switching races would re-run the draw-in on
 *  every refetch — this flips it off after the first time `ready` is true. */
export function useDrawInOnce(ready: boolean): typeof CHART_DRAW_IN | { isAnimationActive: false } {
  const hasAnimated = useRef(false);
  const shouldAnimate = ready && !hasAnimated.current;

  useEffect(() => {
    if (ready) hasAnimated.current = true;
  }, [ready]);

  return shouldAnimate ? CHART_DRAW_IN : { isAnimationActive: false };
}
