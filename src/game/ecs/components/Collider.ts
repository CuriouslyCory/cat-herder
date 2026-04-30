import type { Component } from "../Component";

export type ColliderShape = "circle" | "box";

export interface Collider extends Component {
  readonly type: "Collider";
  shape: ColliderShape;
  /** Radius for circle; half-extent on each axis for box */
  size: number;
  /** Static bodies are never moved by the physics/collision solver */
  isStatic: boolean;
  /** Triggers detect overlap but produce no physical response */
  isTrigger: boolean;
  /** Bitmask — which layer this collider belongs to */
  collisionLayer: number;
  /** Bitmask — which layers this collider interacts with */
  collisionMask: number;
}

export function createCollider(
  shape: ColliderShape = "circle",
  size = 0.4,
  options: Partial<
    Pick<Collider, "isStatic" | "isTrigger" | "collisionLayer" | "collisionMask">
  > = {},
): Collider {
  return {
    type: "Collider",
    shape,
    size,
    isStatic: options.isStatic ?? false,
    isTrigger: options.isTrigger ?? false,
    collisionLayer: options.collisionLayer ?? 1,
    collisionMask: options.collisionMask ?? 1,
  };
}
