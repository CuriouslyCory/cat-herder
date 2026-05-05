import { World } from "~/game/ecs/World";
import { createTransform } from "~/game/ecs/components/Transform";
import { createPlayerControlled } from "~/game/ecs/components/PlayerControlled";
import { createCatBehavior } from "~/game/ecs/components/CatBehavior";
import { createOxygenState } from "~/game/ecs/components/OxygenState";
import { createSwimmingState } from "~/game/ecs/components/SwimmingState";
import { createResourceNode } from "~/game/ecs/components/ResourceNode";
import { createYarnPickup } from "~/game/ecs/components/YarnPickup";
import { createHiddenTerrain } from "~/game/ecs/components/HiddenTerrain";
import { createCuriosityReveal } from "~/game/ecs/components/CuriosityReveal";
import { createZoomiesTrail } from "~/game/ecs/components/ZoomiesTrail";
import { createSpeedBoost } from "~/game/ecs/components/SpeedBoost";
import type { CatType, ResourceType } from "~/game/types";
import type { Entity } from "~/game/ecs/Entity";

export function spawnPlayer(
  world: World,
  x = 0,
  y = 0.5,
  z = 0,
): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, createTransform(x, y, z));
  world.addComponent(entity, { type: "Velocity", x: 0, y: 0, z: 0 });
  world.addComponent(entity, createPlayerControlled());
  return entity;
}

export function spawnCat(
  world: World,
  catType: CatType,
  x = 5,
  y = 0.75,
  z = 5,
  yarnCost = 2,
): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, createTransform(x, y, z));
  world.addComponent(entity, createCatBehavior(catType, 1, yarnCost));
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
  const entity = world.createEntity();
  world.addComponent(entity, createTransform(x, 0.5, z));
  world.addComponent(entity, createResourceNode(resourceType, gatherTime, yieldAmount, respawnTime));
  return entity;
}

export function spawnYarnPickup(
  world: World,
  x = 0,
  z = 0,
  amount = 3,
): Entity {
  const entity = world.createEntity();
  world.addComponent(entity, createTransform(x, 0.5, z));
  world.addComponent(entity, createYarnPickup(amount));
  return entity;
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
