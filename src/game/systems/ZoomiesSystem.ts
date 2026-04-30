import type { World } from "../ecs/World";
import type { CatCompanionManager } from "../cats/CatCompanionManager";
import type { ZoomiesTrail } from "../ecs/components/ZoomiesTrail";
import type { CatBehavior } from "../ecs/components/CatBehavior";
import type { Transform } from "../ecs/components/Transform";
import type { SpeedBoost } from "../ecs/components/SpeedBoost";
import { createSpeedBoost } from "../ecs/components/SpeedBoost";
import { CAT_REGISTRY } from "../cats/definitions";
import { CatType } from "../types";

/**
 * ZoomiesSystem — drives Zoomies cat behavior each fixed physics tick.
 *
 * Responsibilities:
 *  1. Tick CatBehavior.stateTimer for every active Zoomies cat.
 *  2. Auto-dismiss when the 8s duration elapses (yarn consumed, not returned).
 *  3. Check per-frame whether the player overlaps any Zoomies trail entity.
 *  4. Add SpeedBoost to the player on trail entry; remove on exit.
 *
 * The trail overlap check is a manual oriented-AABB test (not a PhysicsEngine
 * trigger) so the trail's exact 6u × 1.5u rectangle can be checked without
 * requiring a non-uniform physics body.
 *
 * Frame position: after OxygenSystem (at the end of the fixed-step sub-tick).
 */
export class ZoomiesSystem {
  constructor(
    private readonly catCompanionManager: CatCompanionManager,
  ) {}

  update(world: World, dt: number): void {
    // ── Find the player entity ───────────────────────────────────────────────
    const playerEntities = world.query("Transform", "PlayerControlled");
    const playerEntity = playerEntities[0] ?? null;
    if (playerEntity === null) return;

    const playerTransform = world.getComponent<Transform>(
      playerEntity,
      "Transform",
    );
    if (!playerTransform) return;

    // ── Tick Zoomies cat timers ──────────────────────────────────────────────
    // We iterate ZoomiesTrail entities (one per Zoomies cat) so we only update
    // Zoomies cats, not every cat in the ECS world.
    const zoomiesDef = CAT_REGISTRY.get(CatType.Zoomies);
    const duration = zoomiesDef?.behavior.duration ?? 8;
    const speedMultiplier =
      typeof zoomiesDef?.behavior.params?.speedMultiplier === "number"
        ? zoomiesDef.behavior.params.speedMultiplier
        : 2.0;

    // Snapshot trail entities before any mutations (dismiss() invalidates cache).
    const trailEntities = world.query("ZoomiesTrail", "Transform");

    let playerInAnyTrail = false;
    let activeTrailEntity: number | null = null;

    for (const trailEntity of trailEntities) {
      const trail = world.getComponent<ZoomiesTrail>(trailEntity, "ZoomiesTrail")!;
      const trailTransform = world.getComponent<Transform>(
        trailEntity,
        "Transform",
      )!;

      // If the owning cat is no longer alive (e.g. dismissed elsewhere), clean
      // up the orphaned trail entity and skip further processing.
      if (!world.isAlive(trail.catEntity)) {
        world.destroyEntity(trailEntity);
        continue;
      }

      // Tick the owning cat's state timer.
      const behavior = world.getComponent<CatBehavior>(
        trail.catEntity,
        "CatBehavior",
      );
      if (behavior) {
        if (behavior.state === "Idle") {
          behavior.state = "Active";
        }

        if (behavior.state === "Active") {
          behavior.stateTimer += dt;

          if (behavior.stateTimer >= duration) {
            // Duration elapsed — mark Expired so dismiss() skips yarn refund.
            behavior.state = "Expired";
            // dismiss() will destroy both the cat entity and the trail entity.
            this.catCompanionManager.dismiss(trail.catEntity);
            // Trail is now destroyed; skip the overlap check for this iteration.
            continue;
          }
        }
      }

      // ── Oriented AABB overlap check ────────────────────────────────────────
      if (this.isPlayerInTrail(playerTransform, trailTransform, trail)) {
        playerInAnyTrail = true;
        activeTrailEntity = trailEntity;
      }
    }

    // ── Apply / remove SpeedBoost ────────────────────────────────────────────
    const playerBoost = world.getComponent<SpeedBoost>(
      playerEntity,
      "SpeedBoost",
    );

    if (playerInAnyTrail && activeTrailEntity !== null) {
      if (
        !playerBoost ||
        playerBoost.sourceEntity !== activeTrailEntity
      ) {
        if (playerBoost) world.removeComponent(playerEntity, "SpeedBoost");
        world.addComponent(
          playerEntity,
          createSpeedBoost(speedMultiplier, activeTrailEntity),
        );
      }
    } else if (playerBoost) {
      world.removeComponent(playerEntity, "SpeedBoost");
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Checks whether the player's XZ center falls inside the trail's oriented
   * bounding rectangle.
   *
   * We project the player-to-center offset onto the trail axis (along) and the
   * perpendicular (perp), then compare against the half-extents.  Y is ignored
   * — the trail is a 2-D footprint test.
   */
  private isPlayerInTrail(
    player: Transform,
    trail: Transform,
    trailComponent: ZoomiesTrail,
  ): boolean {
    const dx = player.x - trail.x;
    const dz = player.z - trail.z;

    const along = dx * trailComponent.dirX + dz * trailComponent.dirZ;
    const perp = dx * -trailComponent.dirZ + dz * trailComponent.dirX;

    return (
      Math.abs(along) <= trailComponent.halfLength &&
      Math.abs(perp) <= trailComponent.halfWidth
    );
  }
}
