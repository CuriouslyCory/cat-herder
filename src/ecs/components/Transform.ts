import type { Component } from "../Component";

export const TRANSFORM = "Transform";

export interface Transform extends Component {
  readonly type: typeof TRANSFORM;
  position: { x: number; y: number; z: number };
  /** Y-axis rotation in radians. */
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

export function createTransform(
  position = { x: 0, y: 0, z: 0 },
  rotation = { x: 0, y: 0, z: 0 },
  scale = { x: 1, y: 1, z: 1 },
): Transform {
  return { type: TRANSFORM, position, rotation, scale };
}
