import type { World } from "./World";

/**
 * System interface. Each system operates on a slice of ECS state each frame.
 * Systems are registered with the Game orchestrator and called in a fixed order.
 */
export interface System {
  update(world: World, dt: number): void;
}
