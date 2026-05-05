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

const FADE_SPEED = 2.0; // 1/seconds → full fade in 0.5s

/**
 * CuriositySystem — drives Curiosity Cat behavior each fixed physics tick.
 *
 * Responsibilities:
 *  1. On the first Active tick (detected by revealedEntities.length === 0):
 *     scan for HiddenTerrain entities within the reveal radius, mark them
 *     for reveal (targetOpacity = 1), enable their colliders, increment
 *     revealCount, and emit `hidden:terrain:revealed`.
 *  2. Detect Expired state (set by CatAISystem) and mark revealed terrain
 *     for fade-out (targetOpacity = 0). Dismiss is deferred until the
 *     fade-out animation completes.
 *  3. Animate currentOpacity toward targetOpacity each tick (~0.5s ease).
 *
 * State management (Idle→Active, timer, Expired marking) is handled centrally
 * by CatAISystem which runs before this system each fixed tick.
 *
 * SceneManager is injected so the system can update mesh opacity without
 * crossing the Three.js isolation boundary elsewhere.
 */
export class CuriositySystem {
  private readonly pendingDismiss = new Set<Entity>();

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly catCompanionManager: CatCompanionManager,
    private readonly eventBus: EventBus,
  ) {}

  update(world: World, dt: number): void {
    const catDef = CAT_REGISTRY.get(CatType.CuriosityCat);
    const defaultRadius =
      typeof catDef?.behavior.params?.revealRadius === "number"
        ? catDef.behavior.params.revealRadius
        : 5;

    // Snapshot before any mutations (dismiss() invalidates the query cache).
    const curiosityCats = world.query("CatBehavior", "Transform", "CuriosityReveal");

    for (const catEntity of curiosityCats) {
      if (!world.isAlive(catEntity)) continue;

      const behavior = world.getComponent<CatBehavior>(catEntity, "CatBehavior")!;
      const transform = world.getComponent<Transform>(catEntity, "Transform")!;
      const reveal = world.getComponent<CuriosityReveal>(catEntity, "CuriosityReveal")!;

      if (behavior.catType !== CatType.CuriosityCat) continue;

      if (behavior.state === "Expired" && !this.pendingDismiss.has(catEntity)) {
        this.beginHideRevealedTerrain(world, reveal);
        this.pendingDismiss.add(catEntity);
        continue;
      }

      if (behavior.state === "Active" && reveal.revealedEntities.length === 0) {
        const radius = reveal.revealRadius > 0 ? reveal.revealRadius : defaultRadius;
        this.revealNearbyTerrain(world, catEntity, transform, reveal, radius);
      }
    }

    this.animateOpacity(world, dt);
    this.flushDismissals(world);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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

      const collider = world.getComponent<Collider>(entity, "Collider");
      const halfX = collider?.halfExtents?.x ?? collider?.size ?? 0;
      const halfZ = collider?.halfExtents?.z ?? collider?.size ?? 0;
      const closestX = Math.max(tf.x - halfX, Math.min(catTransform.x, tf.x + halfX));
      const closestZ = Math.max(tf.z - halfZ, Math.min(catTransform.z, tf.z + halfZ));
      const dx = closestX - catTransform.x;
      const dz = closestZ - catTransform.z;

      if (dx * dx + dz * dz > radius * radius) continue;

      const hiddenTerrain = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain")!;
      hiddenTerrain.revealCount++;
      revealedIds.push(entity);

      if (hiddenTerrain.revealCount === 1) {
        hiddenTerrain.targetOpacity = 1;
        const col = world.getComponent<Collider>(entity, "Collider");
        if (col) col.collisionMask = 1;
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
   * Marks revealed terrain for fade-out by decrementing revealCount and
   * setting targetOpacity = 0 where appropriate. Actual dismiss is deferred
   * until the animation finishes (see flushDismissals).
   */
  private beginHideRevealedTerrain(world: World, reveal: CuriosityReveal): void {
    for (const entity of reveal.revealedEntities) {
      if (!world.isAlive(entity)) continue;

      const hiddenTerrain = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain");
      if (!hiddenTerrain) continue;

      hiddenTerrain.revealCount = Math.max(0, hiddenTerrain.revealCount - 1);

      if (hiddenTerrain.revealCount === 0) {
        hiddenTerrain.targetOpacity = 0;
        const collider = world.getComponent<Collider>(entity, "Collider");
        if (collider) collider.collisionMask = 0;
        hiddenTerrain.isRevealed = false;
      }
    }
  }

  /**
   * Ticks currentOpacity toward targetOpacity for all HiddenTerrain entities,
   * updating the scene mesh each frame.
   */
  private animateOpacity(world: World, dt: number): void {
    const entities = world.query("HiddenTerrain", "Renderable");

    for (const entity of entities) {
      const ht = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain")!;

      if (ht.currentOpacity === ht.targetOpacity) continue;

      const delta = FADE_SPEED * dt;
      if (ht.currentOpacity < ht.targetOpacity) {
        ht.currentOpacity = Math.min(ht.currentOpacity + delta, ht.targetOpacity);
      } else {
        ht.currentOpacity = Math.max(ht.currentOpacity - delta, ht.targetOpacity);
      }

      const renderable = world.getComponent<Renderable>(entity, "Renderable")!;
      if (renderable.sceneHandle !== null) {
        this.sceneManager.setMeshOpacity(renderable.sceneHandle, ht.currentOpacity);
      }
    }
  }

  /**
   * Dismisses expired cats whose revealed terrain has finished fading out
   * (all currentOpacity === 0 or entities dead).
   */
  private flushDismissals(world: World): void {
    for (const catEntity of this.pendingDismiss) {
      if (!world.isAlive(catEntity)) {
        this.pendingDismiss.delete(catEntity);
        continue;
      }

      const reveal = world.getComponent<CuriosityReveal>(catEntity, "CuriosityReveal");
      if (!reveal) {
        this.pendingDismiss.delete(catEntity);
        continue;
      }

      const stillFading = reveal.revealedEntities.some((e) => {
        if (!world.isAlive(e)) return false;
        const ht = world.getComponent<HiddenTerrain>(e, "HiddenTerrain");
        if (!ht) return false;
        return ht.currentOpacity > 0;
      });

      if (!stillFading) {
        reveal.revealedEntities = [];
        this.catCompanionManager.dismiss(catEntity);
        this.pendingDismiss.delete(catEntity);
      }
    }
  }
}
