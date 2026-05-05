import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { WaterSystem } from "~/game/systems/WaterSystem";
import { spawnPlayer } from "../helpers/entityFactories";
import type { Entity } from "~/game/ecs/Entity";

describe("WaterSystem", () => {
  let world: World;
  let eventBus: EventBus;
  let physics: PhysicsEngine;
  let _waterSystem: WaterSystem;
  let playerEntity: Entity;
  const DT = 1 / 60;

  function createWaterTrigger(x = 0, z = 0, surfaceY = 2) {
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
    _waterSystem = new WaterSystem(world, physics, eventBus);
  });

  it("adds SwimmingState on trigger:enter with water entity", () => {
    const waterEntity = createWaterTrigger();

    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });

    const swimming = world.getComponent(playerEntity, "SwimmingState");
    expect(swimming).not.toBeNull();
  });

  it("adds OxygenState on trigger:enter", () => {
    const waterEntity = createWaterTrigger();

    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });

    const oxygen = world.getComponent(playerEntity, "OxygenState");
    expect(oxygen).not.toBeNull();
  });

  it("removes SwimmingState on trigger:exit", () => {
    const waterEntity = createWaterTrigger();

    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });
    expect(world.getComponent(playerEntity, "SwimmingState")).not.toBeNull();

    eventBus.emit({ type: "trigger:exit", trigger: waterEntity, target: playerEntity });
    expect(world.getComponent(playerEntity, "SwimmingState")).toBeNull();
  });

  it("removes OxygenState on trigger:exit", () => {
    const waterEntity = createWaterTrigger();

    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });
    eventBus.emit({ type: "trigger:exit", trigger: waterEntity, target: playerEntity });

    expect(world.getComponent(playerEntity, "OxygenState")).toBeNull();
  });

  it("disables gravity on water entry", () => {
    const waterEntity = createWaterTrigger();
    const handle = physics.addBody(playerEntity, {
      shape: "circle",
      size: 0.4,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(handle, { x: 0, y: 5, z: 0 });
    physics.setVelocity(handle, { x: 0, y: 0, z: 0 });

    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });

    physics.step(DT);
    const vel = physics.getVelocity(handle)!;
    expect(vel.y).toBe(0);
  });

  it("re-enables gravity on water exit", () => {
    const waterEntity = createWaterTrigger();
    const handle = physics.addBody(playerEntity, {
      shape: "circle",
      size: 0.4,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(handle, { x: 0, y: 5, z: 0 });

    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });
    eventBus.emit({ type: "trigger:exit", trigger: waterEntity, target: playerEntity });

    physics.setVelocity(handle, { x: 0, y: 0, z: 0 });
    physics.step(DT);
    const vel = physics.getVelocity(handle)!;
    expect(vel.y).toBeLessThan(0);
  });

  it("ignores duplicate trigger:enter", () => {
    const waterEntity = createWaterTrigger();

    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });
    eventBus.emit({ type: "trigger:enter", trigger: waterEntity, target: playerEntity });

    const swimming = world.getComponent(playerEntity, "SwimmingState");
    expect(swimming).not.toBeNull();
  });
});
