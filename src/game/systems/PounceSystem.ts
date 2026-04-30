import type { World } from "../ecs/World";
import type { PhysicsEngine } from "../engine/PhysicsEngine";
import type { CatBehavior } from "../ecs/components/CatBehavior";
import type { Transform } from "../ecs/components/Transform";
import type { Entity } from "../ecs/Entity";
import { CAT_REGISTRY } from "../cats/definitions";
import { CatType } from "../types";

/**
 * PounceSystem — drives the Pounce cat's one-shot upward launch mechanic.
 *
 * Each fixed tick:
 *  1. Finds all Pounce cat entities via CatBehavior query.
 *  2. Checks if the player's XZ center falls within the cat's trigger footprint
 *     AND the player is currently grounded (standing on top of the cat).
 *  3. Applies the launchImpulse upward velocity on first contact.
 *  4. Blocks re-launch until the player fully exits the XZ footprint and re-enters.
 *
 * "Once per landing" is enforced via launchedCats:
 *   - Cat entity added on launch.
 *   - Cat entity removed when player exits that cat's XZ footprint.
 *   - Player must step off completely and back on to trigger again.
 *
 * Air control (70 %) is already applied globally by runtimeConfig.airControlFactor
 * in MovementSystem — no additional wiring needed here.
 *
 * Frame position: after CuriositySystem in the fixed-step loop.
 */
export class PounceSystem {
  /**
   * Pounce cat entities that have already launched the player during the current
   * "visit." Cleared when the player exits that cat's XZ footprint.
   */
  private readonly launchedCats = new Set<Entity>();

  constructor(private readonly physics: PhysicsEngine) {}

  update(world: World, _dt: number): void {
    // ── Find the player entity ───────────────────────────────────────────────
    const playerEntities = world.query("Transform", "Velocity", "PlayerControlled");
    const playerEntity = playerEntities[0] ?? null;
    if (playerEntity === null) return;

    const playerTransform = world.getComponent<Transform>(playerEntity, "Transform");
    if (!playerTransform) return;

    const handle = this.physics.getHandleByEntity(playerEntity);
    if (!handle) return;

    // ── Read launch parameters from the cat definition ───────────────────────
    const pounceDef = CAT_REGISTRY.get(CatType.Pounce);
    const params = pounceDef?.behavior.params ?? {};

    const launchImpulse =
      typeof params.launchImpulse === "number" ? params.launchImpulse : 3.5;
    const halfW =
      (typeof params.triggerWidth === "number" ? params.triggerWidth : 1.8) / 2;
    const halfD =
      (typeof params.triggerDepth === "number" ? params.triggerDepth : 1.8) / 2;

    // ── Process each Pounce cat entity ───────────────────────────────────────
    const catEntities = world.query("CatBehavior", "Transform");
    const currentlyOverlapping = new Set<Entity>();

    for (const catEntity of catEntities) {
      const behavior = world.getComponent<CatBehavior>(catEntity, "CatBehavior")!;
      if (behavior.catType !== CatType.Pounce) continue;

      // Transition Idle → Active on the first frame after summon.
      if (behavior.state === "Idle") behavior.state = "Active";

      const catTransform = world.getComponent<Transform>(catEntity, "Transform")!;

      // AABB footprint check (XZ plane only — Y handled by physics grounding).
      const inZone =
        Math.abs(playerTransform.x - catTransform.x) <= halfW &&
        Math.abs(playerTransform.z - catTransform.z) <= halfD;

      if (inZone) {
        currentlyOverlapping.add(catEntity);

        // Launch when: inside footprint + grounded on cat + not yet launched.
        if (
          !this.launchedCats.has(catEntity) &&
          this.physics.isBodyGrounded(handle)
        ) {
          this.launchedCats.add(catEntity);

          const physVel = this.physics.getVelocity(handle);
          this.physics.setVelocity(handle, {
            x: physVel?.x ?? 0,
            y: launchImpulse,
            z: physVel?.z ?? 0,
          });
        }
      }
    }

    // ── Clear launched state for cats the player has fully exited ────────────
    // Snapshot to avoid mutating the Set while iterating.
    for (const catEntity of [...this.launchedCats]) {
      if (!currentlyOverlapping.has(catEntity)) {
        this.launchedCats.delete(catEntity);
      }
    }
  }
}
