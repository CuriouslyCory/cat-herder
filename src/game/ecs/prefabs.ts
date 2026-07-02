import type { World } from "./World";
import type { Entity } from "./Entity";
import type { PhysicsEngine } from "../engine/PhysicsEngine";
import type { MeshConfig } from "../engine/SceneManager";
import { ResourceType } from "../types";
import type { MapDataResourceNode, MapDataYarnPickup } from "../maps/MapData";
import type { CatDefinition } from "../cats/CatDefinition";

import { createTransform } from "./components/Transform";
import { createVelocity } from "./components/Velocity";
import { createPlayerControlled } from "./components/PlayerControlled";
import { createRenderable } from "./components/Renderable";
import { createCollider } from "./components/Collider";
import { createResourceNode } from "./components/ResourceNode";
import { createYarnPickup } from "./components/YarnPickup";
import { createCatBehavior } from "./components/CatBehavior";
import { RESOURCE_CONFIGS, runtimeConfig } from "../config";

// ---------------------------------------------------------------------------
// prefabs.ts — the single source of truth for entity spawn recipes.
//
// Every recipe here is a pure function: it creates an entity, adds ECS
// components, and — only when a PhysicsEngine is supplied — registers a
// physics body. This lets production wire up bodies for movement/collision
// while headless tests build behavior-identical entities without one.
//
// This module is intentionally headless: no DOM, no Three.js runtime import
// (MeshConfig / PhysicsEngine are imported as types only).
//
// Consumed by: Game.ts (spawnPlayer, spawnMapResourceNodes, spawnMapYarnPickups),
// DebugMenu.applySpawnResourceNode, CatCompanionManager.summon, and the test
// factories in __tests__/helpers/entityFactories.ts.
// ---------------------------------------------------------------------------

// ── Player ───────────────────────────────────────────────────────────────

export interface PlayerPrefabOptions {
  position: { x: number; y: number; z: number };
  /** Visual + size from CharacterCreator. Defaults match Game.spawnPlayer. */
  appearance?: {
    shape?: MeshConfig["geometry"];
    sizeScale?: number;
    colorHex?: string;
  };
  /** Collider/body radius. Defaults to runtimeConfig.collisionRadius. */
  collisionRadius?: number;
  /** When provided, registers a dynamic physics body positioned at `position`. */
  physics?: PhysicsEngine;
  /** Enable rim-light on the Renderable. Defaults to runtimeConfig.visual.rimLighting. */
  rimLight?: boolean;
}

/**
 * Spawns the player entity: Transform, Velocity, PlayerControlled, Renderable,
 * Collider — and, when `physics` is supplied, a dynamic physics body positioned
 * at `position`. Uses `createVelocity()` for the correct `{dx,dy,dz}` shape.
 */
export function spawnPlayerEntity(
  world: World,
  opts: PlayerPrefabOptions,
): Entity {
  const { x, y, z } = opts.position;
  const s = opts.appearance?.sizeScale ?? 1;
  const shape = opts.appearance?.shape ?? "box";
  const color = opts.appearance?.colorHex ?? "#ff6b35";
  const collisionRadius = opts.collisionRadius ?? runtimeConfig.collisionRadius;
  const rimLight = opts.rimLight ?? runtimeConfig.visual.rimLighting;

  const entity = world.createEntity();

  world.addComponent(entity, createTransform(x, y, z));
  world.addComponent(entity, createVelocity());
  world.addComponent(entity, createPlayerControlled());
  world.addComponent(
    entity,
    createRenderable({
      geometry: shape,
      size: 0.5 * s,
      color,
      castShadow: true,
      emissive: color,
      emissiveIntensity: 0.15,
      rimLight: rimLight
        ? { color: 0xffffff, power: 2.0, intensity: 0.5 }
        : undefined,
      outlineCategory: "player",
    }),
  );
  world.addComponent(
    entity,
    createCollider("circle", collisionRadius, {
      collisionLayer: 1,
      collisionMask: 1,
    }),
  );

  if (opts.physics) {
    const handle = opts.physics.addBody(entity, {
      shape: "circle",
      size: collisionRadius,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    opts.physics.setPosition(handle, { x, y, z });
  }

  return entity;
}

// ── Resource node ────────────────────────────────────────────────────────

/**
 * Per-type render colors for resource nodes (stable lookup, avoids inline
 * literals). Single source of truth — previously duplicated in Game.ts
 * (_RESOURCE_NODE_COLORS) and DebugMenu.ts (COLORS).
 */
const RESOURCE_NODE_COLORS: Record<ResourceType, string> = {
  [ResourceType.Grass]: "#7bc67e",
  [ResourceType.Sticks]: "#8b6355",
  [ResourceType.Water]: "#4fc3f7",
};

const RESOURCE_NODE_Y = 0.5;

export interface ResourceNodePrefabOptions {
  /** MapData-driven — ADR-0002 §3. */
  node: MapDataResourceNode;
  /** Accepted for API symmetry with the other prefabs; resource nodes have
   *  never registered a PhysicsEngine body (GatheringSystem uses distance,
   *  CollisionSystem reads the ECS Collider directly) — kept unused to stay
   *  behavior-identical with the original recipe. */
  physics?: PhysicsEngine;
}

/**
 * Single source of truth for the resource-node cooldown id.
 * MUST stay `node_${x}_${z}` — save-data compatibility depends on it (ADR-0002 §5).
 */
export function resourceNodeId(x: number, z: number): string {
  return `node_${x}_${z}`;
}

/**
 * Spawns a resource node entity from map data: Transform, Renderable, Collider
 * (static trigger), ResourceNode. gatherTime/yieldAmount come from
 * RESOURCE_CONFIGS[type]; respawnTime comes from the node itself.
 */
export function spawnResourceNodeEntity(
  world: World,
  opts: ResourceNodePrefabOptions,
): { entity: Entity; nodeId: string } {
  const { x, z, type, respawnTime } = opts.node;
  const color = RESOURCE_NODE_COLORS[type] ?? "#888888";
  const cfg = RESOURCE_CONFIGS[type as keyof typeof RESOURCE_CONFIGS];

  const entity = world.createEntity();

  world.addComponent(entity, createTransform(x, RESOURCE_NODE_Y, z));
  world.addComponent(
    entity,
    createRenderable({
      geometry: type === ResourceType.Sticks ? "cylinder" : "sphere",
      size: 0.4,
      color,
      castShadow: true,
      emissive: color,
      emissiveIntensity: 0.2,
      outlineCategory: "resource",
    }),
  );
  // Trigger collider — same layer as player so CollisionSystem can detect
  // proximity (not used for trigger events here; GatheringSystem uses distance).
  world.addComponent(
    entity,
    createCollider("circle", 0.5, {
      isStatic: true,
      isTrigger: true,
      collisionLayer: 1,
      collisionMask: 0, // no collision response needed — just a marker
    }),
  );
  world.addComponent(
    entity,
    createResourceNode(type, cfg.gatherTime, cfg.yieldAmount, respawnTime),
  );

  return { entity, nodeId: resourceNodeId(x, z) };
}

// ── Yarn pickup ──────────────────────────────────────────────────────────

const YARN_PICKUP_Y = 0.5;

export interface YarnPickupPrefabOptions {
  /** MapData-driven — ADR-0002 §3. */
  pickup: MapDataYarnPickup;
  /** Accepted for API symmetry; yarn pickups have never registered a
   *  PhysicsEngine body — kept unused to stay behavior-identical. */
  physics?: PhysicsEngine;
}

/**
 * Spawns a yarn pickup entity from map data: Transform, Renderable, YarnPickup.
 */
export function spawnYarnPickupEntity(
  world: World,
  opts: YarnPickupPrefabOptions,
): Entity {
  const { x, z, yarnAmount } = opts.pickup;
  const entity = world.createEntity();

  world.addComponent(entity, createTransform(x, YARN_PICKUP_Y, z));
  world.addComponent(
    entity,
    createRenderable({
      geometry: "sphere",
      size: 0.3,
      color: "#ffd700",
      castShadow: true,
      emissive: "#ffd700",
      emissiveIntensity: 0.5,
      outlineCategory: "pickup",
    }),
  );
  world.addComponent(entity, createYarnPickup(yarnAmount));

  return entity;
}

// ── Cat companion (component assembly only — seam for #26) ────────────────

export interface CatPrefabOptions {
  definition: CatDefinition;
  position: { x: number; y: number; z: number };
  centerY: number;
  owner: Entity;
  halfHeight: number;
  xzHalfExtent: number;
}

/**
 * Adds the four core cat components: Transform, Renderable(def.meshConfig),
 * Collider, CatBehavior. Does NOT handle yarn, cap eviction, physics bodies,
 * trail entities, or curiosity reveal — those stay in CatCompanionManager
 * (orchestration), which calls this for the shared component assembly.
 */
export function assembleCatEntity(world: World, opts: CatPrefabOptions): Entity {
  const { definition: def, position, centerY, owner, halfHeight, xzHalfExtent } = opts;

  const entity = world.createEntity();

  // Place entity so its bottom face rests on terrain (center = surfaceY + halfHeight).
  // Scale starts at 0; VisualEffectsSystem tweens it to 1 over 0.2s (summon pop-in).
  world.addComponent(entity, createTransform(position.x, centerY, position.z, 0, 0, 0, 0));

  world.addComponent(entity, createRenderable(def.meshConfig));

  // Terrain and launch cats also register a PhysicsEngine body (in
  // CatCompanionManager) which handles ground detection AND horizontal
  // collision resolution. Their ECS Collider is set to isTrigger so
  // CollisionSystem emits overlap events without applying a second physics
  // push — avoiding a dual-push desync between PhysicsEngine body positions
  // and ECS Transform positions.
  const hasPhysicsBody = def.effectType === "terrain" || def.effectType === "launch";
  world.addComponent(
    entity,
    createCollider("box", xzHalfExtent, {
      isStatic: true,
      isTrigger: hasPhysicsBody,
      collisionLayer: 1,
      collisionMask: 1,
      halfHeight,
    }),
  );

  world.addComponent(entity, createCatBehavior(def.type, owner, def.yarnCost));

  return entity;
}
