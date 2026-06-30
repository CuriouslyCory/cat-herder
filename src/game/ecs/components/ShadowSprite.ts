import type { Component } from "../Component";
import type { Entity } from "../Entity";

/**
 * ShadowSprite — marks an entity as a ground-plane shadow disk that
 * follows a parent entity's XZ position at a fixed Y height.
 *
 * Created by VisualEffectsSystem for player and cat entities.
 * Destroyed automatically when the parent entity is removed.
 */
export interface ShadowSprite extends Component {
  readonly type: "ShadowSprite";
  readonly parentEntity: Entity;
}

export function createShadowSprite(parentEntity: Entity): ShadowSprite {
  return { type: "ShadowSprite", parentEntity };
}
