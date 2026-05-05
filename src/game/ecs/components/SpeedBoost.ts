import type { Component } from "../Component";
import type { Entity } from "../Entity";

/**
 * SpeedBoost — added to the player entity while they overlap a Zoomies trail.
 * Removed when the player leaves the trail or the trail is dismissed.
 *
 * MovementSystem reads this component to scale the player's walkSpeed.
 * ZoomiesSystem manages its lifecycle.
 */
export interface SpeedBoost extends Component {
  readonly type: "SpeedBoost";
  /** Multiplier applied to walkSpeed (e.g. 2.0 = double speed). */
  multiplier: number;
  /** The trail entity that granted this boost (used for identity on exit). */
  sourceEntity: Entity;
}

export function createSpeedBoost(
  multiplier: number,
  sourceEntity: Entity,
): SpeedBoost {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new RangeError(`SpeedBoost multiplier must be a finite positive number, got ${multiplier}`);
  }
  return { type: "SpeedBoost", multiplier, sourceEntity };
}
