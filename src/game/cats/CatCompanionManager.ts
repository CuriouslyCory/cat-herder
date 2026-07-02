import type { World } from "../ecs/World";
import type { Entity } from "../ecs/Entity";
import type { EventBus } from "../engine/EventBus";
import type { GameState } from "../engine/GameState";
import type { MapManager } from "../maps/MapManager";
import type { PhysicsEngine, BodyHandle } from "../engine/PhysicsEngine";
import type { Vec3 } from "../types";
import type { Transform } from "../ecs/components/Transform";
import { CatType, TerrainType } from "../types";
import { CAT_REGISTRY } from "./definitions";
import type { CatDefinition } from "./CatDefinition";
import { createTransform } from "../ecs/components/Transform";
import { createRenderable } from "../ecs/components/Renderable";
import type { CatBehavior, CatState } from "../ecs/components/CatBehavior";
import { createZoomiesTrail } from "../ecs/components/ZoomiesTrail";
import { createCuriosityReveal } from "../ecs/components/CuriosityReveal";
import { createCatScaleAnimation } from "../ecs/components/CatScaleAnimation";
import { assembleCatEntity } from "../ecs/prefabs";
import { runtimeConfig } from "../config";
import type { CatStateView } from "./CatLifecycle";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CatCatalogEntry {
  type: CatType;
  name: string;
  yarnCost: number;
  description: string;
  /** All cats are unlocked for MVP; future stories may gate by progression. */
  unlocked: boolean;
}

// ---------------------------------------------------------------------------
// CatCompanionManager — the single lifecycle owner for the Cat Companion.
//
// One module owns the full lifecycle — summon → active → (expiry) →
// despawning → destroyed — plus cap eviction, the yarn-refund rule, and the
// despawn animation phase (see docs/adr/0004-cat-lifecycle-single-owner.md):
//   summon()           — validate, deduct yarn, create ECS entity, emit cat:summoned
//   dismiss()          — manual entry point; refunds yarn (if not Expired), begins despawn
//   update(dt)         — state machine driver (Idle→Active→Expired) + despawn-timer
//                         countdown/destruction. Call FIRST each fixed tick, at the
//                         position CatAISystem used to occupy (before per-cat effects).
//   flushExpirations() — begins despawn for any Expired-and-unheld cat. Call AFTER the
//                         per-cat effect systems each fixed tick (see method doc for why).
//   getCatalog() / getActiveCompanions() — read-only queries for the HUD.
//
// CatCompanionManager also implements CatStateView — the read-only seam that
// per-cat effect systems (Zoomies/Curiosity/Pounce) use to read lifecycle
// state and place despawn holds, without depending on the concrete manager.
//
// The Cat limit (default 3) is sourced from runtimeConfig.maxActiveCats so the
// debug menu can override it without a recompile.
// ---------------------------------------------------------------------------

export class CatCompanionManager implements CatStateView {
  /**
   * Ordered insertion map: entity → CatType.
   * Insertion order is preserved so auto-dismiss always removes the oldest cat.
   */
  private readonly companions = new Map<Entity, CatType>();

  /**
   * Physics body handles for terrain/launch cats.
   * Populated in summon() for effectType 'terrain' | 'launch'; cleaned up in beginDespawn().
   */
  private readonly physicsHandles = new Map<Entity, BodyHandle>();

  /**
   * Trail entities created alongside Zoomies cats.
   * Keyed by cat entity; destroyed in beginDespawn() to keep the world clean.
   */
  private readonly trailEntities = new Map<Entity, Entity>();

  /**
   * Entities currently in the despawn animation phase → seconds remaining
   * until the owner destroys them. CatCompanionManager is the sole authority
   * for `world.destroyEntity()` on a cat (VisualEffectsSystem only tweens).
   */
  private readonly despawning = new Map<Entity, number>();

  /**
   * Ref-counted despawn holds. While an entity has a hold (count > 0),
   * flushExpirations() will not begin its despawn even if Expired — this is
   * how CuriositySystem's "fade the terrain before the cat disappears"
   * affordance works, without a private per-system deferred-dismiss queue.
   */
  private readonly despawnHolds = new Map<Entity, number>();

  /** Matches the pop-in/pop-out CatScaleAnimation tween duration. */
  private static readonly DESPAWN_SECONDS = 0.2;

  constructor(
    private readonly world: World,
    private readonly eventBus: EventBus,
    private readonly mapManager: MapManager,
    private readonly gameState: GameState,
    /** Getter for the current player entity; may return null before first spawn. */
    private readonly getPlayerEntity: () => Entity | null,
    private readonly physics: PhysicsEngine,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Attempt to summon the given cat type at the world position.
   *
   * Validation order:
   *   1. Definition must exist in registry.
   *   2. Sufficient yarn (non-mutating check).
   *   3. Position on valid (non-void, non-water) terrain.
   *   4. Cat limit — if at cap, oldest cat is auto-dismissed BEFORE the placement probe
   *      so the probe sees the post-eviction physics world.
   *   5. Placement probe (surfaceY + occupancy loop).
   *   6. Yarn deduction + entity creation.
   *
   * Returns the new entity on success, null on validation failure.
   */
  summon(catType: CatType, position: Vec3): Entity | null {
    const def = CAT_REGISTRY.get(catType);
    if (!def) return null;

    // 1. Yarn check
    if (this.gameState.yarn < def.yarnCost) {
      console.warn(`[CatCompanionManager] Not enough yarn to summon ${catType}`);
      return null;
    }

    // 2. Position validity
    if (!this.isValidPosition(position)) {
      console.warn(`[CatCompanionManager] Invalid placement position for ${catType}`);
      return null;
    }

    // 3. Auto-dismiss oldest if at the active cap — must happen BEFORE computing
    // surfaceY and probing occupancy so the oldest cat's PhysicsEngine static body
    // has already been removed when we query getHighestSurfaceY / isPositionOccupied.
    // Guard: only evict if the summon is otherwise viable (type ✓, position ✓, yarn ✓).
    // Yarn is confirmed non-mutating above; actual deduction happens in step 5.
    const active = this.getActiveCompanions();
    if (active.length >= runtimeConfig.maxActiveCats) {
      const oldest = active[0]!;
      this.dismiss(oldest);
    }

    // 4. Auto-raise: find a Y center that doesn't embed the cat inside a static body.
    // getHighestSurfaceY finds the top of the tallest surface at this XZ position, so
    // the default placement (surfaceY + halfHeight) is usually correct. The loop adds
    // robustness for rare cases where the cat's bounding box still clips geometry
    // (e.g. summoning near a wall edge where the XZ footprint straddles two surfaces).
    const terrainY = this.mapManager.getHeightAt(position.x, position.z);
    const physicsY = this.physics.getHighestSurfaceY(position.x, position.z);
    const surfaceY = Math.max(terrainY, physicsY);
    const halfHeight = getCatHalfHeight(def);
    const halfExtents = getCatHalfExtents(def);

    let centerY: number | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const tryY = surfaceY + halfHeight + attempt * 0.5;
      if (!this.physics.isPositionOccupied(position.x, tryY, position.z, halfExtents)) {
        centerY = tryY;
        break;
      }
    }
    if (centerY === null) {
      console.warn(
        `[CatCompanionManager] Cannot place ${catType} — position occupied after 3 raise attempts`,
      );
      this.eventBus.emit({ type: "cat:place:failed", catType, position });
      return null;
    }

    // 5. Deduct yarn and build the entity (single deduction point)
    if (!this.gameState.deductYarn(def.yarnCost)) {
      console.warn(`[CatCompanionManager] Failed to deduct yarn for ${catType}`);
      return null;
    }
    const owner = this.getPlayerEntity() ?? 0;

    // XZ collision collider for CollisionSystem (horizontal push / trigger detection).
    // Size is the XZ half-extent derived from the cat definition params or defaults.
    const xzHalfExtent = getXZHalfExtent(def);

    // Shared component assembly (Transform, Renderable, Collider, CatBehavior)
    // lives in the prefab module — the single source of truth also used by
    // headless tests. Physics body / trail / curiosity orchestration stays here.
    const entity = assembleCatEntity(this.world, {
      definition: def,
      position,
      centerY,
      owner,
      halfHeight,
      xzHalfExtent,
    });

    // Terrain and launch cats need a PhysicsEngine static body so the player can
    // land on top of them via the downward ground-detection raycast.
    //
    // Cats are rarely cubic (Loaf is 1.2×1.5×1.2, Pounce is 1.8×0.5×1.8), so we
    // pass per-axis halfExtents to the physics body. `size` is kept for back-compat
    // and is set to the largest XZ half-extent so any code path that still falls
    // back to it gets a reasonable footprint.
    if (def.effectType === "terrain" || def.effectType === "launch") {
      const half = getCatHalfExtents(def);
      const handle = this.physics.addBody(entity, {
        shape: "box",
        size: Math.max(half.x, half.z),
        halfExtents: half,
        isStatic: true,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      this.physics.setPosition(handle, { x: position.x, y: centerY, z: position.z });
      this.physicsHandles.set(entity, handle);
    }

    // Movement cats (Zoomies) get an elongated trail entity that ZoomiesSystem
    // uses for the oriented AABB speed-boost overlap check.
    if (def.effectType === "movement") {
      const trailEntity = this.createZoomiesTrail(entity, position, def);
      this.trailEntities.set(entity, trailEntity);
    }

    // Utility cats (CuriosityCat) get a CuriosityReveal component so
    // CuriositySystem can find the reveal radius and track which terrain
    // entities this cat instance revealed.
    if (def.effectType === "utility") {
      const revealRadius =
        typeof def.behavior.params?.revealRadius === "number"
          ? def.behavior.params.revealRadius
          : 5;
      this.world.addComponent(entity, createCuriosityReveal(revealRadius));
    }

    // Scale-up pop-in: 0 → 1 over 0.2 s.
    this.world.addComponent(entity, createCatScaleAnimation(0, 1, 0.2));

    this.companions.set(entity, catType);

    this.eventBus.emit({ type: "cat:summoned", entity, catType, position });

    return entity;
  }

  /**
   * Dismiss an active companion — the manual entry point (HUD / debug menu /
   * cap-eviction call this directly).
   *
   * Yarn is refunded only when the cat's CatBehavior.state is not 'Expired'
   * (i.e. it was dismissed before its natural duration elapsed). Funnels into
   * the shared beginDespawn() teardown — see that method for what happens next.
   */
  dismiss(entity: Entity): void {
    if (!this.world.isAlive(entity)) {
      this.companions.delete(entity);
      return;
    }

    // Idempotent guard: already tearing down (replaces the old
    // destroyOnComplete-animation check — the despawning map is now the
    // single source of truth for "is this cat already on its way out").
    if (this.despawning.has(entity)) return;

    const behavior = this.world.getComponent<CatBehavior>(entity, "CatBehavior");
    const refund = behavior !== null && behavior.state !== "Expired";
    this.beginDespawn(entity, { refund });
  }

  // ── Lifecycle driver (single owner — see CatLifecycle.ts / ADR-0004) ────────

  /**
   * Advances the generic cat state machine (Idle→Active, Active timer,
   * Active→Expired) and the owner's despawn-timer countdown/destruction.
   *
   * Frame position: call FIRST each fixed tick, at the exact position the
   * now-retired CatAISystem used to occupy — BEFORE the per-cat effect
   * systems (Zoomies/Curiosity/Pounce) run. This preserves the original
   * same-tick visibility: when a cat's timer crosses its duration this call,
   * effect systems observe the fresh Expired state later in the very same
   * tick, exactly as they did when CatAISystem ran first.
   */
  update(dt: number): void {
    const catEntities = this.world.query("CatBehavior", "Transform");

    for (const entity of catEntities) {
      if (!this.world.isAlive(entity)) continue;

      const behavior = this.world.getComponent<CatBehavior>(entity, "CatBehavior")!;
      const def = CAT_REGISTRY.get(behavior.catType);
      const duration = def?.behavior.duration; // undefined = permanent cat

      switch (behavior.state) {
        case "Idle":
          // Activate immediately on the first tick after summon.
          behavior.state = "Active";
          break;

        case "Active":
          if (duration !== undefined) {
            behavior.stateTimer += dt;
            if (behavior.stateTimer >= duration) {
              behavior.state = "Expired";
            }
          }
          break;

        default:
          // "Expired": handled by flushExpirations() (needs to run after
          // effects to respect despawn holds). "Cooldown": reserved.
          break;
      }
    }

    // Owner is the sole destruction authority: advance despawn timers and
    // destroy entities whose 0.2 s pop-out animation has elapsed.
    for (const [entity, remaining] of this.despawning) {
      const next = remaining - dt;
      if (next <= 0) {
        if (this.world.isAlive(entity)) this.world.destroyEntity(entity);
        this.despawning.delete(entity);
        this.despawnHolds.delete(entity);
      } else {
        this.despawning.set(entity, next);
      }
    }
  }

  /**
   * Begins despawn for every Expired cat that has no active despawn hold.
   *
   * Frame position: call AFTER the per-cat effect systems each fixed tick.
   * This is the crux of the timing-preservation contract (ADR-0004): a cat
   * that just transitioned Active→Expired THIS tick (in update() above) has
   * already had a chance, later in the SAME tick, for CuriositySystem to see
   * the fresh Expired state and place a hold before we decide whether to
   * despawn it here. That reproduces the legacy four-system pipeline exactly:
   *   - Holdless cats (Zoomies): ZoomiesSystem used to call dismiss()
   *     immediately upon seeing Expired, in the same tick CatAISystem set it.
   *     Here, flushExpirations() (still the same tick, just later in it)
   *     finds no hold and begins despawn — same-tick parity preserved.
   *   - Held cats (Curiosity): CuriositySystem places a hold in the same tick
   *     it first sees Expired (deferring despawn while terrain fades), then
   *     releases the hold once the fade completes. flushExpirations() begins
   *     despawn on that SAME tick the hold is released — matching legacy's
   *     flushDismissals(), which called dismiss() synchronously inside
   *     CuriositySystem.update() the instant the fade finished.
   */
  flushExpirations(): void {
    const catEntities = this.world.query("CatBehavior", "Transform");

    for (const entity of catEntities) {
      if (!this.world.isAlive(entity)) continue;

      const behavior = this.world.getComponent<CatBehavior>(entity, "CatBehavior");
      if (behavior?.state === "Expired" && !this.isHeld(entity)) {
        this.beginDespawn(entity, { refund: false });
      }
    }
  }

  // ── CatStateView (read-only seam for effect systems) ────────────────────────

  getCatState(entity: Entity): CatState | undefined {
    if (this.despawning.has(entity)) return "Despawning";
    return this.world.getComponent<CatBehavior>(entity, "CatBehavior")?.state;
  }

  isActive(entity: Entity): boolean {
    return this.getCatState(entity) === "Active";
  }

  holdDespawn(entity: Entity): void {
    this.despawnHolds.set(entity, (this.despawnHolds.get(entity) ?? 0) + 1);
  }

  releaseDespawn(entity: Entity): void {
    const next = (this.despawnHolds.get(entity) ?? 0) - 1;
    if (next <= 0) {
      this.despawnHolds.delete(entity);
    } else {
      this.despawnHolds.set(entity, next);
    }
  }

  private isHeld(entity: Entity): boolean {
    return (this.despawnHolds.get(entity) ?? 0) > 0;
  }

  /**
   * Shared teardown for both the manual dismiss() entry point and
   * flushExpirations() (natural expiry). Idempotent via the `despawning` map.
   *
   * Order preserved from the pre-refactor dismiss(): refund rule → remove
   * physics body → destroy trail → drop from companions → remove CatBehavior
   * + CuriosityReveal (so effect systems skip the entity during the pop-out)
   * → queue the pop-out tween → register the despawn timer (destruction now
   * happens in update(), not VisualEffectsSystem) → emit cat:dismissed.
   */
  private beginDespawn(entity: Entity, opts: { refund: boolean }): void {
    if (this.despawning.has(entity)) return; // already tearing down

    const behavior = this.world.getComponent<CatBehavior>(entity, "CatBehavior");
    const catType = this.companions.get(entity);

    // Refund yarn only if the cat hasn't expired on its own.
    if (opts.refund && behavior && behavior.state !== "Expired") {
      this.gameState.addYarn(behavior.yarnCost);
    }

    // Remove the PhysicsEngine body if this cat had one (terrain / launch cats).
    // Done immediately so players fall safely before the visual disappears.
    const physHandle = this.physicsHandles.get(entity);
    if (physHandle) {
      this.physics.removeBody(physHandle);
      this.physicsHandles.delete(entity);
    }

    // Destroy the Zoomies trail entity if this was a movement cat.
    const trailEntity = this.trailEntities.get(entity);
    if (trailEntity !== undefined && this.world.isAlive(trailEntity)) {
      this.world.destroyEntity(trailEntity);
    }
    this.trailEntities.delete(entity);

    this.companions.delete(entity);

    // Remove CatBehavior so update()/flushExpirations()/effect systems skip
    // this entity during the 0.2 s despawn animation (prevents double-despawn).
    this.world.removeComponent(entity, "CatBehavior");

    // Remove CuriosityReveal so a stale hold can't reference it once torn down.
    this.world.removeComponent(entity, "CuriosityReveal");

    // Scale-down pop-out: 1 → 0 over 0.2 s. VisualEffectsSystem only tweens —
    // this manager destroys the entity once its own despawn timer elapses.
    this.world.addComponent(entity, createCatScaleAnimation(1, 0, CatCompanionManager.DESPAWN_SECONDS));
    this.despawning.set(entity, CatCompanionManager.DESPAWN_SECONDS);
    this.despawnHolds.delete(entity);

    if (catType !== undefined) {
      this.eventBus.emit({ type: "cat:dismissed", entity, catType });
    }
  }

  /**
   * Returns a snapshot of the cat catalog — one entry per registered CatType.
   * CatCompanionManager reads from CAT_REGISTRY so no cat-specific logic lives here.
   */
  getCatalog(): CatCatalogEntry[] {
    return [...CAT_REGISTRY.values()].map((def) => ({
      type: def.type,
      name: def.name,
      yarnCost: def.yarnCost,
      description: def.description,
      unlocked: true,
    }));
  }

  /**
   * Returns all currently tracked companion entities.
   * Stale entries (externally destroyed entities) are pruned lazily.
   */
  getActiveCompanions(): Entity[] {
    for (const entity of this.companions.keys()) {
      if (!this.world.isAlive(entity)) {
        this.companions.delete(entity);
      }
    }
    return [...this.companions.keys()];
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Returns true if the player currently has enough yarn to summon the given cat type.
   * Used by CatPlacementSystem to tint the ghost preview red on insufficient funds.
   */
  canAfford(catType: CatType): boolean {
    const def = CAT_REGISTRY.get(catType);
    return def !== undefined && this.gameState.yarn >= def.yarnCost;
  }

  /**
   * A position is valid for cat placement when it falls within the map bounds
   * and on walkable terrain (not Hidden, not Water).
   * Public so CatPlacementSystem can validate ghost positions without summoning.
   */
  isValidPosition(position: Vec3): boolean {
    const cell = this.mapManager.getTerrainAt(position.x, position.z);
    return (
      cell !== null &&
      cell.type !== TerrainType.Hidden &&
      cell.type !== TerrainType.Water
    );
  }

  /**
   * Creates the elongated speed-trail entity for a Zoomies cat.
   *
   * The trail is placed starting at the cat's position and extending outward
   * in the direction from the player to the cat (i.e. the direction the player
   * was aiming).  If the player position is unavailable or coincides with the
   * cat position, the trail defaults to facing +Z.
   *
   * The trail entity has:
   *   - Transform at the trail's center
   *   - Renderable (semi-transparent elongated box, bright yellow)
   *   - ZoomiesTrail component (for ZoomiesSystem overlap detection)
   *
   * No PhysicsEngine body is registered — overlap is checked manually in
   * ZoomiesSystem using an oriented AABB test.
   */
  private createZoomiesTrail(
    catEntity: Entity,
    catPos: Vec3,
    def: CatDefinition,
  ): Entity {
    const trailLength =
      typeof def.behavior.params?.trailLength === "number"
        ? def.behavior.params.trailLength
        : 6;
    const halfLength = trailLength / 2;
    const halfWidth = 0.75;

    // Direction: from player to cat placement; fall back to +Z if unavailable.
    let dirX = 0;
    let dirZ = 1;
    const player = this.getPlayerEntity();
    if (player !== null) {
      const pt = this.world.getComponent<Transform>(player, "Transform");
      if (pt) {
        const dx = catPos.x - pt.x;
        const dz = catPos.z - pt.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0.001) {
          dirX = dx / len;
          dirZ = dz / len;
        }
      }
    }

    // Trail center: start at catPos, extend halfLength units in trail direction.
    const trailCenterX = catPos.x + dirX * halfLength;
    const trailCenterZ = catPos.z + dirZ * halfLength;
    const trailSurfaceY = this.mapManager.getHeightAt(trailCenterX, trailCenterZ);
    const trailCenterY = trailSurfaceY + 0.5;
    // Rotate the box so its local Z axis aligns with the trail direction.
    const rotationY = Math.atan2(dirX, dirZ);

    const trailEntity = this.world.createEntity();

    this.world.addComponent(
      trailEntity,
      createTransform(trailCenterX, trailCenterY, trailCenterZ, rotationY),
    );

    this.world.addComponent(
      trailEntity,
      createRenderable({
        geometry: "box",
        // dims: [width, height, depth] — depth (local Z) = trail length
        dims: [halfWidth * 2, 1.0, trailLength],
        color: "#ffe566",
        opacity: 0.4,
        castShadow: false,
        receiveShadow: false,
      }),
    );

    this.world.addComponent(
      trailEntity,
      createZoomiesTrail(catEntity, halfLength, halfWidth, dirX, dirZ),
    );

    return trailEntity;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Returns the half-height (Y half-extent) of a cat's mesh so the entity can be
 * placed with its bottom face sitting on the terrain surface.
 *
 * Exported so CatPlacementSystem can position the ghost preview identically to
 * the eventual placed cat (otherwise the ghost appears half-buried in terrain).
 *
 * - box:      dims[1] / 2  (height is the second dimension)
 * - cylinder: (dims[2] ?? size) / 2  (height is the third dimension)
 * - sphere:   size  (radius = half-height of the sphere)
 */
export function getCatHalfHeight(def: CatDefinition): number {
  const { geometry, dims, size = 0.5 } = def.meshConfig;
  if (dims) {
    if (geometry === "box") return dims[1] / 2;
    // cylinder: dims = [radiusTop, radiusBottom, height]
    return (dims[2] ?? size) / 2;
  }
  return size;
}

/**
 * Returns the XZ half-extent to use for the ECS Collider (CollisionSystem).
 * Prefers explicit colliderWidth from behavior.params; falls back to the mesh
 * footprint or a sensible default.
 *
 * Exported so test helpers (entityFactories.spawnCat) can compute the same
 * value when delegating to the shared assembleCatEntity prefab.
 */
export function getXZHalfExtent(def: CatDefinition): number {
  const params = def.behavior.params ?? {};
  if (typeof params.colliderWidth === "number") return params.colliderWidth / 2;
  const { dims, size = 0.5 } = def.meshConfig;
  // For box/cylinder, use the larger of X/Z dims as the footprint half-extent.
  if (dims) return Math.max(dims[0], dims[2] ?? dims[0]) / 2;
  return size;
}

/**
 * Returns per-axis half-extents (Vec3) for a cat's PhysicsEngine box body.
 *
 * Prefers explicit colliderWidth/Height/Depth from behavior.params (set by
 * cat definitions like Loaf), falling back to the mesh dims, then to `size`.
 *
 * Without this, the PhysicsEngine box collider would be a uniform cube of
 * side `size`, producing the wrong footprint for non-cubic cats:
 *   - Loaf (1.2 × 1.5 × 1.2): cube of 1.5 → too wide on X/Z
 *   - Pounce (1.8 × 0.5 × 1.8): cube of 0.5 → too narrow on X/Z
 */
function getCatHalfExtents(def: CatDefinition): Vec3 {
  const params = def.behavior.params ?? {};
  const { dims, size = 0.5 } = def.meshConfig;

  const widthParam = typeof params.colliderWidth === "number" ? params.colliderWidth : null;
  const heightParam = typeof params.colliderHeight === "number" ? params.colliderHeight : null;
  const depthParam = typeof params.colliderDepth === "number" ? params.colliderDepth : null;

  const width = widthParam ?? dims?.[0] ?? size * 2;
  const height = heightParam ?? dims?.[1] ?? size * 2;
  const depth = depthParam ?? dims?.[2] ?? width;

  return { x: width / 2, y: height / 2, z: depth / 2 };
}
