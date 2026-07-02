import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { PounceSystem } from "~/game/systems/PounceSystem";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { spawnPlayer, spawnCat } from "../helpers/entityFactories";
import { createMockMapManager } from "../helpers/mockMapManager";
import { CatType } from "~/game/types";
import type { CatBehavior } from "~/game/ecs/components/CatBehavior";

describe("PounceSystem", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let catManager: CatCompanionManager;
  let pounceSystem: PounceSystem;
  const DT = 1 / 60;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    const mockMap = createMockMapManager();

    catManager = new CatCompanionManager(
      world,
      eventBus,
      mockMap as any,
      gameState,
      () => null,
      physics,
    );
    // PounceSystem depends only on the CatStateView seam — the concrete
    // manager satisfies it (see src/game/cats/CatLifecycle.ts).
    pounceSystem = new PounceSystem(physics, catManager);
  });

  function setupPlayerWithPhysics(x = 0, y = 0.5, z = 0) {
    const entity = spawnPlayer(world, x, y, z);
    const handle = physics.addBody(entity, {
      shape: "circle",
      size: 0.4,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(handle, { x, y, z });
    return { entity, handle };
  }

  it("applies launch impulse when player is grounded on pounce cat", () => {
    const { handle } = setupPlayerWithPhysics(5, 0.5, 5);
    const catEntity = spawnCat(world, CatType.Pounce, 5, 0.25, 5);

    catManager.update(DT);
    const behavior = world.getComponent<CatBehavior>(catEntity, "CatBehavior")!;
    expect(behavior.state).toBe("Active");

    // Simulate grounded state
    physics.setPosition(handle, { x: 5, y: 0.4, z: 5 });
    physics.step(DT);

    pounceSystem.update(world, DT);

    const vel = physics.getVelocity(handle)!;
    expect(vel.y).toBeCloseTo(3.5, 1);
  });

  it("does not re-trigger until player exits and re-enters", () => {
    const { handle } = setupPlayerWithPhysics(5, 0.5, 5);
    spawnCat(world, CatType.Pounce, 5, 0.25, 5);

    catManager.update(DT);

    physics.setPosition(handle, { x: 5, y: 0.4, z: 5 });
    physics.step(DT);
    pounceSystem.update(world, DT);

    const vel1 = physics.getVelocity(handle)!;
    expect(vel1.y).toBeCloseTo(3.5, 1);

    physics.setVelocity(handle, { x: 0, y: 0, z: 0 });
    physics.setPosition(handle, { x: 5, y: 0.4, z: 5 });
    physics.step(DT);
    pounceSystem.update(world, DT);

    const vel2 = physics.getVelocity(handle)!;
    expect(vel2.y).toBe(0);
  });

  it("re-triggers after player fully exits and re-enters while grounded", () => {
    const { entity, handle } = setupPlayerWithPhysics(5, 0.5, 5);
    spawnCat(world, CatType.Pounce, 5, 0.25, 5);
    const playerTransform = world.getComponent(entity, "Transform") as any;

    catManager.update(DT);

    // Initial launch
    physics.setPosition(handle, { x: 5, y: 0.4, z: 5 });
    physics.step(DT);
    pounceSystem.update(world, DT);
    expect(physics.getVelocity(handle)!.y).toBeCloseTo(3.5, 1);

    // Exit: move player ECS transform far away so PounceSystem sees the exit
    playerTransform.x = 50;
    playerTransform.z = 50;
    physics.setPosition(handle, { x: 50, y: 0.4, z: 50 });
    physics.setVelocity(handle, { x: 0, y: 0, z: 0 });
    pounceSystem.update(world, DT);

    // Re-enter: move back onto cat's footprint and ensure grounded
    playerTransform.x = 5;
    playerTransform.z = 5;
    physics.setPosition(handle, { x: 5, y: 0.39, z: 5 });
    physics.setVelocity(handle, { x: 0, y: -1, z: 0 });
    physics.step(DT);
    pounceSystem.update(world, DT);

    expect(physics.getVelocity(handle)!.y).toBeCloseTo(3.5, 1);
  });

  it("does not launch when cat is not Active", () => {
    const { handle } = setupPlayerWithPhysics(5, 0.5, 5);
    spawnCat(world, CatType.Pounce, 5, 0.25, 5);

    physics.setPosition(handle, { x: 5, y: 0.4, z: 5 });
    physics.step(DT);
    pounceSystem.update(world, DT);

    const vel = physics.getVelocity(handle)!;
    expect(vel.y).toBe(0);
  });
});
