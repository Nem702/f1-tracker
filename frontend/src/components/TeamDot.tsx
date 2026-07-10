import { useMode } from "../hooks/useTheme";
import { teamSwatch } from "../theme";
import { teamSlugFromName } from "../teams";

interface Props {
  teamName: string | null | undefined;
}

/** Team-color identity dot for a driver/team name in tables and header
 *  payloads. Tracked teams wear their validated swatch (per mode);
 *  anything else keeps .team-dot's muted default — the colored dots are
 *  the teams with telemetry in the app. */
export function TeamDot({ teamName }: Props) {
  const mode = useMode();
  const slug = teamSlugFromName(teamName ?? null);
  return (
    <span
      className="team-dot"
      style={slug ? { background: teamSwatch(mode, slug) } : undefined}
      aria-hidden="true"
    />
  );
}
