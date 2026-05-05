import { describe, it, expect, beforeEach, vi } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { OxygenSystem } from "~/game/systems/OxygenSystem";
import { spawnSwimmingPlayer } from "../helpers/entityFactories";
import type { OxygenState } from "~/game/ecs/components/OxygenState";
import type { SwimmingState } from "~/game/ecs/components/SwimmingState";
import type { PlayerControlled } from "~/game/ecs/components/PlayerControlled";

describe("OxygenSystem", () => {
  let world: World;
  let eventBus: EventBus;
  let system: OxygenSystem;
  const DT = 1 / 60;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    system = new OxygenSystem(eventBus);
  });

  it("does not drain oxygen when on surface (not diving)", () => {
    const entity = spawnSwimmingPlayer(world);
    const oxygen = world.getComponent<OxygenState>(entity, "OxygenState")!;
    expect(oxygen.oxygenPercent).toBe(100);

    system.update(world, DT);
    expect(oxygen.oxygenPercent).toBe(100);
  });

  it("drains oxygen while diving", () => {
    const entity = spawnSwimmingPlayer(world);
    const swimming = world.getComponent<SwimmingState>(entity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(entity, "OxygenState")!;

    swimming.isDiving = true;
    system.update(world, 1);

    expect(oxygen.oxygenPercent).toBeCloseTo(100 - 3.33, 1);
  });

  it("refills oxygen on surface at 5%/s", () => {
    const entity = spawnSwimmingPlayer(world);
    const oxygen = world.getComponent<OxygenState>(entity, "OxygenState")!;
    oxygen.oxygenPercent = 50;

    system.update(world, 1);
    expect(oxygen.oxygenPercent).toBeCloseTo(55, 1);
  });

  it("caps oxygen at 100%", () => {
    const entity = spawnSwimmingPlayer(world);
    const oxygen = world.getComponent<OxygenState>(entity, "OxygenState")!;
    oxygen.oxygenPercent = 99;

    system.update(world, 1);
    expect(oxygen.oxygenPercent).toBe(100);
  });

  it("emits oxygen:warning at 20% threshold", () => {
    const entity = spawnSwimmingPlayer(world);
    const swimming = world.getComponent<SwimmingState>(entity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(entity, "OxygenState")!;

    swimming.isDiving = true;
    oxygen.oxygenPercent = 21;

    const handler = vi.fn();
    eventBus.on("oxygen:warning", handler);

    system.update(world, 1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "oxygen:warning", entity }),
    );
  });

  it("emits oxygen:warning only once per submersion", () => {
    const entity = spawnSwimmingPlayer(world);
    const swimming = world.getComponent<SwimmingState>(entity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(entity, "OxygenState")!;

    swimming.isDiving = true;
    oxygen.oxygenPercent = 21;

    const handler = vi.fn();
    eventBus.on("oxygen:warning", handler);

    system.update(world, 1);
    system.update(world, 1);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("drains health at 1 hp/s when oxygen depleted", () => {
    const entity = spawnSwimmingPlayer(world);
    const swimming = world.getComponent<SwimmingState>(entity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(entity, "OxygenState")!;
    const player = world.getComponent<PlayerControlled>(entity, "PlayerControlled")!;

    swimming.isDiving = true;
    oxygen.oxygenPercent = 0;

    system.update(world, 1);
    expect(player.health).toBe(4);
  });

  it("emits oxygen:depleted when oxygen first hits 0", () => {
    const entity = spawnSwimmingPlayer(world);
    const swimming = world.getComponent<SwimmingState>(entity, "SwimmingState")!;
    const oxygen = world.getComponent<OxygenState>(entity, "OxygenState")!;

    swimming.isDiving = true;
    oxygen.oxygenPercent = 0;

    const handler = vi.fn();
    eventBus.on("oxygen:depleted", handler);

    system.update(world, DT);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
