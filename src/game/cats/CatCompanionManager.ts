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
import { createCollider } from "../ecs/components/Collider";
import { createCatBehavior } from "../ecs/components/CatBehavior";
import type { CatBehavior } from "../ecs/components/CatBehavior";
import { createZoomiesTrail } from "../ecs/components/ZoomiesTrail";
import { createCuriosityReveal } from "../ecs/components/CuriosityReveal";
import { runtimeConfig } from "../config";

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
// CatCompanionManager
//
// Single module responsible for the full companion lifecycle:
//   summon()   — validate, deduct yarn, create ECS entity, emit cat:summoned
//   dismiss()  — refund yarn (if not expired), destroy entity, emit cat:dismissed
//   getCatalog() — enumerate all registered cat types for the HUD
//   getActiveCompanions() — live list of active companion entities
//
// The Cat limit (default 3) is sourced from runtimeConfig.maxActiveCats so the
// debug menu can override it without a recompile.
// ---------------------------------------------------------------------------

export class CatCompanionManager {
  /**
   * Ordered insertion map: entity → CatType.
   * Insertion order is preserved so auto-dismiss always removes the oldest cat.
   */
  private readonly companions = new Map<Entity, CatType>();

  /**
   * Physics body handles for terrain/launch cats.
   * Populated in summon() for effectType 'terrain' | 'launch'; cleaned up in dismiss().
   */
  private readonly physicsHandles = new Map<Entity, BodyHandle>();

  /**
   * Trail entities created alongside Zoomies cats.
   * Keyed by cat entity; destroyed in dismiss() to keep the world clean.
   */
  private readonly trailEntities = new Map<Entity, Entity>();

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
   *   2. Sufficient yarn.
   *   3. Position on valid (non-void, non-water) terrain.
   *   4. Cat limit — if at cap, oldest cat is auto-dismissed before creating the new one.
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

    // 3. Auto-dismiss oldest if at the active cap
    const active = this.getActiveCompanions();
    if (active.length >= runtimeConfig.maxActiveCats) {
      const oldest = active[0]!;
      this.dismiss(oldest);
    }

    // 4. Deduct yarn and build the entity
    if (!this.gameState.deductYarn(def.yarnCost)) {
      console.warn(`[CatCompanionManager] Failed to deduct yarn for ${catType}`);
      return null;
    }

    const terrainY = this.mapManager.getHeightAt(position.x, position.z);
    const physicsY = this.physics.getHighestSurfaceY(position.x, position.z);
    const surfaceY = Math.max(terrainY, physicsY);
    const halfHeight = getCatHalfHeight(def);
    const centerY = surfaceY + halfHeight;
    const owner = this.getPlayerEntity() ?? 0;

    const entity = this.world.createEntity();

    // Place entity so its bottom face rests on terrain (center = surfaceY + halfHeight).
    this.world.addComponent(
      entity,
      createTransform(position.x, centerY, position.z),
    );

    this.world.addComponent(entity, createRenderable(def.meshConfig));

    // XZ collision collider for CollisionSystem (horizontal push / trigger detection).
    // Size is the XZ half-extent derived from the cat definition params or defaults.
    //
    // Terrain and launch cats also register a PhysicsEngine body (below) which
    // handles ground detection AND horizontal collision resolution.  Their ECS
    // Collider is set to isTrigger so CollisionSystem emits overlap events
    // without applying a second physics push — avoiding a dual-push desync
    // between PhysicsEngine body positions and ECS Transform positions.
    const xzHalfExtent = getXZHalfExtent(def);
    const hasPhysicsBody = def.effectType === "terrain" || def.effectType === "launch";
    this.world.addComponent(
      entity,
      createCollider("box", xzHalfExtent, {
        isStatic: true,
        isTrigger: hasPhysicsBody,
        collisionLayer: 1,
        collisionMask: 1,
        halfHeight,
      }),
    );

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

    this.world.addComponent(
      entity,
      createCatBehavior(catType, owner, def.yarnCost),
    );

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

    this.companions.set(entity, catType);

    this.eventBus.emit({ type: "cat:summoned", entity, catType, position });

    return entity;
  }

  /**
   * Dismiss an active companion.
   *
   * Yarn is refunded only when the cat's CatBehavior.state is not 'Expired'
   * (i.e. it was dismissed before its natural duration elapsed).
   */
  dismiss(entity: Entity): void {
    if (!this.world.isAlive(entity)) {
      this.companions.delete(entity);
      return;
    }

    const behavior = this.world.getComponent<CatBehavior>(entity, "CatBehavior");
    const catType = this.companions.get(entity);

    // Refund yarn only if the cat hasn't expired on its own
    if (behavior && behavior.state !== "Expired") {
      this.gameState.addYarn(behavior.yarnCost);
    }

    // Remove the PhysicsEngine body if this cat had one (terrain / launch cats).
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
    this.world.destroyEntity(entity);

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
 */
function getXZHalfExtent(def: CatDefinition): number {
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
