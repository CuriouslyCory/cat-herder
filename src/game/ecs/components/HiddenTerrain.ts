import type { Component } from "../Component";

/**
 * HiddenTerrain — ECS tag attached to terrain entities that are initially
 * invisible and non-navigable until revealed by a Curiosity Cat.
 *
 * revealCount tracks how many Curiosity cats are currently revealing this
 * entity.  The terrain becomes visible when revealCount transitions 0 → 1,
 * and hides again when it transitions 1 → 0 (handles overlapping reveal zones
 * from multiple simultaneous Curiosity cats correctly).
 */
export interface HiddenTerrain extends Component {
  readonly type: "HiddenTerrain";
  /** Whether this entity is currently visible to the player. */
  isRevealed: boolean;
  /**
   * Number of active Curiosity cats whose reveal radius covers this entity.
   * Terrain is shown while revealCount > 0, hidden when it returns to 0.
   */
  revealCount: number;
}

export function createHiddenTerrain(): HiddenTerrain {
  return {
    type: "HiddenTerrain",
    isRevealed: false,
    revealCount: 0,
  };
}
