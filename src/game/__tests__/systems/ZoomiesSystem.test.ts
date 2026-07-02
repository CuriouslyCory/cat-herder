import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { ZoomiesSystem } from "~/game/systems/ZoomiesSystem";
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
    // ZoomiesSystem depends only on the CatStateView seam — the concrete
    // manager satisfies it (see src/game/cats/CatLifecycle.ts).
    zoomiesSystem = new ZoomiesSystem(catManager);

    playerEntity = spawnPlayer(world);
  });

  it("applies SpeedBoost when player is inside trail", () => {
    const playerEntities = world.query("Transform", "PlayerControlled");
    const playerEntity = playerEntities[0]!;

    const catEntity = spawnCat(world, CatType.Zoomies, 0, 0.5, 3);
    catManager.update(DT);

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
    catManager.update(DT);
    spawnZoomiesTrail(world, catEntity, 0, 3, 0, 1, 3, 0.75);

    zoomiesSystem.update(world, DT);
    expect(world.getComponent<SpeedBoost>(playerEntity, "SpeedBoost")).not.toBeNull();

    const playerTransform = world.getComponent(playerEntity, "Transform") as any;
    playerTransform.z = 50;

    zoomiesSystem.update(world, DT);
    expect(world.getComponent<SpeedBoost>(playerEntity, "SpeedBoost")).toBeNull();
  });

  it("stops granting SpeedBoost once the cat expires (no longer Active)", () => {
    const playerEntities = world.query("Transform", "PlayerControlled");
    const playerEntity = playerEntities[0]!;

    const catEntity = spawnCat(world, CatType.Zoomies, 10, 0.5, 10);
    spawnZoomiesTrail(world, catEntity, 10, 10, 0, 1, 3, 0.75);

    // First tick: Idle → Active
    catManager.update(DT);

    // 481 more ticks to exceed the 8s duration
    for (let i = 0; i < 481; i++) {
      catManager.update(DT);
    }

    const behavior = world.getComponent<CatBehavior>(catEntity, "CatBehavior")!;
    expect(behavior.state).toBe("Expired");

    // Player standing inside the trail footprint the whole time.
    const playerTransform = world.getComponent(playerEntity, "Transform") as any;
    playerTransform.x = 10;
    playerTransform.z = 10;

    // ZoomiesSystem is a pure effect: it must NOT call dismiss()/destroy —
    // it only gates SpeedBoost on isActive(), which is now false.
    zoomiesSystem.update(world, DT);

    expect(world.getComponent<SpeedBoost>(playerEntity, "SpeedBoost")).toBeNull();
    // CatBehavior is untouched by ZoomiesSystem — despawn is CatCompanionManager's
    // exclusive concern (flushExpirations()), not asserted here.
    expect(world.getComponent(catEntity, "CatBehavior")).not.toBeNull();
  });
});
