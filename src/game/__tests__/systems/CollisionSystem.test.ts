import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { CollisionSystem } from "~/game/systems/CollisionSystem";
import { createTransform } from "~/game/ecs/components/Transform";
import { createCollider } from "~/game/ecs/components/Collider";
import type { Transform } from "~/game/ecs/components/Transform";

describe("CollisionSystem", () => {
  let world: World;
  let eventBus: EventBus;
  let system: CollisionSystem;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    system = new CollisionSystem(eventBus);
  });

  describe("Y-overlap guard", () => {
    it("does not push circle when above a box (Y separated)", () => {
      const box = world.createEntity();
      world.addComponent(box, createTransform(0, 0.375, 0));
      world.addComponent(
        box,
        createCollider("box", 0.6, {
          isStatic: true,
          halfHeight: 0.375,
        }),
      );

      const circle = world.createEntity();
      world.addComponent(circle, createTransform(0, 1.15, 0));
      world.addComponent(circle, createCollider("circle", 0.4, { halfHeight: 0.4 }));

      system.update(world, 1 / 60);

      const t = world.getComponent<Transform>(circle, "Transform")!;
      expect(t.x).toBeCloseTo(0, 2);
      expect(t.z).toBeCloseTo(0, 2);
    });

    it("pushes circle when overlapping box in Y", () => {
      const box = world.createEntity();
      world.addComponent(box, createTransform(0, 0.375, 0));
      world.addComponent(
        box,
        createCollider("box", 0.6, {
          isStatic: true,
          halfHeight: 0.375,
        }),
      );

      const circle = world.createEntity();
      world.addComponent(circle, createTransform(0.3, 0.4, 0));
      world.addComponent(circle, createCollider("circle", 0.4, { halfHeight: 0.4 }));

      system.update(world, 1 / 60);

      const t = world.getComponent<Transform>(circle, "Transform")!;
      expect(Math.abs(t.x)).toBeGreaterThan(0.3);
    });
  });

  describe("per-axis halfExtents for box colliders", () => {
    it("does not push circle when outside narrow axis of a long thin box", () => {
      // Simulates a boundary wall: wide on X (half=31), thin on Z (half=0.5)
      // centered at z=-30.5.  A circle at the origin should NOT collide.
      const wall = world.createEntity();
      world.addComponent(wall, createTransform(0, 2.5, -30.5));
      world.addComponent(
        wall,
        createCollider("box", 31, {
          isStatic: true,
          halfHeight: 2.5,
          halfExtents: { x: 31, z: 0.5 },
        }),
      );

      const circle = world.createEntity();
      world.addComponent(circle, createTransform(0, 0.4, 0));
      world.addComponent(circle, createCollider("circle", 0.4, { halfHeight: 0.4 }));

      system.update(world, 1 / 60);

      const t = world.getComponent<Transform>(circle, "Transform")!;
      expect(t.x).toBeCloseTo(0, 2);
      expect(t.z).toBeCloseTo(0, 2);
    });

    it("pushes circle when actually near a thin box wall", () => {
      // Wall at z=-30.5, thin on Z (half=0.5) → Z range [-31, -30].
      // Circle at z=-29.8 is outside the box but within circle radius (0.4).
      const wall = world.createEntity();
      world.addComponent(wall, createTransform(0, 0.4, -30.5));
      world.addComponent(
        wall,
        createCollider("box", 31, {
          isStatic: true,
          halfHeight: 0.4,
          halfExtents: { x: 31, z: 0.5 },
        }),
      );

      const circle = world.createEntity();
      world.addComponent(circle, createTransform(0, 0.4, -29.8));
      world.addComponent(circle, createCollider("circle", 0.4, { halfHeight: 0.4 }));

      system.update(world, 1 / 60);

      const t = world.getComponent<Transform>(circle, "Transform")!;
      // Circle should be pushed away from the wall (toward +Z)
      expect(t.z).toBeGreaterThan(-29.8);
    });

    it("uniform size is used when halfExtents is null", () => {
      // Box with size=0.6 and no halfExtents — should use uniform size
      const box = world.createEntity();
      world.addComponent(box, createTransform(0, 0.4, 0));
      world.addComponent(
        box,
        createCollider("box", 0.6, {
          isStatic: true,
          halfHeight: 0.4,
        }),
      );

      const circle = world.createEntity();
      world.addComponent(circle, createTransform(0.3, 0.4, 0));
      world.addComponent(circle, createCollider("circle", 0.4, { halfHeight: 0.4 }));

      system.update(world, 1 / 60);

      const t = world.getComponent<Transform>(circle, "Transform")!;
      expect(Math.abs(t.x)).toBeGreaterThan(0.3);
    });
  });
});
