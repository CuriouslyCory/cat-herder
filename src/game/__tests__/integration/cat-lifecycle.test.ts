import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CatAISystem } from "~/game/systems/CatAISystem";
import { ZoomiesSystem } from "~/game/systems/ZoomiesSystem";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { spawnPlayer } from "../helpers/entityFactories";
import { createMockMapManager } from "../helpers/mockMapManager";
import { CatType } from "~/game/types";
import type { CatBehavior } from "~/game/ecs/components/CatBehavior";
import type { Entity } from "~/game/ecs/Entity";

describe("Integration: Cat Lifecycle (Summon → Active → Expired → Dismiss)", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let catManager: CatCompanionManager;
  let catAI: CatAISystem;
  let zoomiesSystem: ZoomiesSystem;
  let playerEntity: Entity;
  const DT = 1 / 60;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    const mockMap = createMockMapManager();
    playerEntity = spawnPlayer(world);

    catManager = new CatCompanionManager(
      world,
      eventBus,
      mockMap as any,
      gameState,
      () => playerEntity,
      physics,
    );
    catAI = new CatAISystem();
    zoomiesSystem = new ZoomiesSystem(catManager);
  });

  it("Zoomies full lifecycle: summon → deduct yarn → 8s active → expired → auto-dismiss → yarn consumed", () => {
    const initialYarn = gameState.yarn;
    const entity = catManager.summon(CatType.Zoomies, { x: 10, y: 0, z: 10 })!;
    expect(entity).not.toBeNull();

    const yarnCost = initialYarn - gameState.yarn;
    expect(yarnCost).toBeGreaterThan(0);

    // First tick: Idle → Active
    catAI.update(world, DT);
    const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
    expect(behavior.state).toBe("Active");

    // 480 ticks still Active (just under 8s)
    for (let i = 0; i < 480; i++) {
      catAI.update(world, DT);
    }
    expect(behavior.state).toBe("Active");

    // One more tick pushes past 8s
    catAI.update(world, DT);
    expect(behavior.state).toBe("Expired");

    const yarnBeforeDismiss = gameState.yarn;
    zoomiesSystem.update(world, DT);

    expect(world.isAlive(entity)).toBe(false);
    expect(gameState.yarn).toBe(yarnBeforeDismiss);
  });

  it("manual dismiss of active Zoomies refunds yarn", () => {
    const entity = catManager.summon(CatType.Zoomies, { x: 10, y: 0, z: 10 })!;
    const yarnAfterSummon = gameState.yarn;

    catAI.update(world, DT);

    catManager.dismiss(entity);
    expect(gameState.yarn).toBeGreaterThan(yarnAfterSummon);
  });

  it("Loaf persists indefinitely until manually dismissed", () => {
    const entity = catManager.summon(CatType.Loaf, { x: 5, y: 0, z: 5 })!;

    for (let i = 0; i < 3600; i++) {
      catAI.update(world, DT);
    }

    const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
    expect(behavior.state).toBe("Active");
    expect(world.isAlive(entity)).toBe(true);

    catManager.dismiss(entity);
    expect(world.isAlive(entity)).toBe(false);
  });

});
