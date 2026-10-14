// Drawing the track and cars on the main canvas. Everything is drawn in the
// 0-1000 box units the sim uses, under one transform that fits the circuit.

import { CAR, SENSOR_ANGLES } from "./car.ts";
import type { Runner } from "./sim.ts";
import { segmentAngle, type Track } from "./track.ts";

const COLORS = {
  background: "#16161a",
  asphalt: "#34343b",
  wall: "#8a8a93",
  startLine: "#f5f5f5",
  car: "rgba(138, 180, 248, 0.85)",
  carStopped: "rgba(138, 180, 248, 0.2)",
  leader: "#ffd166",
  ray: "rgba(255, 209, 102, 0.45)",
  brake: "#ff4d4d",
};

/** Matches the canvas's drawing buffer to its on-screen size. */
export function fitCanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  track: Track,
  runners: Runner[],
  leader: Runner | null,
): void {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Fit the centreline's bounding box, plus the track width and a margin,
  // into the canvas.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of track.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const margin = track.halfWidth + 20;
  const scale = Math.min(width / (maxX - minX + 2 * margin), height / (maxY - minY + 2 * margin));
  const ox = (width - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (height - (maxY - minY) * scale) / 2 - minY * scale;
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  const px = 1 / scale; // one device pixel, in box units

  // The centreline stroked at full track width with round joins is exactly
  // the track (everything within halfWidth of it). Stroking it slightly
  // wider first leaves that edge, the wall, as a thin outline.
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = COLORS.wall;
  ctx.lineWidth = track.halfWidth * 2 + 3 * px;
  strokeLoop(ctx, track.points);
  ctx.strokeStyle = COLORS.asphalt;
  ctx.lineWidth = track.halfWidth * 2;
  strokeLoop(ctx, track.points);

  // Start/finish line, square across the first segment.
  const start = track.points[0];
  const across = segmentAngle(track, 0) + Math.PI / 2;
  const hx = Math.cos(across) * track.halfWidth;
  const hy = Math.sin(across) * track.halfWidth;
  ctx.strokeStyle = COLORS.startLine;
  ctx.lineWidth = 3 * px;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(start.x - hx, start.y - hy);
  ctx.lineTo(start.x + hx, start.y + hy);
  ctx.stroke();

  for (const r of runners) {
    if (r !== leader) drawCar(ctx, r, r.done ? COLORS.carStopped : COLORS.car);
  }

  if (leader) {
    ctx.strokeStyle = COLORS.ray;
    ctx.lineWidth = 1.5 * px;
    SENSOR_ANGLES.forEach((a, i) => {
      const d = leader.inputs[i] * CAR.SENSOR_RANGE;
      ctx.beginPath();
      ctx.moveTo(leader.x, leader.y);
      ctx.lineTo(leader.x + Math.cos(leader.heading + a) * d, leader.y + Math.sin(leader.heading + a) * d);
      ctx.stroke();
    });
    ctx.fillStyle = COLORS.brake;
    for (const b of leader.brakes) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5 * px, 0, Math.PI * 2);
      ctx.fill();
    }
    drawCar(ctx, leader, COLORS.leader);
  }
}

function strokeLoop(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]): void {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
}

function drawCar(ctx: CanvasRenderingContext2D, r: Runner, color: string): void {
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.heading);
  ctx.fillStyle = color;
  ctx.fillRect(-6, -3, 12, 6);
  ctx.restore();
}
