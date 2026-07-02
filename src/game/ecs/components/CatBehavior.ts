import type { Component } from "../Component";
import type { CatType } from "../../types";
import type { Entity } from "../Entity";

// ---------------------------------------------------------------------------
// CatBehavior — ECS component attached to every summoned cat entity.
//
// State machine (driven by CatCompanionManager, the single lifecycle owner —
// see docs/adr/0004-cat-lifecycle-single-owner.md):
//   Idle → Active → Expired → Despawning → (destroyed)  (duration cats: Zoomies, Curiosity)
//   Idle → Active                                        (permanent cats: Loaf, Pounce — stay Active until dismissed)
//
// "Despawning" is never written to this component's `state` field directly —
// CatCompanionManager.beginDespawn() removes the whole CatBehavior component
// (so effect systems stop processing the entity, exactly as it did before
// this component existed as the owner's own concept). It exists on CatState
// purely so CatStateView.getCatState() has a value to synthesize for an
// entity mid-despawn (tracked in the owner's private `despawning` map).
// ---------------------------------------------------------------------------

export type CatState = "Idle" | "Active" | "Cooldown" | "Expired" | "Despawning";

export interface CatBehavior extends Component {
  readonly type: "CatBehavior";
  /** Which cat type this entity represents. */
  catType: CatType;
  /** Current lifecycle state — managed by CatCompanionManager. */
  state: CatState;
  /** Seconds spent in the current state — used by CatCompanionManager for duration tracking. */
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
