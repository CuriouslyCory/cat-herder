import type { World } from "../ecs/World";
import type { CatStateView } from "../cats/CatLifecycle";
import type { ZoomiesTrail } from "../ecs/components/ZoomiesTrail";
import type { Transform } from "../ecs/components/Transform";
import type { SpeedBoost } from "../ecs/components/SpeedBoost";
import { createSpeedBoost } from "../ecs/components/SpeedBoost";
import { CAT_REGISTRY } from "../cats/definitions";
import { CatType } from "../types";

/**
 * ZoomiesSystem — a pure effect: drives the Zoomies speed-trail each fixed tick.
 *
 * Responsibilities:
 *  1. Check per-frame whether the player overlaps any active Zoomies trail.
 *  2. Add SpeedBoost to the player on trail entry; remove on exit.
 *
 * This system no longer detects expiry or calls dismiss() — CatCompanionManager
 * (the single lifecycle owner, see docs/adr/0004-cat-lifecycle-single-owner.md)
 * owns all state transitions and despawn timing. ZoomiesSystem only reads
 * lifecycle state through the CatStateView seam to gate the SpeedBoost effect.
 *
 * The trail overlap check is a manual oriented-AABB test (not a PhysicsEngine
 * trigger) so the trail's exact 6u × 1.5u rectangle can be checked without
 * requiring a non-uniform physics body.
 *
 * Frame position: after CatCompanionManager.update() and OxygenSystem in the
 * fixed-step loop (before CatCompanionManager.flushExpirations()).
 */
export class ZoomiesSystem {
  constructor(private readonly catState: CatStateView) {}

  update(world: World, _dt: number): void {
    // ── Find the player entity ───────────────────────────────────────────────
    const playerEntities = world.query("Transform", "PlayerControlled");
    const playerEntity = playerEntities[0] ?? null;
    if (playerEntity === null) return;

    const playerTransform = world.getComponent<Transform>(
      playerEntity,
      "Transform",
    );
    if (!playerTransform) return;

    // ── Read speed multiplier from definition ────────────────────────────────
    const zoomiesDef = CAT_REGISTRY.get(CatType.Zoomies);
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

      // If the owning cat is no longer alive, clean up the orphaned trail
      // entity and skip. This is a harmless safety net — CatCompanionManager's
      // beginDespawn() already destroys the trail entity itself, so this path
      // should rarely fire, but it guards against any other way the cat
      // entity could disappear out from under its trail.
      if (!world.isAlive(trail.catEntity)) {
        world.destroyEntity(trailEntity);
        continue;
      }

      // Only process Active cats for the trail overlap check. Expiry and
      // despawn are entirely CatCompanionManager's concern now.
      if (!this.catState.isActive(trail.catEntity)) continue;

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
