import type { Component } from "../Component";

/**
 * OxygenState — added to an entity when it enters a water trigger.
 * Removed (and reset to 100%) when the entity exits the water trigger.
 *
 * OxygenSystem drives the drain/refill logic each frame by reading
 * this component alongside SwimmingState (for isDiving).
 */
export interface OxygenState extends Component {
  readonly type: "OxygenState";
  /** Current oxygen percentage [0..100]. */
  oxygenPercent: number;
  /** Accumulates sub-hp damage from oxygen depletion before applying a full integer hp loss. */
  healthDrainAccum: number;
  /** True after OXYGEN_WARNING event has been emitted for this submersion (reset on exit). */
  hasEmittedWarning: boolean;
  /** True after OXYGEN_DEPLETED event has been emitted for this submersion (reset on exit). */
  hasEmittedDepleted: boolean;
}

export function createOxygenState(): OxygenState {
  return {
    type: "OxygenState",
    oxygenPercent: 100,
    healthDrainAccum: 0,
    hasEmittedWarning: false,
    hasEmittedDepleted: false,
  };
}
