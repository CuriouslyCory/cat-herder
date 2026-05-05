import type { World } from "../ecs/World";
import type { CatBehavior } from "../ecs/components/CatBehavior";
import { CAT_REGISTRY } from "../cats/definitions";

/**
 * CatAISystem — generic, data-driven state machine for all cat companions.
 *
 * Drives the CatBehavior lifecycle entirely from CatDefinition configuration.
 * No cat-specific logic is hardcoded here — duration, permanent status, and all
 * other behavioral parameters come from the CAT_REGISTRY.
 *
 * State transitions:
 *   Idle → Active   (all cats, on the first fixed-step tick after summon)
 *   Active → Expired (duration cats only: when stateTimer >= behavior.duration)
 *   Permanent cats  (Loaf, Pounce — no duration in definition): stay Active forever
 *
 * This system ONLY manages state.  Per-cat systems (ZoomiesSystem, CuriositySystem,
 * PounceSystem) react to the current state to apply their specific effects and
 * handle cleanup + dismiss() when they see the Expired state.
 *
 * Frame position: FIRST in the fixed-step loop, before all per-cat systems.
 */
export class CatAISystem {
  update(world: World, dt: number): void {
    // Snapshot the entity list before any mutations (per-cat systems may dismiss
    // cats, but CatAISystem itself does not — safe to iterate live).
    const catEntities = world.query("CatBehavior", "Transform");

    for (const entity of catEntities) {
      if (!world.isAlive(entity)) continue;

      const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;

      // Look up the duration from the cat definition.
      // undefined means the cat is permanent (Loaf, Pounce).
      const def = CAT_REGISTRY.get(behavior.catType);
      const duration = def?.behavior.duration; // undefined for permanent cats

      switch (behavior.state) {
        case "Idle":
          // Activate immediately on the first tick after summon.
          // Per-cat systems will detect the Active state and apply initial
          // effects (terrain reveal, speed trail, etc.) in the same frame.
          behavior.state = "Active";
          break;

        case "Active":
          if (duration !== undefined) {
            // Duration cat: tick the timer.
            behavior.stateTimer += dt;
            if (behavior.stateTimer >= duration) {
              // Duration elapsed — mark Expired so per-cat systems can clean up
              // and call dismiss() (which checks state !== "Active" to skip
              // the yarn refund for expired cats).
              behavior.state = "Expired";
            }
          }
          // Permanent cats (duration === undefined) remain Active indefinitely.
          break;

        case "Expired":
          // Per-cat systems handle cleanup and dismiss in the same frame.
          // Nothing to do here — avoid double-processing.
          break;

        case "Cooldown":
          // Reserved for future use (e.g. rechargeable cats).
          break;
      }
    }
  }
}
