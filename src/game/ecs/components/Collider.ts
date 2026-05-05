import type { Component } from "../Component";

export type ColliderShape = "circle" | "box";

export interface Collider extends Component {
  readonly type: "Collider";
  shape: ColliderShape;
  /** Radius for circle; half-extent on each axis for box */
  size: number;
  /** Per-axis XZ half-extents for box shapes. Overrides `size` in collision math when set. */
  halfExtents: { x: number; z: number } | null;
  /** Y half-extent for vertical overlap checks. Defaults to size. */
  halfHeight: number;
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
    Pick<Collider, "isStatic" | "isTrigger" | "collisionLayer" | "collisionMask" | "halfHeight" | "halfExtents">
  > = {},
): Collider {
  return {
    type: "Collider",
    shape,
    size,
    halfExtents: options.halfExtents ?? null,
    halfHeight: options.halfHeight ?? size,
    isStatic: options.isStatic ?? false,
    isTrigger: options.isTrigger ?? false,
    collisionLayer: options.collisionLayer ?? 1,
    collisionMask: options.collisionMask ?? 1,
  };
}
