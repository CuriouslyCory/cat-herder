import type { Component } from "../Component";

/**
 * SwimmingState — added to an entity when it is overlapping a water trigger.
 * Removed when the entity exits the water trigger.
 *
 * MovementSystem reads this component to apply swim physics instead of
 * land physics. WaterSystem manages its lifecycle via trigger events.
 */
export interface SwimmingState extends Component {
  readonly type: "SwimmingState";
  /** True when the Dive action (Shift) is held — entity moves below the surface. */
  isDiving: boolean;
  /** World Y of the water surface at this water zone. */
  waterSurfaceY: number;
  /**
   * Blend factor [0..1] ramping from 0 (land physics) to 1 (full swim physics).
   * Ramped up each frame to smooth the speed transition at the water boundary.
   */
  transitionBlend: number;
}

export function createSwimmingState(waterSurfaceY: number): SwimmingState {
  return {
    type: "SwimmingState",
    isDiving: false,
    waterSurfaceY,
    transitionBlend: 0,
  };
}
