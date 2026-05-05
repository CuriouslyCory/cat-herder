import { describe, it, expect, beforeEach, vi } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CuriositySystem } from "~/game/systems/CuriositySystem";
import { CatAISystem } from "~/game/systems/CatAISystem";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { spawnPlayer, spawnHiddenTerrain, spawnCuriosityRevealCat } from "../helpers/entityFactories";
import { createMockSceneManager } from "../helpers/mockSceneManager";
import { createMockMapManager } from "../helpers/mockMapManager";
import { CatType } from "~/game/types";
import type { HiddenTerrain } from "~/game/ecs/components/HiddenTerrain";
import type { CatBehavior } from "~/game/ecs/components/CatBehavior";

describe("CuriositySystem", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let catManager: CatCompanionManager;
  let curiositySystem: CuriositySystem;
  let catAI: CatAISystem;
  let mockScene: ReturnType<typeof createMockSceneManager>;
  const DT = 1 / 60;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    mockScene = createMockSceneManager();
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
    curiositySystem = new CuriositySystem(mockScene as any, catManager, eventBus);
    catAI = new CatAISystem();

    playerEntity = spawnPlayer(world);
  });

  it("reveals hidden terrain within radius on activation", () => {
    const terrain = spawnHiddenTerrain(world, 3, 3);
    spawnCuriosityRevealCat(world, 3, 3, 5);

    catAI.update(world, DT);
    curiositySystem.update(world, DT);

    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.isRevealed).toBe(true);
    expect(ht.revealCount).toBe(1);
  });

  it("does not reveal terrain outside radius", () => {
    const terrain = spawnHiddenTerrain(world, 50, 50);
    spawnCuriosityRevealCat(world, 3, 3, 5);

    catAI.update(world, DT);
    curiositySystem.update(world, DT);

    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.isRevealed).toBe(false);
  });

  it("emits hidden:terrain:revealed event", () => {
    const handler = vi.fn();
    eventBus.on("hidden:terrain:revealed", handler);

    spawnHiddenTerrain(world, 3, 3);
    spawnCuriosityRevealCat(world, 3, 3, 5);

    catAI.update(world, DT);
    curiositySystem.update(world, DT);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hidden:terrain:revealed" }),
    );
  });

  it("hides terrain and dismisses cat on expiry", () => {
    const terrain = spawnHiddenTerrain(world, 3, 3);
    const catEntity = spawnCuriosityRevealCat(world, 3, 3, 5);

    catAI.update(world, DT);
    curiositySystem.update(world, DT);

    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.isRevealed).toBe(true);

    for (let i = 0; i < 1200; i++) {
      catAI.update(world, DT);
    }

    const behavior = world.getComponent<CatBehavior>(catEntity, "CatBehavior")!;
    expect(behavior.state).toBe("Expired");

    curiositySystem.update(world, DT);

    expect(ht.isRevealed).toBe(false);
    expect(ht.revealCount).toBe(0);
    expect(world.isAlive(catEntity)).toBe(false);
  });

  it("handles overlapping reveal from multiple cats", () => {
    const terrain = spawnHiddenTerrain(world, 3, 3);
    spawnCuriosityRevealCat(world, 3, 3, 5);
    spawnCuriosityRevealCat(world, 4, 4, 5);

    catAI.update(world, DT);
    curiositySystem.update(world, DT);

    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.revealCount).toBe(2);
    expect(ht.isRevealed).toBe(true);
  });
});
