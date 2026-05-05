import type { Component } from "../Component";
import type { Entity } from "../Entity";

/**
 * CuriosityReveal — ECS component attached to a summoned Curiosity Cat entity.
 *
 * Holds the reveal radius (sourced from the CuriosityCat definition) and the
 * list of HiddenTerrain entities that this cat instance revealed.  CuriositySystem
 * populates revealedEntities on the first tick (Idle → Active transition) and
 * clears them when the cat expires.
 */
export interface CuriosityReveal extends Component {
  readonly type: "CuriosityReveal";
  /** World-unit radius within which hidden terrain is revealed. */
  revealRadius: number;
  /**
   * Terrain entities revealed by this specific cat instance.
   * Populated once on activation; drained on dismissal so revealCount is
   * correctly decremented even when multiple cats overlap the same tiles.
   */
  revealedEntities: Entity[];
}

export function createCuriosityReveal(revealRadius: number): CuriosityReveal {
  return {
    type: "CuriosityReveal",
    revealRadius,
    revealedEntities: [],
  };
}
