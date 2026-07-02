import type { World } from "../ecs/World";
import type { Entity } from "../ecs/Entity";
import type { CatStateView } from "../cats/CatLifecycle";
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
 * CuriositySystem — a pure effect: drives Curiosity Cat's terrain reveal/fade
 * each fixed physics tick.
 *
 * Responsibilities:
 *  1. On the first Active tick (detected by revealedEntities.length === 0):
 *     scan for HiddenTerrain entities within the reveal radius, mark them
 *     for reveal (targetOpacity = 1), enable their colliders, increment
 *     revealCount, and emit `hidden:terrain:revealed`.
 *  2. On Expired: mark revealed terrain for fade-out (targetOpacity = 0) and
 *     place a despawn HOLD via the CatStateView seam so CatCompanionManager
 *     (the single lifecycle owner) waits to despawn the cat until the fade
 *     finishes — see docs/adr/0004-cat-lifecycle-single-owner.md.
 *  3. Animate currentOpacity toward targetOpacity each tick (~0.5s ease).
 *  4. Once a held cat's terrain has finished fading, release the hold —
 *     CatCompanionManager.flushExpirations() then begins its despawn.
 *
 * This system never calls dismiss()/destroyEntity() and never detects expiry
 * by reading CatBehavior.state directly — it reads lifecycle state through
 * the CatStateView seam.
 *
 * SceneManager is injected so the system can update mesh opacity without
 * crossing the Three.js isolation boundary elsewhere.
 *
 * Frame position: after CatCompanionManager.update() in the fixed-step loop
 * (before CatCompanionManager.flushExpirations()).
 */
export class CuriositySystem {
  /** Cats whose revealed terrain is currently fading out (despawn held). */
  private readonly fadingCats = new Set<Entity>();

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly catState: CatStateView,
    private readonly eventBus: EventBus,
  ) {}

  update(world: World, dt: number): void {
    const catDef = CAT_REGISTRY.get(CatType.CuriosityCat);
    const defaultRadius =
      typeof catDef?.behavior.params?.revealRadius === "number"
        ? catDef.behavior.params.revealRadius
        : 5;

    // Snapshot before any mutations (beginDespawn() invalidates the query cache).
    const curiosityCats = world.query("CatBehavior", "Transform", "CuriosityReveal");

    for (const catEntity of curiosityCats) {
      if (!world.isAlive(catEntity)) continue;

      const behavior = world.getComponent<CatBehavior>(catEntity, "CatBehavior")!;
      const transform = world.getComponent<Transform>(catEntity, "Transform")!;
      const reveal = world.getComponent<CuriosityReveal>(catEntity, "CuriosityReveal")!;

      if (behavior.catType !== CatType.CuriosityCat) continue;

      if (this.catState.getCatState(catEntity) === "Expired" && !this.fadingCats.has(catEntity)) {
        this.beginHideRevealedTerrain(world, reveal);
        this.catState.holdDespawn(catEntity);
        this.fadingCats.add(catEntity);
        continue;
      }

      if (this.catState.isActive(catEntity) && reveal.revealedEntities.length === 0) {
        const radius = reveal.revealRadius > 0 ? reveal.revealRadius : defaultRadius;
        this.revealNearbyTerrain(world, catEntity, transform, reveal, radius);
      }
    }

    this.animateOpacity(world, dt);
    this.flushFades(world);
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
   * Releases the despawn hold for expired cats whose revealed terrain has
   * finished fading out (all currentOpacity === 0 or entities dead).
   *
   * Does NOT call dismiss()/beginDespawn() itself — releasing the hold here
   * lets CatCompanionManager.flushExpirations() (which runs later this same
   * tick) begin the despawn, preserving exact-tick timing parity with the
   * legacy pipeline (see the frame-position doc comment on the class).
   */
  private flushFades(world: World): void {
    for (const catEntity of this.fadingCats) {
      if (!world.isAlive(catEntity)) {
        this.fadingCats.delete(catEntity);
        continue;
      }

      const reveal = world.getComponent<CuriosityReveal>(catEntity, "CuriosityReveal");
      if (!reveal) {
        this.fadingCats.delete(catEntity);
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
        this.catState.releaseDespawn(catEntity);
        this.fadingCats.delete(catEntity);
      }
    }
  }
}
