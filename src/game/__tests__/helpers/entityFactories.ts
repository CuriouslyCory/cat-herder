import { World } from "~/game/ecs/World";
import { createOxygenState } from "~/game/ecs/components/OxygenState";
import { createSwimmingState } from "~/game/ecs/components/SwimmingState";
import { createHiddenTerrain } from "~/game/ecs/components/HiddenTerrain";
import { createCuriosityReveal } from "~/game/ecs/components/CuriosityReveal";
import { createZoomiesTrail } from "~/game/ecs/components/ZoomiesTrail";
import { createTransform } from "~/game/ecs/components/Transform";
import { createCatBehavior } from "~/game/ecs/components/CatBehavior";
import type { CatBehavior } from "~/game/ecs/components/CatBehavior";
import type { ResourceNode } from "~/game/ecs/components/ResourceNode";
import {
  spawnPlayerEntity,
  spawnResourceNodeEntity,
  spawnYarnPickupEntity,
  assembleCatEntity,
} from "~/game/ecs/prefabs";
import { CAT_REGISTRY } from "~/game/cats/definitions";
import { getCatHalfHeight, getXZHalfExtent } from "~/game/cats/CatCompanionManager";
import type { CatType, ResourceType } from "~/game/types";
import type { Entity } from "~/game/ecs/Entity";

// ---------------------------------------------------------------------------
// Test entity factories — thin wrappers that delegate to the shared prefab
// module (src/game/ecs/prefabs.ts) so tests build entities through the exact
// same recipes production uses. No parallel component assembly lives here.
// ---------------------------------------------------------------------------

export function spawnPlayer(
  world: World,
  x = 0,
  y = 0.5,
  z = 0,
): Entity {
  // No `physics` passed — headless tests never needed a PhysicsEngine body
  // for these player entities; they only queried by component presence.
  return spawnPlayerEntity(world, { position: { x, y, z } });
}

export function spawnCat(
  world: World,
  catType: CatType,
  x = 5,
  y = 0.75,
  z = 5,
  yarnCost = 2,
): Entity {
  const def = CAT_REGISTRY.get(catType);
  if (!def) {
    // Fallback for an unregistered CatType (e.g. a test double) — keeps a
    // minimal Transform + CatBehavior entity rather than throwing.
    const entity = world.createEntity();
    world.addComponent(entity, createTransform(x, y, z));
    world.addComponent(entity, createCatBehavior(catType, 1, yarnCost));
    return entity;
  }

  // Delegates the core 4-component assembly (Transform, Renderable, Collider,
  // CatBehavior) to the same prefab CatCompanionManager.summon() uses.
  const entity = assembleCatEntity(world, {
    definition: def,
    position: { x, y, z },
    centerY: y,
    owner: 1,
    halfHeight: getCatHalfHeight(def),
    xzHalfExtent: getXZHalfExtent(def),
  });

  // Test callers may request a yarnCost independent of the definition's real
  // cost (default param predates CAT_REGISTRY-derived costs) — override after
  // assembly so existing test expectations are unaffected.
  const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
  behavior.yarnCost = yarnCost;

  return entity;
}

export function spawnSwimmingPlayer(
  world: World,
  x = 0,
  y = 1,
  z = 0,
  surfaceY = 1.5,
): Entity {
  const entity = spawnPlayer(world, x, y, z);
  world.addComponent(entity, createSwimmingState(surfaceY));
  world.addComponent(entity, createOxygenState());
  return entity;
}

export function spawnResourceNode(
  world: World,
  resourceType: ResourceType,
  x = 1,
  z = 0,
  gatherTime = 2,
  yieldAmount = 1,
  respawnTime = 10,
): Entity {
  const { entity } = spawnResourceNodeEntity(world, {
    node: { x, z, type: resourceType, respawnTime },
  });

  // Production always derives gatherTime/yieldAmount from RESOURCE_CONFIGS
  // via the prefab. Some tests (e.g. GatheringSystem.test.ts) intentionally
  // pass non-production timings to keep test loops short — override after
  // assembly so those callers keep their exact prior behavior.
  const node = world.getComponent<ResourceNode>(entity, "ResourceNode")!;
  node.gatherTime = gatherTime;
  node.yieldAmount = yieldAmount;

  return entity;
}

export function spawnYarnPickup(
  world: World,
  x = 0,
  z = 0,
  amount = 3,
): Entity {
  return spawnYarnPickupEntity(world, { pickup: { x, z, yarnAmount: amount } });
}

export function spawnHiddenTerrain(
  world: World,
  x = 3,
  z = 3,
): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, createTransform(x, 0.5, z));
  world.addComponent(entity, createHiddenTerrain());
  world.addComponent(entity, {
    type: "Renderable",
    meshConfig: { geometry: "box", dims: [2, 0.5, 2], color: "#888" },
    sceneHandle: null,
  });
  return entity;
}

export function spawnCuriosityRevealCat(
  world: World,
  x = 3,
  z = 3,
  revealRadius = 5,
): Entity {
  const entity = spawnCat(world, "CuriosityCat" as CatType, x, 0.75, z);
  world.addComponent(entity, createCuriosityReveal(revealRadius));
  return entity;
}

export function spawnZoomiesTrail(
  world: World,
  catEntity: Entity,
  x = 3,
  z = 0,
  dirX = 0,
  dirZ = 1,
  halfLength = 3,
  halfWidth = 0.75,
): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, createTransform(x, 0.5, z));
  world.addComponent(entity, createZoomiesTrail(catEntity, halfLength, halfWidth, dirX, dirZ));
  return entity;
}
