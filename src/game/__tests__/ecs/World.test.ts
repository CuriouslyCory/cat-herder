import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { createTransform } from "~/game/ecs/components/Transform";
import { createPlayerControlled } from "~/game/ecs/components/PlayerControlled";

describe("World", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  describe("entity lifecycle", () => {
    it("creates entities with incrementing IDs", () => {
      const e1 = world.createEntity();
      const e2 = world.createEntity();
      expect(e2).toBe(e1 + 1);
    });

    it("reports entity as alive after creation", () => {
      const e = world.createEntity();
      expect(world.isAlive(e)).toBe(true);
    });

    it("reports entity as dead after destruction", () => {
      const e = world.createEntity();
      world.destroyEntity(e);
      expect(world.isAlive(e)).toBe(false);
    });
  });

  describe("component management", () => {
    it("stores and retrieves components by type", () => {
      const e = world.createEntity();
      const transform = createTransform(1, 2, 3);
      world.addComponent(e, transform);

      const retrieved = world.getComponent(e, "Transform");
      expect(retrieved).toBe(transform);
      expect(retrieved?.type).toBe("Transform");
    });

    it("returns null for missing components", () => {
      const e = world.createEntity();
      expect(world.getComponent(e, "Transform")).toBeNull();
    });

    it("removes components", () => {
      const e = world.createEntity();
      world.addComponent(e, createTransform());
      world.removeComponent(e, "Transform");
      expect(world.getComponent(e, "Transform")).toBeNull();
    });

    it("silently ignores operations on dead entities", () => {
      const e = world.createEntity();
      world.destroyEntity(e);
      world.addComponent(e, createTransform());
      expect(world.getComponent(e, "Transform")).toBeNull();
    });
  });

  describe("query", () => {
    it("returns entities matching all requested component types", () => {
      const e1 = world.createEntity();
      world.addComponent(e1, createTransform());
      world.addComponent(e1, createPlayerControlled());

      const e2 = world.createEntity();
      world.addComponent(e2, createTransform());

      const result = world.query("Transform", "PlayerControlled");
      expect(result).toContain(e1);
      expect(result).not.toContain(e2);
    });

    it("returns empty array when no entities match", () => {
      const result = world.query("Transform");
      expect(result).toEqual([]);
    });

    it("caches query results", () => {
      const e = world.createEntity();
      world.addComponent(e, createTransform());

      const r1 = world.query("Transform");
      const r2 = world.query("Transform");
      expect(r1).toBe(r2);
    });

    it("invalidates cache on addComponent", () => {
      const e = world.createEntity();
      world.addComponent(e, createTransform());

      const before = world.query("Transform", "PlayerControlled");
      world.addComponent(e, createPlayerControlled());
      const after = world.query("Transform", "PlayerControlled");

      expect(before).toHaveLength(0);
      expect(after).toContain(e);
    });

    it("invalidates cache on destroyEntity", () => {
      const e = world.createEntity();
      world.addComponent(e, createTransform());

      const before = world.query("Transform");
      expect(before).toContain(e);

      world.destroyEntity(e);
      const after = world.query("Transform");
      expect(after).not.toContain(e);
    });
  });
});
