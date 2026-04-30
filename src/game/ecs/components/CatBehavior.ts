import type { Component } from "../Component";
import type { CatType } from "../../types";
import type { Entity } from "../Entity";

// ---------------------------------------------------------------------------
// CatBehavior — ECS component attached to every summoned cat entity.
//
// State machine (driven by CatAISystem in US-110):
//   Idle → Active → Expired  (duration cats: Zoomies, Curiosity)
//   Idle → Active            (permanent cats: Loaf, Pounce — stay Active until dismissed)
// ---------------------------------------------------------------------------

export type CatState = "Idle" | "Active" | "Cooldown" | "Expired";

export interface CatBehavior extends Component {
  readonly type: "CatBehavior";
  /** Which cat type this entity represents. */
  catType: CatType;
  /** Current lifecycle state — managed by CatAISystem. */
  state: CatState;
  /** Seconds spent in the current state — used by CatAISystem for duration tracking. */
  stateTimer: number;
  /** The player entity that summoned this cat (0 if no owner). */
  ownerId: Entity;
  /**
   * Yarn cost paid at summon time.
   * Stored here so dismiss() can refund the correct amount without
   * re-querying the definition registry.
   */
  yarnCost: number;
}

export function createCatBehavior(
  catType: CatType,
  ownerId: Entity,
  yarnCost: number,
): CatBehavior {
  return {
    type: "CatBehavior",
    catType,
    state: "Idle",
    stateTimer: 0,
    ownerId,
    yarnCost,
  };
}
