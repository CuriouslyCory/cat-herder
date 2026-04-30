import type { World } from "../ecs/World";
import type { Entity } from "../ecs/Entity";
import type { EventBus } from "../engine/EventBus";
import type { GameState } from "../engine/GameState";
import type { MapManager } from "../maps/MapManager";
import type { PhysicsEngine, BodyHandle } from "../engine/PhysicsEngine";
import type { Vec3 } from "../types";
import { CatType, TerrainType } from "../types";
import { CAT_REGISTRY } from "./definitions";
import type { CatDefinition } from "./CatDefinition";
import { createTransform } from "../ecs/components/Transform";
import { createRenderable } from "../ecs/components/Renderable";
import { createCollider } from "../ecs/components/Collider";
import { createCatBehavior } from "../ecs/components/CatBehavior";
import type { CatBehavior } from "../ecs/components/CatBehavior";
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
    this.gameState.deductYarn(def.yarnCost);

    const surfaceY = this.mapManager.getHeightAt(position.x, position.z);
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
    const xzHalfExtent = getXZHalfExtent(def);
    this.world.addComponent(
      entity,
      createCollider("box", xzHalfExtent, {
        isStatic: true,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      }),
    );

    // Terrain and launch cats need a PhysicsEngine static body so the player can
    // land on top of them via the downward ground-detection raycast.
    if (def.effectType === "terrain" || def.effectType === "launch") {
      const handle = this.physics.addBody(entity, {
        shape: "box",
        size: halfHeight,
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
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Returns the half-height (Y half-extent) of a cat's mesh so the entity can be
 * placed with its bottom face sitting on the terrain surface.
 *
 * - box:      dims[1] / 2  (height is the second dimension)
 * - cylinder: (dims[2] ?? size) / 2  (height is the third dimension)
 * - sphere:   size  (radius = half-height of the sphere)
 */
function getCatHalfHeight(def: CatDefinition): number {
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
