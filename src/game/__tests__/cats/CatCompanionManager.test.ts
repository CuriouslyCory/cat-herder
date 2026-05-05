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
