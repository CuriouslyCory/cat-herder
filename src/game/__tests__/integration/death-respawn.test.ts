import { describe, it, expect, beforeEach, vi } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { WaterSystem } from "~/game/systems/WaterSystem";
import { OxygenSystem } from "~/game/systems/OxygenSystem";
import { GatheringSystem } from "~/game/systems/GatheringSystem";
import { GameState } from "~/game/engine/GameState";
import {
  spawnPlayer,
  spawnSwimmingPlayer,
  spawnResourceNode,
} from "../helpers/entityFactories";
import { createMockInputManager } from "../helpers/mockInputManager";
import { createMockSceneManager } from "../helpers/mockSceneManager";
import type { OxygenState } from "~/game/ecs/components/OxygenState";
import type { SwimmingState } from "~/game/ecs/components/SwimmingState";
import type { PlayerControlled } from "~/game/ecs/components/PlayerControlled";
import type { Transform } from "~/game/ecs/components/Transform";
import type { Entity } from "~/game/ecs/Entity";
import { GameAction, ResourceType } from "~/game/types";

const DT = 1 / 60;

// Replicates the respawn logic from Game._onPlayerDeath — used in tests that
// need the full death→respawn cycle without instantiating the full Game class.
// Mirrors the FIXED implementation: velocity is zeroed after teleport.
function installRespawnHandler(
  eventBus: EventBus,
  world: World,
  physics: PhysicsEngine,
  spawnPoint: { x: number; y: number; z: number },
): void {
  eventBus.on("player:death", ({ entity }) => {
    const player = world.getComponent<PlayerControlled>(entity, "PlayerControlled");
    if (!player) return;
    player.health = player.maxHealth;
    world.removeComponent(entity, "SwimmingState");
    world.removeComponent(entity, "OxygenState");
    const handle = physics.getHandleByEntity(entity);
    if (handle) physics.setGravityEnabled(handle, true);
    if (handle) physics.setPosition(handle, spawnPoint);
    if (handle) physics.setVelocity(handle, { x: 0, y: 0, z: 0 });
    const transform = world.getComponent<Transform>(entity, "Transform");
    if (transform) {
      transform.x = spawnPoint.x;
      transform.y = spawnPoint.y;
      transform.z = spawnPoint.z;
    }
  });
}

// ── Death Respawn ──────────────────────────────────────────────────────────────

describe("Integration: Death Respawn", () => {
  let world: World;
  let eventBus: EventBus;
  let physics: PhysicsEngine;
  let oxygenSystem: OxygenSystem;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    physics = new PhysicsEngine(eventBus);
    new WaterSystem(world, physics, eventBus);
    oxygenSystem = new OxygenSystem(eventBus);
  });

  it("emits player:death when oxygen depletion drives health to zero", () => {
    const playerEntity = spawnSwimmingPlayer(world);
    const swimming = world.getComponent<SwimmingState>(playerEntity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(playerEntity, "OxygenState")!;
    const player = world.getComponent<PlayerControlled>(playerEntity, "PlayerControlled")!;

    swimming.isDiving = true;
    oxygen.oxygenPercent = 0;
    player.health = 1;

    const deathHandler = vi.fn();
    eventBus.on("player:death", deathHandler);

    for (let i = 0; i < 120; i++) {
      oxygenSystem.update(world, DT);
      if (deathHandler.mock.calls.length > 0) break;
    }

    expect(deathHandler).toHaveBeenCalledOnce();
    expect(deathHandler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "player:death", entity: playerEntity }),
    );
  });

  it("respawns player at spawn point with full health after death", () => {
    const spawnPoint = { x: 5, y: 1, z: 5 };
    const playerEntity = spawnSwimmingPlayer(world);
    const swimming = world.getComponent<SwimmingState>(playerEntity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(playerEntity, "OxygenState")!;
    const player = world.getComponent<PlayerControlled>(playerEntity, "PlayerControlled")!;

    swimming.isDiving = true;
    oxygen.oxygenPercent = 0;
    player.health = 1;

    installRespawnHandler(eventBus, world, physics, spawnPoint);

    for (let i = 0; i < 120; i++) {
      oxygenSystem.update(world, DT);
      if (player.health === player.maxHealth) break;
    }

    expect(player.health).toBe(player.maxHealth);
  });

  it("removes SwimmingState and OxygenState from the entity after death respawn", () => {
    const spawnPoint = { x: 5, y: 1, z: 5 };
    const playerEntity = spawnSwimmingPlayer(world);
    const swimming = world.getComponent<SwimmingState>(playerEntity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(playerEntity, "OxygenState")!;
    const player = world.getComponent<PlayerControlled>(playerEntity, "PlayerControlled")!;

    swimming.isDiving = true;
    oxygen.oxygenPercent = 0;
    player.health = 1;

    installRespawnHandler(eventBus, world, physics, spawnPoint);

    for (let i = 0; i < 120; i++) {
      oxygenSystem.update(world, DT);
      if (!world.getComponent(playerEntity, "SwimmingState")) break;
    }

    expect(world.getComponent(playerEntity, "SwimmingState")).toBeNull();
    expect(world.getComponent(playerEntity, "OxygenState")).toBeNull();
  });

  it("does not emit player:death more than once per death event (respawn resets state)", () => {
    const spawnPoint = { x: 5, y: 1, z: 5 };
    const playerEntity = spawnSwimmingPlayer(world);
    const swimming = world.getComponent<SwimmingState>(playerEntity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(playerEntity, "OxygenState")!;
    const player = world.getComponent<PlayerControlled>(playerEntity, "PlayerControlled")!;

    swimming.isDiving = true;
    oxygen.oxygenPercent = 0;
    player.health = 1;

    installRespawnHandler(eventBus, world, physics, spawnPoint);

    const deathHandler = vi.fn();
    eventBus.on("player:death", deathHandler);

    // Run well past the death trigger point
    for (let i = 0; i < 120; i++) {
      oxygenSystem.update(world, DT);
    }

    // Handler fires once; respawn removes OxygenState so OxygenSystem stops processing
    expect(deathHandler).toHaveBeenCalledOnce();
  });

  it("clears physics velocity to zero on respawn (regression: retained velocity caused slide/fall off spawn)", () => {
    const spawnPoint = { x: 5, y: 1, z: 5 };
    const playerEntity = spawnSwimmingPlayer(world);

    // Register a physics body for the player so velocity can be tracked.
    const playerHandle = physics.addBody(playerEntity, {
      shape: "circle",
      size: 0.4,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });

    // Give the body a non-zero velocity to simulate dying while moving/falling.
    physics.setVelocity(playerHandle, { x: 3, y: -8, z: 2 });

    const swimming = world.getComponent<SwimmingState>(playerEntity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(playerEntity, "OxygenState")!;
    const player = world.getComponent<PlayerControlled>(playerEntity, "PlayerControlled")!;

    swimming.isDiving = true;
    oxygen.oxygenPercent = 0;
    player.health = 1;

    installRespawnHandler(eventBus, world, physics, spawnPoint);

    for (let i = 0; i < 120; i++) {
      oxygenSystem.update(world, DT);
      if (player.health === player.maxHealth) break;
    }

    // Respawn must have fired (health restored).
    expect(player.health).toBe(player.maxHealth);

    // The body's velocity must be zeroed after respawn.
    const velocity = physics.getVelocity(playerHandle);
    expect(velocity).toEqual({ x: 0, y: 0, z: 0 });

    // Spawn position must also be correct.
    const transform = world.getComponent<Transform>(playerEntity, "Transform");
    expect(transform?.x).toBe(spawnPoint.x);
    expect(transform?.y).toBe(spawnPoint.y);
    expect(transform?.z).toBe(spawnPoint.z);
  });
});

// ── Inventory Full Feedback ────────────────────────────────────────────────────

describe("Integration: Inventory Full Feedback", () => {
  it("reports inventory full and blocks gather when inventory is at capacity", () => {
    const world = new World();
    const eventBus = new EventBus();
    const gameState = new GameState(0);
    const mockInput = createMockInputManager();
    const mockScene = createMockSceneManager();

    const playerEntity = spawnPlayer(world, 0, 0.5, 0);
    spawnResourceNode(world, ResourceType.Grass, 0.5, 0, 1.5, 1, 30);

    // Fill inventory to capacity
    for (let i = 0; i < gameState.maxInventoryCapacity; i++) {
      gameState.addResource(ResourceType.Grass, 1);
    }

    const system = new GatheringSystem(
      mockInput as any,
      mockScene as any,
      gameState,
      eventBus,
      () => playerEntity,
    );

    mockInput.pressAction(GameAction.Interact);
    system.update(world, DT);

    expect(system.isInventoryFull()).toBe(true);
    expect(system.getGatherState()).toBeNull();
  });

  it("does not start gathering when inventory is full — no progress ticks", () => {
    const world = new World();
    const eventBus = new EventBus();
    const gameState = new GameState(0);
    const mockInput = createMockInputManager();
    const mockScene = createMockSceneManager();

    const playerEntity = spawnPlayer(world, 0, 0.5, 0);
    spawnResourceNode(world, ResourceType.Grass, 0.5, 0, 1.5, 1, 30);

    for (let i = 0; i < gameState.maxInventoryCapacity; i++) {
      gameState.addResource(ResourceType.Grass, 1);
    }

    const system = new GatheringSystem(
      mockInput as any,
      mockScene as any,
      gameState,
      eventBus,
      () => playerEntity,
    );

    mockInput.pressAction(GameAction.Interact);
    for (let i = 0; i < 5; i++) system.update(world, DT);

    // Even after multiple ticks, no gather started
    expect(system.getGatherState()).toBeNull();
    // Inventory count unchanged
    expect(gameState.inventoryTotal).toBe(gameState.maxInventoryCapacity);
  });
});

// ── Save While Swimming ─────────────────────────────────────────────────────────

describe("Integration: Save While Swimming — initial overlap detection", () => {
  let world: World;
  let eventBus: EventBus;
  let physics: PhysicsEngine;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    physics = new PhysicsEngine(eventBus);
    new WaterSystem(world, physics, eventBus);
  });

  function addWaterZone(
    entity: Entity,
    cx: number,
    cz: number,
    halfSize: number,
    surfaceY: number,
  ): void {
    world.addComponent(entity, { type: "WaterTrigger", surfaceY });
    world.addComponent(entity, {
      type: "Transform",
      x: cx,
      y: 0,
      z: cz,
      rotationY: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    });
    const handle = physics.addBody(entity, {
      shape: "box",
      size: halfSize,
      isStatic: true,
      isTrigger: true,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(handle, { x: cx, y: 0, z: cz });
  }

  it("adds SwimmingState when player spawns inside a water trigger (simulates load at swimming position)", () => {
    const waterEntity = world.createEntity();
    addWaterZone(waterEntity, 0, 0, 5, 2);

    // Player spawns inside the water zone (x=0, z=0) — as if loaded from a save
    const playerEntity = spawnPlayer(world, 0, 0.5, 0);
    const playerHandle = physics.addBody(playerEntity, {
      shape: "circle",
      size: 0.4,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(playerHandle, { x: 0, y: 0.5, z: 0 });

    // First step detects the overlap (activeOverlaps was empty → trigger:enter fires)
    physics.step(DT);

    expect(world.getComponent(playerEntity, "SwimmingState")).not.toBeNull();
  });

  it("does not add SwimmingState when player spawns outside the water trigger", () => {
    const waterEntity = world.createEntity();
    addWaterZone(waterEntity, 0, 0, 2, 2);

    // Player spawns well outside the water zone
    const playerEntity = spawnPlayer(world, 10, 0.5, 10);
    const playerHandle = physics.addBody(playerEntity, {
      shape: "circle",
      size: 0.4,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(playerHandle, { x: 10, y: 0.5, z: 10 });

    physics.step(DT);

    expect(world.getComponent(playerEntity, "SwimmingState")).toBeNull();
  });
});
