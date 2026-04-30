import type { Component } from "../Component";

export interface Velocity extends Component {
  readonly type: "Velocity";
  /** Velocity in units per second */
  dx: number;
  dy: number;
  dz: number;
}

export function createVelocity(dx = 0, dy = 0, dz = 0): Velocity {
  return { type: "Velocity", dx, dy, dz };
}
