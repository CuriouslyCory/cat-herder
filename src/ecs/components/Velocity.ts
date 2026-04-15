import type { Component } from "../Component";

export const VELOCITY = "Velocity";

export interface Velocity extends Component {
  readonly type: typeof VELOCITY;
  /** Units per second along each axis. */
  dx: number;
  dy: number;
  dz: number;
}

export function createVelocity(dx = 0, dy = 0, dz = 0): Velocity {
  return { type: VELOCITY, dx, dy, dz };
}
