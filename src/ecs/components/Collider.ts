import type { Component } from "../Component";

export const COLLIDER = "Collider";

export type ColliderShape = "box" | "sphere" | "cylinder";

export interface Collider extends Component {
  readonly type: typeof COLLIDER;
  shape: ColliderShape;
  size: { x: number; y: number; z: number };
  isStatic: boolean;
  isTrigger: boolean;
  /** Bitmask: which layers this body belongs to. */
  collisionLayer: number;
  /** Bitmask: which layers this body collides with. */
  collisionMask: number;
}

export function createCollider(
  shape: ColliderShape,
  size: { x: number; y: number; z: number },
  options: Partial<Pick<Collider, "isStatic" | "isTrigger" | "collisionLayer" | "collisionMask">> = {},
): Collider {
  return {
    type: COLLIDER,
    shape,
    size,
    isStatic: options.isStatic ?? false,
    isTrigger: options.isTrigger ?? false,
    collisionLayer: options.collisionLayer ?? 1,
    collisionMask: options.collisionMask ?? 1,
  };
}
