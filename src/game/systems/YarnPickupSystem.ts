import type { World } from "../ecs/World";
import type { Entity } from "../ecs/Entity";
import type { GameState } from "../engine/GameState";
import type { Transform } from "../ecs/components/Transform";
import type { YarnPickup } from "../ecs/components/YarnPickup";

/** Player must be within this many world units to auto-collect a yarn pickup. */
const PICKUP_RADIUS_SQ = 1.0 * 1.0; // 1 u²

/**
 * YarnPickupSystem — auto-collects yarn pickup entities on player proximity.
 *
 * Each fixed tick, queries all YarnPickup entities and checks XZ distance to the
 * player. When the player steps within PICKUP_RADIUS, yarn is added to GameState
 * and the pickup entity is destroyed.
 */
export class YarnPickupSystem {
  constructor(
    private readonly gameState: GameState,
    private readonly getPlayerEntity: () => Entity | null,
  ) {}

  update(world: World, _dt: number): void {
    const playerEntity = this.getPlayerEntity();
    if (playerEntity === null) return;

    const playerTransform = world.getComponent<Transform>(playerEntity, "Transform");
    if (!playerTransform) return;

    const pickupEntities = world.query("YarnPickup", "Transform");
    // Snapshot to avoid mutation during iteration (destroyEntity invalidates query cache)
    for (const entity of [...pickupEntities]) {
      if (!world.isAlive(entity)) continue;

      const transform = world.getComponent<Transform>(entity, "Transform");
      if (!transform) continue;

      const dx = transform.x - playerTransform.x;
      const dz = transform.z - playerTransform.z;
      if (dx * dx + dz * dz > PICKUP_RADIUS_SQ) continue;

      const pickup = world.getComponent<YarnPickup>(entity, "YarnPickup");
      if (!pickup) continue;

      this.gameState.addYarn(pickup.amount);
      world.destroyEntity(entity);
    }
  }
}
