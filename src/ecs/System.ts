import type { World } from "./World";

export interface System {
  /** Called once per frame with the ECS world and the elapsed time in seconds. */
  update(world: World, dt: number): void;
}
