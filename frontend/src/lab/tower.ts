// The timing tower (one row per car, F1-TV style) and the grid-share strip.
// Both build their DOM once and only update text, classes and order after.

import { teamSwatch } from "../theme.ts";
import { TEAM_CODES, TEAM_NAMES, TEAM_ORDER, type TeamSlug } from "../teams.ts";
import { lapSeconds, type Runner } from "./sim.ts";
import { bestSectors, foldBest, sectorColour, sectorTimes, statusLabel, towerOrder, type SectorBests } from "./timing.ts";

const SECTOR_CLASSES = ["purple", "green", "yellow"];

interface Row {
  li: HTMLLIElement;
  pos: HTMLSpanElement;
  chip: HTMLSpanElement;
  car: HTMLSpanElement;
  sectors: HTMLSpanElement[];
  status: HTMLSpanElement;
}

function span(className: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = className;
  return s;
}

/** `list` is the tower's <ol>; it gets one row per seat. */
export function createTower(list: HTMLOListElement, seats: number) {
  const rows: Row[] = Array.from({ length: seats }, () => {
    const li = document.createElement("li");
    const row: Row = {
      li,
      pos: span("pos"),
      chip: span("chip"),
      car: span("car"),
      sectors: [span("sector"), span("sector"), span("sector")],
      status: span("status"),
    };
    li.append(row.pos, row.chip, row.car, ...row.sectors, row.status);
    return row;
  });

  /** `runBest` is the run's sector bests from finished generations; this
   *  generation's live bests are folded in here, so purple shows mid-lap. */
  return function update(runners: Runner[], length: number, runBest: SectorBests): void {
    const genBest = bestSectors(runners);
    const best = foldBest(runBest, genBest);
    const seatOf = new Map(runners.map((r, i) => [r, i]));
    towerOrder(runners).forEach((r, place) => {
      const seat = seatOf.get(r) ?? 0;
      const row = rows[seat];
      row.pos.textContent = String(place + 1);
      row.chip.style.background = r.team ? teamSwatch("dark", r.team) : "";
      row.car.textContent = `${r.team ? TEAM_CODES[r.team] : "—"} ${seat + 1}`;
      row.li.title = r.team ? TEAM_NAMES[r.team] : "";
      sectorTimes(r).forEach((frames, i) => {
        const cell = row.sectors[i];
        cell.classList.remove(...SECTOR_CLASSES);
        if (frames === null) {
          cell.textContent = "";
        } else {
          cell.textContent = lapSeconds(frames).toFixed(2);
          cell.classList.add(sectorColour(frames, genBest[i], best[i]));
        }
      });
      row.status.textContent = statusLabel(r, length);
      row.li.classList.toggle("stopped", r.done && r.lapS === null);
      list.append(row.li);
    });
  };
}

/** `root` gets a bar split by seats per team, and a chip per team below it. */
export function createGridShare(root: HTMLElement) {
  const bar = span("share-bar");
  const teams = document.createElement("ul");
  teams.className = "share-teams";
  const parts = TEAM_ORDER.map((slug) => {
    const segment = span("share-segment");
    segment.style.background = teamSwatch("dark", slug);
    segment.title = TEAM_NAMES[slug];
    const item = document.createElement("li");
    item.dataset.team = slug;
    const dot = span("chip");
    dot.style.background = teamSwatch("dark", slug);
    const label = span("");
    item.append(dot, label);
    bar.append(segment);
    teams.append(item);
    return { slug, segment, item, label };
  });
  root.append(bar, teams);

  return function update(teamOf: (TeamSlug | null)[], outSince: Partial<Record<TeamSlug, number>>): void {
    for (const { slug, segment, item, label } of parts) {
      const count = teamOf.filter((t) => t === slug).length;
      segment.style.flexGrow = String(count);
      segment.hidden = count === 0;
      item.dataset.count = String(count);
      item.classList.toggle("out", count === 0);
      label.textContent = count > 0 ? `${TEAM_CODES[slug]} ${count}` : `${TEAM_CODES[slug]} out since gen ${outSince[slug] ?? "?"}`;
    }
  };
}
