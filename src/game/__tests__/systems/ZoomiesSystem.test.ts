import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { ZoomiesSystem } from "~/game/systems/ZoomiesSystem";
import { CatAISystem } from "~/game/systems/CatAISystem";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { spawnPlayer, spawnZoomiesTrail, spawnCat } from "../helpers/entityFactories";
import { createMockMapManager } from "../helpers/mockMapManager";
import { CatType } from "~/game/types";
import type { CatBehavior } from "~/game/ecs/components/CatBehavior";
import type { SpeedBoost } from "~/game/ecs/components/SpeedBoost";

describe("ZoomiesSystem", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let catManager: CatCompanionManager;
  let zoomiesSystem: ZoomiesSystem;
  let catAI: CatAISystem;
  const DT = 1 / 60;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    const mockMap = createMockMapManager();
    let playerEntity: number | null = null;

    catManager = new CatCompanionManager(
      world,
      eventBus,
      mockMap as any,
      gameState,
      () => playerEntity,
      physics,
    );
    zoomiesSystem = new ZoomiesSystem(catManager);
    catAI = new CatAISystem();

    playerEntity = spawnPlayer(world);
  });

  it("applies SpeedBoost when player is inside trail", () => {
    const playerEntities = world.query("Transform", "PlayerControlled");
    const playerEntity = playerEntities[0]!;

    const catEntity = spawnCat(world, CatType.Zoomies, 0, 0.5, 3);
    catAI.update(world, DT);

    const trailEntity = spawnZoomiesTrail(world, catEntity, 0, 3, 0, 1, 3, 0.75);

    zoomiesSystem.update(world, DT);

    const boost = world.getComponent<SpeedBoost>(playerEntity, "SpeedBoost");
    expect(boost).not.toBeNull();
    expect(boost!.multiplier).toBe(2);
  });

  it("removes SpeedBoost when player leaves trail", () => {
    const playerEntities = world.query("Transform", "PlayerControlled");
    const playerEntity = playerEntities[0]!;

    const catEntity = spawnCat(world, CatType.Zoomies, 0, 0.5, 3);
    catAI.update(world, DT);
    spawnZoomiesTrail(world, catEntity, 0, 3, 0, 1, 3, 0.75);

    zoomiesSystem.update(world, DT);
    expect(world.getComponent<SpeedBoost>(playerEntity, "SpeedBoost")).not.toBeNull();

    const playerTransform = world.getComponent(playerEntity, "Transform") as any;
    playerTransform.z = 50;

    zoomiesSystem.update(world, DT);
    expect(world.getComponent<SpeedBoost>(playerEntity, "SpeedBoost")).toBeNull();
  });

  it("auto-dismisses expired Zoomies cats", () => {
    const catEntity = spawnCat(world, CatType.Zoomies, 10, 0.5, 10);
    spawnZoomiesTrail(world, catEntity, 10, 10, 0, 1, 3, 0.75);

    // First tick: Idle → Active
    catAI.update(world, DT);

    // 481 more ticks to exceed 8s duration
    for (let i = 0; i < 481; i++) {
      catAI.update(world, DT);
    }

    const behavior = world.getComponent<CatBehavior>(catEntity, "CatBehavior")!;
    expect(behavior.state).toBe("Expired");

    zoomiesSystem.update(world, DT);

    expect(world.isAlive(catEntity)).toBe(false);
  });
});
