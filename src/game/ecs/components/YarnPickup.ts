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
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError(`YarnPickup amount must be a finite positive number, got ${amount}`);
  }
  return { type: "YarnPickup", amount };
}
