/**
 * US-309 — Resource Balance regression tests.
 *
 * Each test asserts a GDD-tuned constant so accidental config drift is caught
 * at the unit-test layer rather than discovered during play.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { RESOURCE_CONFIGS } from "~/game/config";
import { GameState } from "~/game/engine/GameState";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GatheringSystem } from "~/game/systems/GatheringSystem";
import { spawnPlayer, spawnResourceNode } from "../helpers/entityFactories";
import { createMockInputManager } from "../helpers/mockInputManager";
import { createMockSceneManager } from "../helpers/mockSceneManager";
import { GameAction, ResourceType } from "~/game/types";
import type { Entity } from "~/game/ecs/Entity";
import type { ResourceNode } from "~/game/ecs/components/ResourceNode";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Config value regression tests
// ---------------------------------------------------------------------------

describe("RESOURCE_CONFIGS values (US-309)", () => {
  describe("Grass", () => {
    it("gatherTime is 1.5s", () => {
      expect(RESOURCE_CONFIGS.Grass.gatherTime).toBe(1.5);
    });
    it("yieldAmount is 1", () => {
      expect(RESOURCE_CONFIGS.Grass.yieldAmount).toBe(1);
    });
    it("respawnTime is 30s", () => {
      expect(RESOURCE_CONFIGS.Grass.respawnTime).toBe(30);
    });
  });

  describe("Sticks", () => {
    it("gatherTime is 1.5s", () => {
      expect(RESOURCE_CONFIGS.Sticks.gatherTime).toBe(1.5);
    });
    it("yieldAmount is 1", () => {
      expect(RESOURCE_CONFIGS.Sticks.yieldAmount).toBe(1);
    });
    it("respawnTime is 45s", () => {
      expect(RESOURCE_CONFIGS.Sticks.respawnTime).toBe(45);
    });
  });

  describe("Water", () => {
    it("gatherTime is 2.0s", () => {
      expect(RESOURCE_CONFIGS.Water.gatherTime).toBe(2.0);
    });
    it("yieldAmount is 1", () => {
      expect(RESOURCE_CONFIGS.Water.yieldAmount).toBe(1);
    });
    it("respawnTime is 60s", () => {
      expect(RESOURCE_CONFIGS.Water.respawnTime).toBe(60);
    });
  });
});

describe("GameState inventory cap (US-309)", () => {
  it("maxInventoryCapacity is 10", () => {
    const state = new GameState(10);
    expect(state.maxInventoryCapacity).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Behavioral regression tests — verify config values produce expected outcomes
// ---------------------------------------------------------------------------

describe("Resource gathering behavior (US-309)", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let mockInput: ReturnType<typeof createMockInputManager>;
  let mockScene: ReturnType<typeof createMockSceneManager>;
  let system: GatheringSystem;
  let playerEntity: Entity;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(10);
    mockInput = createMockInputManager();
    mockScene = createMockSceneManager();
    playerEntity = spawnPlayer(world);
    system = new GatheringSystem(
      mockInput as any,
      mockScene as any,
      gameState,
      eventBus,
      () => playerEntity,
    );
  });

  it("Grass gather completes after 1.5s (90 frames)", () => {
    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Grass;
    spawnResourceNode(world, ResourceType.Grass, 1, 0, gatherTime, yieldAmount, respawnTime);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    // gatherTime = 1.5s at 60fps = 90 frames + 1 safety
    for (let i = 0; i < 91; i++) {
      system.update(world, DT);
    }

    expect(gameState.inventoryTotal).toBe(1);
  });

  it("Sticks gather completes after 1.5s (90 frames)", () => {
    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Sticks;
    spawnResourceNode(world, ResourceType.Sticks, 1, 0, gatherTime, yieldAmount, respawnTime);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    for (let i = 0; i < 91; i++) {
      system.update(world, DT);
    }

    expect(gameState.inventoryTotal).toBe(1);
  });

  it("Water gather completes after 2.0s (120 frames)", () => {
    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Water;
    spawnResourceNode(world, ResourceType.Water, 1, 0, gatherTime, yieldAmount, respawnTime);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    // gatherTime = 2.0s at 60fps = 120 frames + 1 safety
    for (let i = 0; i < 121; i++) {
      system.update(world, DT);
    }

    expect(gameState.inventoryTotal).toBe(1);
  });

  it("Water gather does NOT complete in 1.5s (Grass/Sticks time)", () => {
    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Water;
    spawnResourceNode(world, ResourceType.Water, 1, 0, gatherTime, yieldAmount, respawnTime);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    // 90 frames = 1.5s, which is less than Water's 2.0s gatherTime
    for (let i = 0; i < 90; i++) {
      system.update(world, DT);
    }

    expect(gameState.inventoryTotal).toBe(0);
  });

  it("Grass node enters 30s cooldown after gathering", () => {
    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Grass;
    const nodeEntity = spawnResourceNode(
      world, ResourceType.Grass, 1, 0, gatherTime, yieldAmount, respawnTime,
    );
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    for (let i = 0; i < 91; i++) {
      system.update(world, DT);
    }

    const node = world.getComponent<ResourceNode>(nodeEntity, "ResourceNode")!;
    expect(node.cooldownRemaining).toBe(RESOURCE_CONFIGS.Grass.respawnTime);
  });

  it("Sticks node enters 45s cooldown after gathering", () => {
    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Sticks;
    const nodeEntity = spawnResourceNode(
      world, ResourceType.Sticks, 1, 0, gatherTime, yieldAmount, respawnTime,
    );
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    for (let i = 0; i < 91; i++) {
      system.update(world, DT);
    }

    const node = world.getComponent<ResourceNode>(nodeEntity, "ResourceNode")!;
    expect(node.cooldownRemaining).toBe(RESOURCE_CONFIGS.Sticks.respawnTime);
  });

  it("Water node enters 60s cooldown after gathering", () => {
    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Water;
    const nodeEntity = spawnResourceNode(
      world, ResourceType.Water, 1, 0, gatherTime, yieldAmount, respawnTime,
    );
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    for (let i = 0; i < 121; i++) {
      system.update(world, DT);
    }

    const node = world.getComponent<ResourceNode>(nodeEntity, "ResourceNode")!;
    expect(node.cooldownRemaining).toBe(RESOURCE_CONFIGS.Water.respawnTime);
  });

  it("gather label shows '+1 Grass' format for floating text", () => {
    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Grass;
    spawnResourceNode(world, ResourceType.Grass, 1, 0, gatherTime, yieldAmount, respawnTime);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);

    const state = system.getGatherState();
    expect(state).not.toBeNull();
    expect(state!.label).toBe(`+${RESOURCE_CONFIGS.Grass.yieldAmount} ${ResourceType.Grass}`);
  });

  it("gather label shows '+1 Sticks' format for floating text", () => {
    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Sticks;
    spawnResourceNode(world, ResourceType.Sticks, 1, 0, gatherTime, yieldAmount, respawnTime);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);

    const state = system.getGatherState();
    expect(state).not.toBeNull();
    expect(state!.label).toBe(`+${RESOURCE_CONFIGS.Sticks.yieldAmount} ${ResourceType.Sticks}`);
  });

  it("gather label shows '+1 Water' format for floating text", () => {
    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Water;
    spawnResourceNode(world, ResourceType.Water, 1, 0, gatherTime, yieldAmount, respawnTime);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);

    const state = system.getGatherState();
    expect(state).not.toBeNull();
    expect(state!.label).toBe(`+${RESOURCE_CONFIGS.Water.yieldAmount} ${ResourceType.Water}`);
  });

  it("resource:gathered event fires with correct type on completion", () => {
    const handler = vi.fn();
    eventBus.on("resource:gathered", handler);

    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Grass;
    spawnResourceNode(world, ResourceType.Grass, 1, 0, gatherTime, yieldAmount, respawnTime);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    for (let i = 0; i < 91; i++) {
      system.update(world, DT);
    }

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "resource:gathered", resourceType: ResourceType.Grass }),
    );
  });

  it("gathering blocked when inventory is at capacity (10 items)", () => {
    for (let i = 0; i < 10; i++) {
      gameState.addResource(ResourceType.Grass);
    }

    const { gatherTime, yieldAmount, respawnTime } = RESOURCE_CONFIGS.Sticks;
    spawnResourceNode(world, ResourceType.Sticks, 1, 0, gatherTime, yieldAmount, respawnTime);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);

    expect(system.getGatherState()).toBeNull();
    expect(system.isInventoryFull()).toBe(true);
    expect(gameState.inventoryTotal).toBe(10);
  });
});
