import type { PreviousRaceRecap as PreviousRaceRecapData } from "../api/types";
import { SectionHeading } from "./SectionHeading";
import { PreviousRaceRecap } from "./PreviousRaceRecap";
import { Reveal } from "./Reveal";

interface Props {
  recap: PreviousRaceRecapData | null;
  loading: boolean;
}

/** #last-race section body: the one canonical previous-race recap card
 *  (it used to exist twice — a compact Overview version and a full Race
 *  Weekend version — now there's just this). Reads from the same
 *  /api/race-weekend payload #next-race does. */
export function LastRace({ recap, loading }: Props) {
  return (
    <>
      <SectionHeading eyebrow="Last race" title={recap?.race_name ?? "Most recent race"} />
      {!recap && !loading && (
        <p className="section-empty">No completed race found yet this season.</p>
      )}
      {recap && (
        <Reveal variant="wipe">
          <PreviousRaceRecap recap={recap} />
        </Reveal>
      )}
    </>
  );
}
