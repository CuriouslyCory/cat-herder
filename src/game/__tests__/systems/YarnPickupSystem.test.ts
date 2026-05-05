import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { GameState } from "~/game/engine/GameState";
import { YarnPickupSystem } from "~/game/systems/YarnPickupSystem";
import { spawnPlayer, spawnYarnPickup } from "../helpers/entityFactories";
import type { Entity } from "~/game/ecs/Entity";

describe("YarnPickupSystem", () => {
  let world: World;
  let gameState: GameState;
  let system: YarnPickupSystem;
  let playerEntity: Entity;
  const DT = 1 / 60;

  beforeEach(() => {
    world = new World();
    gameState = new GameState(10);
    playerEntity = spawnPlayer(world);
    system = new YarnPickupSystem(gameState, () => playerEntity);
  });

  it("collects yarn when player is within pickup radius", () => {
    spawnYarnPickup(world, 0, 0, 3);

    system.update(world, DT);

    expect(gameState.yarn).toBe(13);
  });

  it("destroys pickup entity after collection", () => {
    const pickup = spawnYarnPickup(world, 0, 0, 3);

    system.update(world, DT);

    expect(world.isAlive(pickup)).toBe(false);
  });

  it("does not collect distant pickups", () => {
    spawnYarnPickup(world, 10, 10, 3);

    system.update(world, DT);

    expect(gameState.yarn).toBe(10);
  });

  it("collects multiple pickups in one frame", () => {
    spawnYarnPickup(world, 0, 0, 3);
    spawnYarnPickup(world, 0.5, 0, 5);

    system.update(world, DT);

    expect(gameState.yarn).toBe(18);
  });

  it("does nothing without a player entity", () => {
    const noPlayerSystem = new YarnPickupSystem(gameState, () => null);
    spawnYarnPickup(world, 0, 0, 3);

    noPlayerSystem.update(world, DT);

    expect(gameState.yarn).toBe(10);
  });
});
