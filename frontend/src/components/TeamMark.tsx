import type { CSSProperties } from "react";
import type { TeamSlug } from "../teams";
import { TEAM_CODES } from "../teams";
import { BADGE_INK, BADGE_PLATE, BADGE_RING } from "../theme";
import { useMode } from "../hooks/useTheme";

interface Props {
  slug: TeamSlug;
}

/** Typographic team mark: the three-letter code (TEAM_CODES — never
 *  hardcoded) on a fixed-size accent plate. Tier 2b, not Tier 3 — there are
 *  no glyph paths here and none should be added; see
 *  docs/handoff/03-teammark.md for why fixed-colour drawn marks were
 *  rejected. Plate colors (BADGE_PLATE/BADGE_INK) are mode-independent by
 *  design, only the hairline ring (BADGE_RING) is per mode.
 *
 *  Always aria-hidden: every placement carries the team name in adjacent
 *  text, so the mark is decorative, not the accessible label. */
export function TeamMark({ slug }: Props) {
  const mode = useMode();
  const style: CSSProperties = {
    background: BADGE_PLATE[slug],
    color: BADGE_INK[slug],
    boxShadow: `inset 0 0 0 1px ${BADGE_RING[mode]}`,
  };
  return (
    <span className="team-mark" style={style} aria-hidden="true">
      {TEAM_CODES[slug]}
    </span>
  );
}
