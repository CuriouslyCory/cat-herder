import type { Component } from "../Component";
import type { ResourceType } from "../../types";

/**
 * Marks an entity as a gatherable resource node.
 *
 * State flow:
 *   Ready (cooldownRemaining === 0) → isBeingGathered = true (player presses E)
 *   → gatherProgress reaches 1 → resource added to inventory
 *   → cooldownRemaining = respawnTime, node dims
 *   → cooldown ticks down → cooldownRemaining === 0, node restores
 */
export interface ResourceNode extends Component {
  readonly type: "ResourceNode";
  resourceType: ResourceType;
  /** Seconds until gather completes. */
  gatherTime: number;
  /** How many units of resource are yielded per gather. */
  yieldAmount: number;
  /** Seconds until the node is gatherable again after use. */
  respawnTime: number;
  /** Seconds remaining in the current cooldown. 0 = ready to gather. */
  cooldownRemaining: number;
  /** True while the player is actively gathering this node. */
  isBeingGathered: boolean;
  /** Progress [0-1] of the current gathering action. */
  gatherProgress: number;
}

export function createResourceNode(
  resourceType: ResourceType,
  gatherTime: number,
  yieldAmount: number,
  respawnTime: number,
): ResourceNode {
  return {
    type: "ResourceNode",
    resourceType,
    gatherTime,
    yieldAmount,
    respawnTime,
    cooldownRemaining: 0,
    isBeingGathered: false,
    gatherProgress: 0,
  };
}
