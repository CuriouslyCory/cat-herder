import { describe, it, expect, beforeEach, vi } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { spawnPlayer } from "../helpers/entityFactories";
import { createMockMapManager } from "../helpers/mockMapManager";
import { CatType, TerrainType } from "~/game/types";
import type { Entity } from "~/game/ecs/Entity";
import type { CatBehavior } from "~/game/ecs/components/CatBehavior";
import type { Transform } from "~/game/ecs/components/Transform";
import type { Collider } from "~/game/ecs/components/Collider";

describe("CatCompanionManager", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let mockMap: ReturnType<typeof createMockMapManager>;
  let manager: CatCompanionManager;
  let playerEntity: Entity;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    mockMap = createMockMapManager();
    playerEntity = spawnPlayer(world);

    manager = new CatCompanionManager(
      world,
      eventBus,
      mockMap as any,
      gameState,
      () => playerEntity,
      physics,
    );
  });

  describe("summon", () => {
    it("creates entity and deducts yarn", () => {
      const initialYarn = gameState.yarn;
      const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });

      expect(entity).not.toBeNull();
      expect(gameState.yarn).toBeLessThan(initialYarn);
      expect(world.isAlive(entity!)).toBe(true);
    });

    it("emits cat:summoned event", () => {
      const handler = vi.fn();
      eventBus.on("cat:summoned", handler);

      manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: "cat:summoned", catType: CatType.Loaf }),
      );
    });

    it("returns null on insufficient yarn", () => {
      gameState.deductYarn(gameState.yarn);
      const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });
      expect(entity).toBeNull();
    });

    it("rejects placement on water terrain", () => {
      mockMap.setTerrain(5, 5, TerrainType.Water);
      const entity = manager.summon(CatType.Loaf, { x: 5, y: 0, z: 5 });
      expect(entity).toBeNull();
    });

    it("rejects placement on hidden terrain", () => {
      mockMap.setTerrain(5, 5, TerrainType.Hidden);
      const entity = manager.summon(CatType.Loaf, { x: 5, y: 0, z: 5 });
      expect(entity).toBeNull();
    });

    it("auto-dismisses oldest cat when at max capacity", () => {
      const cat1 = manager.summon(CatType.Loaf, { x: 1, y: 0, z: 1 })!;
      manager.summon(CatType.Loaf, { x: 2, y: 0, z: 2 });
      manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });

      expect(manager.getActiveCompanions()).toHaveLength(3);

      manager.summon(CatType.Loaf, { x: 4, y: 0, z: 4 });

      expect(world.isAlive(cat1)).toBe(false);
      expect(manager.getActiveCompanions()).toHaveLength(3);
    });
  });

  describe("dismiss", () => {
    it("refunds yarn for Active cat (manual dismiss)", () => {
      const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
      const yarnAfterSummon = gameState.yarn;

      manager.dismiss(entity);

      expect(gameState.yarn).toBeGreaterThan(yarnAfterSummon);
    });

    it("does not refund yarn for Expired cat", () => {
      const entity = manager.summon(CatType.Zoomies, { x: 3, y: 0, z: 3 })!;
      const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
      behavior.state = "Expired";

      const yarnBefore = gameState.yarn;
      manager.dismiss(entity);

      expect(gameState.yarn).toBe(yarnBefore);
    });

    it("emits cat:dismissed event", () => {
      const handler = vi.fn();
      eventBus.on("cat:dismissed", handler);

      const entity = manager.summon(CatType.Pounce, { x: 3, y: 0, z: 3 })!;
      manager.dismiss(entity);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: "cat:dismissed", catType: CatType.Pounce }),
      );
    });

    it("destroys the entity", () => {
      const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
      manager.dismiss(entity);
      expect(world.isAlive(entity)).toBe(false);
    });
  });

  describe("loaf stacking", () => {
    it("second Loaf at same XZ stacks on top of first", () => {
      const e1 = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
      const e2 = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;

      const t1 = world.getComponent<Transform>(e1, "Transform")!;
      const t2 = world.getComponent<Transform>(e2, "Transform")!;

      // First loaf: halfHeight = 0.375, centerY = 0 + 0.375
      expect(t1.y).toBeCloseTo(0.375, 2);
      // Second loaf: surfaceY = 0.75 (first top), centerY = 0.75 + 0.375
      expect(t2.y).toBeCloseTo(1.125, 2);
    });

    it("Loaf at different XZ does not stack", () => {
      manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });
      const e2 = manager.summon(CatType.Loaf, { x: 10, y: 0, z: 10 })!;

      const t2 = world.getComponent<Transform>(e2, "Transform")!;
      expect(t2.y).toBeCloseTo(0.375, 2);
    });

    it("third Loaf stacks on top of two", () => {
      manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });
      manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });
      const e3 = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;

      const t3 = world.getComponent<Transform>(e3, "Transform")!;
      // Third loaf: surfaceY = 1.5, centerY = 1.5 + 0.375
      expect(t3.y).toBeCloseTo(1.875, 2);
    });
  });

  describe("terrain cat collider config", () => {
    it("Loaf ECS Collider is a trigger (PhysicsEngine handles collision)", () => {
      const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
      const collider = world.getComponent<Collider>(entity, "Collider")!;
      expect(collider.isTrigger).toBe(true);
      expect(collider.isStatic).toBe(true);
    });

    it("Pounce ECS Collider is a trigger (PhysicsEngine handles collision)", () => {
      const entity = manager.summon(CatType.Pounce, { x: 3, y: 0, z: 3 })!;
      const collider = world.getComponent<Collider>(entity, "Collider")!;
      expect(collider.isTrigger).toBe(true);
    });

    it("Zoomies ECS Collider is NOT a trigger (no PhysicsEngine body)", () => {
      const entity = manager.summon(CatType.Zoomies, { x: 3, y: 0, z: 3 })!;
      const collider = world.getComponent<Collider>(entity, "Collider")!;
      expect(collider.isTrigger).toBe(false);
    });
  });

  describe("canAfford", () => {
    it("returns true when yarn is sufficient", () => {
      expect(manager.canAfford(CatType.Loaf)).toBe(true);
    });

    it("returns false when yarn is insufficient", () => {
      gameState.deductYarn(gameState.yarn);
      expect(manager.canAfford(CatType.Loaf)).toBe(false);
    });
  });

  describe("getCatalog", () => {
    it("returns all registered cat types", () => {
      const catalog = manager.getCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(4);
      const types = catalog.map((c) => c.type);
      expect(types).toContain(CatType.Loaf);
      expect(types).toContain(CatType.Zoomies);
      expect(types).toContain(CatType.CuriosityCat);
      expect(types).toContain(CatType.Pounce);
    });
  });
});
