import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { MovementSystem } from "~/game/systems/MovementSystem";
import { spawnPlayerEntity } from "~/game/ecs/prefabs";
import { createMockInputManager } from "../helpers/mockInputManager";
import type { Velocity } from "~/game/ecs/components/Velocity";
import type { Entity } from "~/game/ecs/Entity";

// ---------------------------------------------------------------------------
// MovementSystem.test.ts — AC3 drift catcher.
//
// Runs MovementSystem over a prefab-built player entity. MovementSystem reads
// velocity.dx/dy/dz (MovementSystem.ts:127-143); the old entityFactories test
// helper built Velocity as {x,y,z} instead of {dx,dy,dz}, so those reads were
// `undefined` → moveToward(undefined, …) → NaN. This test fails against that
// shape and passes once entities are built through spawnPlayerEntity /
// createVelocity().
// ---------------------------------------------------------------------------

describe("MovementSystem — prefab-built player (Velocity drift catcher)", () => {
  let world: World;
  let eventBus: EventBus;
  let physics: PhysicsEngine;
  let mockInput: ReturnType<typeof createMockInputManager>;
  let movement: MovementSystem;
  let player: Entity;
  const DT = 1 / 60;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    physics = new PhysicsEngine(eventBus);
    mockInput = createMockInputManager();

    player = spawnPlayerEntity(world, {
      position: { x: 0, y: 1, z: 0 },
      physics,
    });

    movement = new MovementSystem(mockInput as never, physics);
  });

  it("moves toward +X with a finite, non-NaN velocity", () => {
    mockInput.setMovementIntent(1, 0);

    for (let i = 0; i < 10; i++) {
      movement.update(world, DT);
    }

    const v = world.getComponent<Velocity>(player, "Velocity")!;
    expect(Number.isNaN(v.dx)).toBe(false);
    expect(v.dx).toBeGreaterThan(0);
  });

  it("writes a finite velocity to the physics body", () => {
    mockInput.setMovementIntent(0, 1);

    for (let i = 0; i < 10; i++) {
      movement.update(world, DT);
    }

    const handle = physics.getHandleByEntity(player)!;
    const physVel = physics.getVelocity(handle)!;
    expect(Number.isNaN(physVel.x)).toBe(false);
    expect(Number.isNaN(physVel.z)).toBe(false);
    expect(physVel.z).toBeGreaterThan(0);
  });
});
