// One car: what it senses and how it moves. Metres, seconds, m/s.
//
// The grip limit is the point of the physics. The car can only turn as fast
// as its lateral grip allows at that speed, so a tight corner taken at top
// speed runs wide into the wall. The only way through is to brake first, and
// that is what the cars have to discover.
//
// The numbers are task 23's F1-like car: 340 km/h, 14 m/s² of drive fading
// with drag, braking 2.5 g plus aero (5 g at top speed), cornering 1.6 g plus
// aero (5 g at 250 km/h) times one global GRIP_SCALE. Braking and cornering
// are independent: braking never costs cornering grip.

import { distanceToWall, segmentAngle, type Point, type Track } from "./track.ts";

const G = 9.81;
const TOP_SPEED = 340 / 3.6;
const ACCEL = 14;

export const CAR = {
  /** Sim steps per second. */
  DT: 1 / 60,
  TOP_SPEED,
  /** Drive at full gas from standstill, m/s². */
  ACCEL,
  /** Drag deceleration = DRAG·v², sized so full gas balances it at TOP_SPEED. */
  DRAG: ACCEL / TOP_SPEED ** 2,
  /** Braking on top of drag: BRAKE + BRAKE_AERO·v², 5 g in all at top speed. */
  BRAKE: 2.5 * G,
  BRAKE_AERO: (5 * G - 2.5 * G - ACCEL) / TOP_SPEED ** 2,
  /** Cornering: GRIP_SCALE·(LAT + LAT_AERO·v²), 5 g at 250 km/h at scale 1. */
  LAT: 1.6 * G,
  LAT_AERO: (5 * G - 1.6 * G) / (250 / 3.6) ** 2,
  /** One value for every circuit, calibrated so the Hungaroring centreline lap
   *  at the grip limit equals the 2026 pole (reference.ts gripFor; checked in
   *  scripts/lab.test.ts). About 2x a real car's grip: a real driver uses the
   *  whole road, the centreline doesn't. */
  GRIP_SCALE: 1.913,
  /** Turn-rate ceiling at low speed (radians per second). */
  MAX_STEER: 3,
} as const;

/** Ray directions relative to the car's heading: -90, -45, 0, +45, +90 degrees. */
export const SENSOR_ANGLES = [-90, -45, 0, 45, 90].map((deg) => (deg * Math.PI) / 180);
/** Range of each ray in metres. Side and diagonal rays at 93 m (task 23);
 *  the forward ray sees further so there is room to brake from 340 km/h. */
export const SENSOR_RANGES = [93, 93, 200, 93, 93];

export interface CarState extends Point {
  /** Radians, unbounded. */
  heading: number;
  /** m/s. */
  speed: number;
  /** Nearest centreline segment, kept up to date by the sim. */
  seg: number;
}

/** On the start/finish line, pointing along the track, at `speed` m/s. */
export function spawnCar(track: Track, speed: number): CarState {
  const p = track.points[0];
  return { x: p.x, y: p.y, heading: segmentAngle(track, 0), speed, seg: 0 };
}

/** Lateral grip at this speed, m/s². */
export function latAccel(speed: number): number {
  return CAR.GRIP_SCALE * (CAR.LAT + CAR.LAT_AERO * speed * speed);
}

/** Fastest the car may turn at this speed (radians per second). */
export function turnLimit(speed: number): number {
  return Math.min(CAR.MAX_STEER, latAccel(speed) / Math.max(speed, 1e-6));
}

/** Full-gas acceleration net of drag, m/s². */
export function driveAccel(speed: number): number {
  return CAR.ACCEL - CAR.DRAG * speed * speed;
}

/** Full-brake deceleration including drag, m/s² (positive). */
export function brakeDecel(speed: number): number {
  return CAR.BRAKE + (CAR.BRAKE_AERO + CAR.DRAG) * speed * speed;
}

/** One sim step. `gas` and `steer` are the brain's outputs, -1..1;
 *  negative gas is braking. */
export function stepCar(car: CarState, gas: number, steer: number): void {
  const v = car.speed;
  const push = gas >= 0 ? gas * CAR.ACCEL : gas * (CAR.BRAKE + CAR.BRAKE_AERO * v * v);
  car.speed = Math.min(CAR.TOP_SPEED, Math.max(0, v + (push - CAR.DRAG * v * v) * CAR.DT));
  car.heading += Math.max(-1, Math.min(1, steer)) * turnLimit(car.speed) * CAR.DT;
  car.x += Math.cos(car.heading) * car.speed * CAR.DT;
  car.y += Math.sin(car.heading) * car.speed * CAR.DT;
}

/** The 7 brain inputs: five wall distances (0 = touching, 1 = nothing within
 *  that ray's range), speed (0..1), and angle to the track direction (-1..1). */
export function senseInputs(track: Track, car: CarState): number[] {
  const inputs = SENSOR_ANGLES.map(
    (a, i) => distanceToWall(track, car, car.heading + a, SENSOR_RANGES[i]) / SENSOR_RANGES[i],
  );
  let angle = car.heading - segmentAngle(track, car.seg);
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  inputs.push(car.speed / CAR.TOP_SPEED, angle / Math.PI);
  return inputs;
}
