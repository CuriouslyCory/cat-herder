import type { Component } from "../Component";

/**
 * Marks an entity as a collectible yarn pickup.
 * When the player walks over it, `amount` yarn is added to GameState
 * and the entity is destroyed.
 */
export interface YarnPickup extends Component {
  readonly type: "YarnPickup";
  amount: number;
}

export function createYarnPickup(amount: number): YarnPickup {
  return { type: "YarnPickup", amount };
}
