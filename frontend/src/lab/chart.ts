// Best lap per generation, as a plain line on its own small canvas.
// Generations without a lap are gaps.

import { fitCanvas } from "./render.ts";
import { formatLap } from "./timing.ts";

export function drawChart(canvas: HTMLCanvasElement, laps: (number | null)[]): void {
  fitCanvas(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#16161a";
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${11 * dpr}px system-ui, sans-serif`;
  ctx.fillStyle = "#a0a0a8";

  const times = laps.filter((t): t is number => t !== null);
  if (times.length === 0) {
    ctx.fillText("No lap yet", 8 * dpr, 18 * dpr);
    return;
  }

  const lo = Math.min(...times);
  const hi = Math.max(...times);
  const span = Math.max(hi - lo, 0.5);
  const pad = { l: 8 * dpr, r: 8 * dpr, t: 22 * dpr, b: 20 * dpr };
  const x = (i: number) => pad.l + (laps.length > 1 ? (i / (laps.length - 1)) * (width - pad.l - pad.r) : 0);
  // Faster laps sit lower, so improvement reads as a line going down.
  const y = (t: number) => height - pad.b - ((t - lo) / span) * (height - pad.t - pad.b);

  ctx.fillText(formatLap(hi), pad.l, 14 * dpr);
  ctx.fillText(formatLap(lo), pad.l, height - 6 * dpr);
  const genLabel = `gen ${laps.length}`;
  ctx.fillText(genLabel, width - pad.r - ctx.measureText(genLabel).width, height - 6 * dpr);

  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  let penDown = false;
  laps.forEach((t, i) => {
    if (t === null) {
      penDown = false;
      return;
    }
    if (penDown) ctx.lineTo(x(i), y(t));
    else ctx.moveTo(x(i), y(t));
    penDown = true;
  });
  ctx.stroke();

  // A lone point between gaps would draw nothing, so mark every lap.
  ctx.fillStyle = "#ffd166";
  laps.forEach((t, i) => {
    if (t !== null) ctx.fillRect(x(i) - dpr, y(t) - dpr, 2 * dpr, 2 * dpr);
  });
}
