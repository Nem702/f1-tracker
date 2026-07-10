import { useEffect, useRef, useState } from "react";

/**
 * Watches a fixed list of section ids and reports whichever is currently
 * most prominent in the viewport, syncing `location.hash` to match via
 * `history.replaceState` — never `pushState`, so scrolling past a dozen
 * sections doesn't spam browser history (an explicit nav click is a real
 * navigation and pushes its own entry; see Navbar.tsx).
 *
 * `rootMargin` biases the "trigger band" toward the upper third of the
 * viewport (standard scroll-spy shape: a section counts as "current" once
 * its top has cleared that band, not only once it's dead center), and the
 * "most-visible-wins" comparison across all observed sections resolves the
 * tall-hero-vs-short-section edge cases a single-section threshold check
 * gets wrong.
 */
export function useScrollSpy<T extends string>(sectionIds: readonly T[], initial: T): T {
  const [active, setActive] = useState(initial);
  const activeRef = useRef(initial);
  const ratios = useRef(new Map<string, number>());

  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.current.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let bestId = activeRef.current;
        let bestRatio = 0;
        for (const id of sectionIds) {
          const ratio = ratios.current.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestRatio > 0 && bestId !== activeRef.current) {
          activeRef.current = bestId;
          setActive(bestId);
          history.replaceState(null, "", `#${bestId}`);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-15% 0px -55% 0px" },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // sectionIds is the module-level SECTIONS constant — stable identity,
    // this only ever runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionIds]);

  return active;
}
