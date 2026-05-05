import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { CatAISystem } from "~/game/systems/CatAISystem";
import { CatType } from "~/game/types";
import { spawnCat } from "../helpers/entityFactories";
import type { CatBehavior } from "~/game/ecs/components/CatBehavior";

describe("CatAISystem", () => {
  let world: World;
  let system: CatAISystem;
  const DT = 1 / 60;

  beforeEach(() => {
    world = new World();
    system = new CatAISystem();
  });

  it("transitions Idle → Active on first tick", () => {
    const entity = spawnCat(world, CatType.Loaf);
    system.update(world, DT);

    const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
    expect(behavior.state).toBe("Active");
  });

  it("permanent cats (Loaf) stay Active indefinitely", () => {
    const entity = spawnCat(world, CatType.Loaf);
    system.update(world, DT);

    for (let i = 0; i < 600; i++) {
      system.update(world, DT);
    }

    const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
    expect(behavior.state).toBe("Active");
  });

  it("permanent cats (Pounce) stay Active indefinitely", () => {
    const entity = spawnCat(world, CatType.Pounce);
    system.update(world, DT);

    for (let i = 0; i < 600; i++) {
      system.update(world, DT);
    }

    const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
    expect(behavior.state).toBe("Active");
  });

  it("duration cats (Zoomies, 8s) expire after duration", () => {
    const entity = spawnCat(world, CatType.Zoomies);

    // First tick: Idle → Active
    system.update(world, DT);
    const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
    expect(behavior.state).toBe("Active");

    // 481 ticks at 1/60s = 8.016s (safely past the 8s duration)
    for (let i = 0; i < 481; i++) {
      system.update(world, DT);
    }

    expect(behavior.state).toBe("Expired");
  });

  it("duration cats (CuriosityCat, 20s) expire after duration", () => {
    const entity = spawnCat(world, CatType.CuriosityCat);

    // First tick: Idle → Active
    system.update(world, DT);

    // 1201 ticks at 1/60s = 20.016s (safely past the 20s duration)
    for (let i = 0; i < 1201; i++) {
      system.update(world, DT);
    }

    const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
    expect(behavior.state).toBe("Expired");
  });

  it("does not re-process Expired cats", () => {
    const entity = spawnCat(world, CatType.Zoomies);

    for (let i = 0; i < 600; i++) {
      system.update(world, DT);
    }

    const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
    expect(behavior.state).toBe("Expired");

    const timerAtExpiry = behavior.stateTimer;
    system.update(world, DT);
    expect(behavior.stateTimer).toBe(timerAtExpiry);
  });
});
