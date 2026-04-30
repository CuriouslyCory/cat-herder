import type { World } from "../ecs/World";
import type { Entity } from "../ecs/Entity";
import type { CatCompanionManager } from "../cats/CatCompanionManager";
import type { EventBus } from "../engine/EventBus";
import type { SceneManager } from "../engine/SceneManager";
import type { CatBehavior } from "../ecs/components/CatBehavior";
import type { Transform } from "../ecs/components/Transform";
import type { Renderable } from "../ecs/components/Renderable";
import type { Collider } from "../ecs/components/Collider";
import type { HiddenTerrain } from "../ecs/components/HiddenTerrain";
import type { CuriosityReveal } from "../ecs/components/CuriosityReveal";
import { CAT_REGISTRY } from "../cats/definitions";
import { CatType } from "../types";

/**
 * CuriositySystem — drives Curiosity Cat behavior each fixed physics tick.
 *
 * Responsibilities:
 *  1. On first tick for a Curiosity cat (Idle → Active): scan for HiddenTerrain
 *     entities within the reveal radius, make them visible, enable their colliders,
 *     increment revealCount, and emit `hidden:terrain:revealed`.
 *  2. Tick CatBehavior.stateTimer for each active Curiosity cat.
 *  3. Auto-dismiss at 20 s (yarn consumed — state marked Expired before dismiss).
 *  4. On dismiss: decrement revealCount on each previously revealed entity;
 *     hide terrain whose revealCount returns to 0.
 *
 * SceneManager is injected so the system can update mesh opacity without
 * crossing the Three.js isolation boundary elsewhere.
 */
export class CuriositySystem {
  constructor(
    private readonly sceneManager: SceneManager,
    private readonly catCompanionManager: CatCompanionManager,
    private readonly eventBus: EventBus,
  ) {}

  update(world: World, dt: number): void {
    const catDef = CAT_REGISTRY.get(CatType.CuriosityCat);
    const duration = catDef?.behavior.duration ?? 20;
    const defaultRadius =
      typeof catDef?.behavior.params?.revealRadius === "number"
        ? catDef.behavior.params.revealRadius
        : 5;

    // Snapshot before any mutations (dismiss() invalidates the query cache).
    const curiosityCats = world.query("CatBehavior", "Transform", "CuriosityReveal");

    for (const catEntity of curiosityCats) {
      const behavior = world.getComponent<CatBehavior>(catEntity, "CatBehavior")!;
      const transform = world.getComponent<Transform>(catEntity, "Transform")!;
      const reveal = world.getComponent<CuriosityReveal>(catEntity, "CuriosityReveal")!;

      // Only process Curiosity cats (the query already filters by CuriosityReveal,
      // but guard against future component reuse).
      if (behavior.catType !== CatType.CuriosityCat) continue;

      if (behavior.state === "Idle") {
        // Transition Idle → Active: reveal nearby hidden terrain.
        behavior.state = "Active";
        const radius = reveal.revealRadius > 0 ? reveal.revealRadius : defaultRadius;
        this.revealNearbyTerrain(world, catEntity, transform, reveal, radius);
      } else if (behavior.state === "Active") {
        behavior.stateTimer += dt;

        if (behavior.stateTimer >= duration) {
          // Duration elapsed — mark Expired so dismiss() skips yarn refund.
          behavior.state = "Expired";
          this.hideRevealedTerrain(world, reveal);
          this.catCompanionManager.dismiss(catEntity);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Reveals all HiddenTerrain entities within the given radius of the cat's
   * world position.  Increments revealCount on each affected entity so
   * multiple overlapping Curiosity cats are handled correctly.
   */
  private revealNearbyTerrain(
    world: World,
    catEntity: Entity,
    catTransform: Transform,
    reveal: CuriosityReveal,
    radius: number,
  ): void {
    const hiddenEntities = world.query("HiddenTerrain", "Transform", "Renderable");
    const revealedIds: number[] = [];

    for (const entity of hiddenEntities) {
      const tf = world.getComponent<Transform>(entity, "Transform")!;
      const dx = tf.x - catTransform.x;
      const dz = tf.z - catTransform.z;

      // Use XZ distance only — Y does not affect reveal radius.
      if (dx * dx + dz * dz > radius * radius) continue;

      const hiddenTerrain = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain")!;
      hiddenTerrain.revealCount++;
      revealedIds.push(entity);

      if (hiddenTerrain.revealCount === 1) {
        // First reveal: switch the mesh from invisible to visible.
        const renderable = world.getComponent<Renderable>(entity, "Renderable")!;
        if (renderable.sceneHandle !== null) {
          this.sceneManager.setMeshOpacity(renderable.sceneHandle, 1);
        }
        // Enable the collider so CollisionSystem can interact with it.
        const collider = world.getComponent<Collider>(entity, "Collider");
        if (collider) collider.collisionMask = 1;
        hiddenTerrain.isRevealed = true;
      }

      reveal.revealedEntities.push(entity);
    }

    if (revealedIds.length > 0) {
      this.eventBus.emit({
        type: "hidden:terrain:revealed",
        catEntity,
        terrainEntities: revealedIds,
      });
    }
  }

  /**
   * Decrements revealCount on each terrain entity this cat revealed.
   * Hides entities whose count drops back to zero.
   * Called before dismiss() so the terrain state is correct when the cat leaves.
   */
  private hideRevealedTerrain(world: World, reveal: CuriosityReveal): void {
    for (const entity of reveal.revealedEntities) {
      if (!world.isAlive(entity)) continue;

      const hiddenTerrain = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain");
      if (!hiddenTerrain) continue;

      hiddenTerrain.revealCount = Math.max(0, hiddenTerrain.revealCount - 1);

      if (hiddenTerrain.revealCount === 0) {
        // Last reveal removed: hide the mesh again.
        const renderable = world.getComponent<Renderable>(entity, "Renderable");
        if (renderable?.sceneHandle !== null && renderable?.sceneHandle !== undefined) {
          this.sceneManager.setMeshOpacity(renderable.sceneHandle, 0);
        }
        // Disable the collider.
        const collider = world.getComponent<Collider>(entity, "Collider");
        if (collider) collider.collisionMask = 0;
        hiddenTerrain.isRevealed = false;
      }
    }

    reveal.revealedEntities = [];
  }
}
