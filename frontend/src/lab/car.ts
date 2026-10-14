// One car: what it senses and how it moves.
//
// The grip limit is the point of the physics. The car can only turn as fast
// as GRIP / speed allows (constant lateral acceleration), so a tight corner
// taken at top speed runs wide into the wall. The only way through is to
// brake first, and that is what the cars have to discover.

import { distanceToWall, segmentAngle, type Track } from "./track.ts";

export const CAR = {
  /** Sim steps per sim second. Lap times are frames x DT. */
  DT: 1 / 60,
  TOP_SPEED: 220,
  ACCEL: 90,
  /** Stronger than ACCEL, as on a real car. */
  BRAKE: 260,
  /** Light drag, proportional to speed. */
  DRAG: 0.1,
  /** Max lateral acceleration: turn rate <= GRIP / speed. */
  GRIP: 450,
  /** Turn-rate ceiling at low speed (radians per sim second). */
  MAX_STEER: 3,
  SENSOR_RANGE: 200,
} as const;

/** Ray directions relative to the car's heading: -90, -45, 0, +45, +90 degrees. */
export const SENSOR_ANGLES = [-90, -45, 0, 45, 90].map((deg) => (deg * Math.PI) / 180);

export interface CarState {
  x: number;
  y: number;
  /** Radians, unbounded. */
  heading: number;
  speed: number;
  /** Nearest centreline segment, kept up to date by the sim. */
  seg: number;
}

export function spawnCar(track: Track): CarState {
  const p = track.points[0];
  return { x: p.x, y: p.y, heading: segmentAngle(track, 0), speed: 0, seg: 0 };
}

/** Fastest the car may turn at this speed (radians per sim second). */
export function turnLimit(speed: number): number {
  return Math.min(CAR.MAX_STEER, CAR.GRIP / Math.max(speed, 1e-6));
}

/** One sim step. `gas` and `steer` are the brain's outputs, -1..1;
 *  negative gas is braking. */
export function stepCar(car: CarState, gas: number, steer: number): void {
  const accel = gas >= 0 ? gas * CAR.ACCEL : gas * CAR.BRAKE;
  car.speed = Math.min(CAR.TOP_SPEED, Math.max(0, car.speed + (accel - CAR.DRAG * car.speed) * CAR.DT));
  car.heading += Math.max(-1, Math.min(1, steer)) * turnLimit(car.speed) * CAR.DT;
  car.x += Math.cos(car.heading) * car.speed * CAR.DT;
  car.y += Math.sin(car.heading) * car.speed * CAR.DT;
}

/** The 7 brain inputs: five wall distances (0 = touching, 1 = nothing within
 *  range), speed (0..1), and angle to the track direction (-1..1). */
export function senseInputs(track: Track, car: CarState): number[] {
  const inputs = SENSOR_ANGLES.map(
    (a) => distanceToWall(track, car, car.heading + a, CAR.SENSOR_RANGE) / CAR.SENSOR_RANGE,
  );
  let angle = car.heading - segmentAngle(track, car.seg);
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));
  inputs.push(car.speed / CAR.TOP_SPEED, angle / Math.PI);
  return inputs;
}
