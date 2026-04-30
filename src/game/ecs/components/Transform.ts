import type { Component } from "../Component";

export interface Transform extends Component {
  readonly type: "Transform";
  /** World position */
  x: number;
  y: number;
  z: number;
  /** Y-axis rotation in radians */
  rotationY: number;
  /** Non-uniform scale */
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

export function createTransform(
  x = 0,
  y = 0,
  z = 0,
  rotationY = 0,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
): Transform {
  return { type: "Transform", x, y, z, rotationY, scaleX, scaleY, scaleZ };
}
