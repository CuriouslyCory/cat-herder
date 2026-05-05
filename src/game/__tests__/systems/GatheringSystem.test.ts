import { describe, it, expect, beforeEach, vi } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { GatheringSystem } from "~/game/systems/GatheringSystem";
import { spawnPlayer, spawnResourceNode } from "../helpers/entityFactories";
import { createMockInputManager } from "../helpers/mockInputManager";
import { createMockSceneManager } from "../helpers/mockSceneManager";
import { GameAction, ResourceType } from "~/game/types";
import type { Entity } from "~/game/ecs/Entity";
import type { ResourceNode } from "~/game/ecs/components/ResourceNode";

describe("GatheringSystem", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let mockInput: ReturnType<typeof createMockInputManager>;
  let mockScene: ReturnType<typeof createMockSceneManager>;
  let system: GatheringSystem;
  let playerEntity: Entity;
  const DT = 1 / 60;

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

  it("starts gathering on E press near resource node", () => {
    spawnResourceNode(world, ResourceType.Grass, 1, 0, 2, 1, 10);
    mockInput.pressAction(GameAction.Interact);

    system.update(world, DT);

    expect(system.getGatherState()).not.toBeNull();
    expect(system.getGatherState()!.progress).toBe(0);
  });

  it("completes gather after gatherTime elapsed", () => {
    spawnResourceNode(world, ResourceType.Grass, 1, 0, 2, 3, 10);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    // gatherTime = 2s, need 121 ticks (2 / (1/60) = 120 + 1 safety for float)
    for (let i = 0; i < 121; i++) {
      system.update(world, DT);
    }

    expect(gameState.inventoryTotal).toBe(3);
  });

  it("emits resource:gathered on completion", () => {
    const handler = vi.fn();
    eventBus.on("resource:gathered", handler);

    spawnResourceNode(world, ResourceType.Sticks, 1, 0, 1, 1, 10);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    // gatherTime = 1s → 61 ticks (60 + 1 safety for float)
    for (let i = 0; i < 61; i++) {
      system.update(world, DT);
    }

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "resource:gathered", resourceType: ResourceType.Sticks }),
    );
  });

  it("cancels gathering on movement", () => {
    spawnResourceNode(world, ResourceType.Grass, 1, 0, 2, 1, 10);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    mockInput.setMovementIntent(1, 0);
    system.update(world, DT);

    expect(system.getGatherState()).toBeNull();
  });

  it("cancels gathering on second E press", () => {
    spawnResourceNode(world, ResourceType.Grass, 1, 0, 2, 1, 10);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    system.update(world, DT);

    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);

    expect(system.getGatherState()).toBeNull();
  });

  it("shows inventory full when capacity reached", () => {
    for (let i = 0; i < 10; i++) {
      gameState.addResource(ResourceType.Grass);
    }

    spawnResourceNode(world, ResourceType.Sticks, 1, 0, 1, 1, 10);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);

    expect(system.isInventoryFull()).toBe(true);
    expect(system.getGatherState()).toBeNull();
  });

  it("does not gather distant nodes", () => {
    spawnResourceNode(world, ResourceType.Grass, 50, 50, 2, 1, 10);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);

    expect(system.getGatherState()).toBeNull();
  });

  it("node enters cooldown after gathering", () => {
    const nodeEntity = spawnResourceNode(world, ResourceType.Grass, 1, 0, 1, 1, 10);
    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);
    mockInput.reset();

    for (let i = 0; i < 60; i++) {
      system.update(world, DT);
    }

    const node = world.getComponent<ResourceNode>(nodeEntity, "ResourceNode")!;
    expect(node.cooldownRemaining).toBe(10);
  });
});
