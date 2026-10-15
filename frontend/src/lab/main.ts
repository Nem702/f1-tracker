// /lab: 22 cars, one full grid, learn to lap a real circuit by natural selection.
//
// Plain TypeScript, no React. Built in its own Vite pass (`vite build --mode
// lab`) so it shares no chunks with the public page: importing heroCircuits.ts
// from a third entry in the main build splits that module out and changes
// every public chunk hash.

import "./lab.css";
import { HERO_CIRCUITS, HERO_CIRCUITS_ATTRIBUTION, type HeroCircuit } from "../data/heroCircuits.ts";
import { TEAM_ORDER, type TeamSlug } from "../teams.ts";
import { randomWeights } from "./brain.ts";
import { drawChart } from "./chart.ts";
import { EVO, gridTeam, nextGeneration } from "./evolution.ts";
import { drawScene, fitCanvas } from "./render.ts";
import { createRng, type Rng } from "./rng.ts";
import {
  createGeneration,
  fitness,
  lapSeconds,
  leaderOf,
  rankByFitness,
  stepGeneration,
  type Generation,
  type Runner,
} from "./sim.ts";
import { loadBest, saveBest } from "./storage.ts";
import { bestSectors, foldBest, type SectorBests } from "./timing.ts";
import { createGridShare, createTower } from "./tower.ts";
import { buildTrack, HALF_WIDTH, parsePath, type Track } from "./track.ts";

const DEFAULT_CIRCUIT = "hu-1986";
/** The tower redraws at most this often, not every frame. */
const TOWER_INTERVAL_MS = 250;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing from lab.html`);
  return node as T;
}

const ui = {
  circuit: el<HTMLSelectElement>("circuit"),
  play: el<HTMLButtonElement>("play"),
  speeds: [...document.querySelectorAll<HTMLButtonElement>("[data-speed]")],
  newRun: el<HTMLButtonElement>("new-run"),
  mutation: el<HTMLInputElement>("mutation"),
  mutationValue: el<HTMLOutputElement>("mutation-value"),
  watch: el<HTMLButtonElement>("watch"),
  track: el<HTMLCanvasElement>("track"),
  chart: el<HTMLCanvasElement>("chart"),
  generation: el("stat-generation"),
  alive: el("stat-alive"),
  bestGen: el("stat-best-gen"),
  bestEver: el("stat-best-ever"),
  status: el("status"),
  brain: el("brain"),
  tower: el<HTMLOListElement>("tower"),
  gridShare: el("grid-share"),
  attribution: el("attribution"),
};

const trackCtx = ui.track.getContext("2d");

interface Run {
  circuit: HeroCircuit;
  track: Track;
  rng: Rng;
  gen: Generation;
  generation: number;
  /** Best lap of each finished generation, null where none lapped. */
  laps: (number | null)[];
  bestLapEver: number | null;
  /** Fastest time per sector over the run's finished generations, in frames. */
  bestSectors: SectorBests;
  /** First generation each eliminated team had no seats. */
  outSince: Partial<Record<TeamSlug, number>>;
}

let run: Run;
/** The saved brain driving alone, or null while evolving. */
let watching: { weights: number[]; gen: Generation } | null = null;
let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let speed = 1;
let mutationRate: number = EVO.MUTATION_RATE;
const updateTower = createTower(ui.tower, EVO.POPULATION);
const updateGridShare = createGridShare(ui.gridShare);
let towerDrawnAt = -Infinity;

function startRun(circuit: HeroCircuit): void {
  const track = buildTrack(parsePath(circuit.path), HALF_WIDTH);
  const rng = createRng(crypto.getRandomValues(new Uint32Array(1))[0]);
  const seats = Array.from({ length: EVO.POPULATION }, (_, i) => ({
    weights: randomWeights(rng),
    team: gridTeam(i),
  }));
  run = {
    circuit,
    track,
    rng,
    gen: createGeneration(track, seats),
    generation: 1,
    laps: [],
    bestLapEver: null,
    bestSectors: [null, null, null],
    outSince: {},
  };
  watching = null;
  ui.status.textContent = "";
  updateWatchButton();
  drawChart(ui.chart, run.laps);
  showGridShare();
}

/** Grid share only changes between generations. */
function showGridShare(): void {
  const teams = run.gen.runners.map((r) => r.team);
  for (const slug of TEAM_ORDER) {
    if (!teams.includes(slug) && run.outSince[slug] === undefined) run.outSince[slug] = run.generation;
  }
  updateGridShare(teams, run.outSince);
}

function endGeneration(): void {
  const { track } = run;
  const ranked = rankByFitness(run.gen, track.length);
  const best = ranked[0];
  const lapS = best.lapFrames === null ? null : lapSeconds(best.lapFrames);
  run.laps.push(lapS);
  run.bestSectors = foldBest(run.bestSectors, bestSectors(run.gen.runners));
  if (lapS !== null && (run.bestLapEver === null || lapS < run.bestLapEver)) run.bestLapEver = lapS;

  const score = fitness(best, track.length);
  const saved = loadBest(run.circuit.id);
  if (!saved || score > saved.fitness) {
    if (saveBest(run.circuit.id, { weights: [...best.weights], fitness: score, lapS })) {
      updateWatchButton();
    } else {
      ui.status.textContent = "This browser isn't allowing storage, so the best brain can't be saved.";
    }
  }

  const next = nextGeneration(
    // Every evolving car has a team (seated by startRun or nextGeneration);
    // only the replayed saved brain has none, and it never evolves.
    ranked.map((r) => ({ weights: r.weights, team: r.team as TeamSlug })),
    run.rng,
    mutationRate,
  );
  run.gen = createGeneration(track, next);
  run.generation++;
  drawChart(ui.chart, run.laps);
  showGridShare();
}

function step(): void {
  if (watching) {
    stepGeneration(run.track, watching.gen);
    if (watching.gen.done) watching.gen = createGeneration(run.track, [{ weights: watching.weights, team: null }]);
    return;
  }
  stepGeneration(run.track, run.gen);
  if (run.gen.done) endGeneration();
}

function frame(): void {
  if (!paused) for (let i = 0; i < speed; i++) step();

  const gen = watching ? watching.gen : run.gen;
  const leader = leaderOf(gen, run.track.length);
  if (trackCtx) {
    fitCanvas(ui.track);
    drawScene(trackCtx, run.track, gen.runners, leader);
  }
  updateStats();
  updateBrain(leader);
  const now = performance.now();
  if (now - towerDrawnAt >= TOWER_INTERVAL_MS) {
    // The tower always shows the evolving generation (frozen while watching).
    updateTower(run.gen.runners, run.track.length, run.bestSectors);
    towerDrawnAt = now;
  }
  requestAnimationFrame(frame);
}

function formatLap(s: number | null): string {
  return s === null ? "—" : `${s.toFixed(2)} sim s`;
}

function updateStats(): void {
  const { runners } = run.gen;
  const alive = runners.filter((r) => !r.done).length;
  const laps = runners.flatMap((r) => (r.lapFrames === null ? [] : [lapSeconds(r.lapFrames)]));
  ui.generation.textContent = String(run.generation);
  ui.alive.textContent = `${alive} / ${laps.length}`;
  if (laps.length > 0) {
    ui.bestGen.textContent = formatLap(Math.min(...laps));
  } else {
    const furthest = Math.max(...runners.map((r) => r.maxProgress));
    ui.bestGen.textContent = `${((furthest / run.track.length) * 100).toFixed(1)}% of a lap`;
  }
  ui.bestEver.textContent = formatLap(run.bestLapEver);
}

// Leader's brain: one row per input and output, built once, updated per frame.
const BRAIN_ROWS: { label: string; signed: boolean }[] = [
  { label: "Ray −90°", signed: false },
  { label: "Ray −45°", signed: false },
  { label: "Ray 0°", signed: false },
  { label: "Ray +45°", signed: false },
  { label: "Ray +90°", signed: false },
  { label: "Speed", signed: false },
  { label: "Angle to track", signed: true },
  { label: "Gas / brake", signed: true },
  { label: "Steer", signed: true },
];

const brainCells = BRAIN_ROWS.map(({ label }, i) => {
  if (i === 7) {
    const heading = document.createElement("h3");
    heading.textContent = "Outputs";
    ui.brain.append(heading);
  }
  const row = document.createElement("div");
  row.className = "brain-row";
  const name = document.createElement("span");
  name.textContent = label;
  const bar = document.createElement("span");
  bar.className = "bar";
  const fill = document.createElement("span");
  fill.className = "fill";
  bar.append(fill);
  const value = document.createElement("span");
  value.className = "value";
  row.append(name, bar, value);
  ui.brain.append(row);
  return { fill, value };
});

function updateBrain(leader: Runner | null): void {
  const values = leader ? [...leader.inputs, leader.gas, leader.steer] : [];
  brainCells.forEach(({ fill, value }, i) => {
    const v = values[i] ?? 0;
    if (BRAIN_ROWS[i].signed) {
      // Bar grows from the centre: right for positive, left for negative.
      fill.style.left = `${50 + Math.min(0, v) * 50}%`;
      fill.style.width = `${Math.abs(v) * 50}%`;
    } else {
      fill.style.left = "0";
      fill.style.width = `${v * 100}%`;
    }
    fill.classList.toggle("braking", i === 7 && v < 0);
    value.textContent = leader ? v.toFixed(2) : "";
  });
}

function updateWatchButton(): void {
  ui.watch.textContent = watching ? "Back to evolution" : "Watch best saved";
  ui.watch.disabled = !watching && loadBest(run.circuit.id) === null;
}

function updatePlayButton(): void {
  ui.play.textContent = paused ? "Play" : "Pause";
}

// Controls.
for (const c of [...HERO_CIRCUITS].sort((a, b) => a.round2026 - b.round2026)) {
  ui.circuit.add(new Option(c.name, c.id, false, c.id === DEFAULT_CIRCUIT));
}
ui.circuit.addEventListener("change", () => {
  const circuit = HERO_CIRCUITS.find((c) => c.id === ui.circuit.value);
  if (circuit) startRun(circuit);
});

ui.play.addEventListener("click", () => {
  paused = !paused;
  updatePlayButton();
});

for (const button of ui.speeds) {
  button.addEventListener("click", () => {
    speed = Number(button.dataset.speed);
    for (const b of ui.speeds) b.setAttribute("aria-pressed", String(b === button));
  });
}

ui.newRun.addEventListener("click", () => startRun(run.circuit));

ui.mutation.value = String(Math.round(mutationRate * 100));
const showMutation = () => {
  mutationRate = Number(ui.mutation.value) / 100;
  ui.mutationValue.textContent = `${ui.mutation.value}%`;
};
ui.mutation.addEventListener("input", showMutation);
showMutation();

ui.watch.addEventListener("click", () => {
  if (watching) {
    watching = null;
    ui.status.textContent = "";
  } else {
    const saved = loadBest(run.circuit.id);
    if (saved) {
      watching = {
        weights: saved.weights,
        gen: createGeneration(run.track, [{ weights: saved.weights, team: null }]),
      };
      ui.status.textContent = `Watching the best saved brain for ${run.circuit.name}${
        saved.lapS === null ? " (no full lap yet)" : `: ${formatLap(saved.lapS)}`
      }.`;
    }
  }
  updateWatchButton();
});

ui.attribution.textContent = HERO_CIRCUITS_ATTRIBUTION;

startRun(HERO_CIRCUITS.find((c) => c.id === DEFAULT_CIRCUIT) ?? HERO_CIRCUITS[0]);
updatePlayButton();
requestAnimationFrame(frame);
