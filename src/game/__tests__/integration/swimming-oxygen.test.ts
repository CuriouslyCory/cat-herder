import { describe, it, expect, beforeEach, vi } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { WaterSystem } from "~/game/systems/WaterSystem";
import { OxygenSystem } from "~/game/systems/OxygenSystem";
import { spawnPlayer } from "../helpers/entityFactories";
import type { OxygenState } from "~/game/ecs/components/OxygenState";
import type { SwimmingState } from "~/game/ecs/components/SwimmingState";
import type { PlayerControlled } from "~/game/ecs/components/PlayerControlled";
import type { Entity } from "~/game/ecs/Entity";

describe("Integration: Swimming + Oxygen", () => {
  let world: World;
  let eventBus: EventBus;
  let physics: PhysicsEngine;
  let oxygenSystem: OxygenSystem;
  let playerEntity: Entity;
  const DT = 1 / 60;

  function createWaterZone(x = 0, z = 0, surfaceY = 2) {
    const entity = world.createEntity();
    world.addComponent(entity, { type: "WaterTrigger", surfaceY });
    world.addComponent(entity, { type: "Transform", x, y: 1, z, rotationY: 0, scaleX: 1, scaleY: 1, scaleZ: 1 });
    return entity;
  }

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    physics = new PhysicsEngine(eventBus);
    playerEntity = spawnPlayer(world);
    new WaterSystem(world, physics, eventBus);
    oxygenSystem = new OxygenSystem(eventBus);
  });

  it("full water lifecycle: enter → dive → oxygen drains → surface → refills → exit → reset", () => {
    const waterEntity = createWaterZone();

    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });

    const swimming = world.getComponent<SwimmingState>(playerEntity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(playerEntity, "OxygenState")!;
    expect(swimming).not.toBeNull();
    expect(oxygen.oxygenPercent).toBe(100);

    swimming.isDiving = true;
    for (let i = 0; i < 60; i++) {
      oxygenSystem.update(world, DT);
    }
    expect(oxygen.oxygenPercent).toBeLessThan(100);
    const afterDiving = oxygen.oxygenPercent;

    swimming.isDiving = false;
    for (let i = 0; i < 60; i++) {
      oxygenSystem.update(world, DT);
    }
    expect(oxygen.oxygenPercent).toBeGreaterThan(afterDiving);

    eventBus.emit({ type: "trigger:exit", trigger: waterEntity, target: playerEntity });
    expect(world.getComponent(playerEntity, "SwimmingState")).toBeNull();
    expect(world.getComponent(playerEntity, "OxygenState")).toBeNull();
  });

  it("oxygen depletion causes health loss", () => {
    const waterEntity = createWaterZone();
    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });

    const swimming = world.getComponent<SwimmingState>(playerEntity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(playerEntity, "OxygenState")!;
    const player = world.getComponent<PlayerControlled>(playerEntity, "PlayerControlled")!;

    swimming.isDiving = true;
    oxygen.oxygenPercent = 0;

    const initialHealth = player.health;

    for (let i = 0; i < 60; i++) {
      oxygenSystem.update(world, DT);
    }

    expect(player.health).toBeLessThan(initialHealth);
  });

  it("oxygen warning fires at 20% then health drain starts at 0%", () => {
    const waterEntity = createWaterZone();
    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });

    const swimming = world.getComponent<SwimmingState>(playerEntity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(playerEntity, "OxygenState")!;

    const warningHandler = vi.fn();
    const depletedHandler = vi.fn();
    eventBus.on("oxygen:warning", warningHandler);
    eventBus.on("oxygen:depleted", depletedHandler);

    swimming.isDiving = true;

    // Drain fully: 100% / (3.33%/s) ≈ 30s = 1800 ticks + buffer for float
    for (let i = 0; i < 2000; i++) {
      oxygenSystem.update(world, DT);
    }

    expect(warningHandler).toHaveBeenCalled();
    expect(depletedHandler).toHaveBeenCalled();
  });
});
