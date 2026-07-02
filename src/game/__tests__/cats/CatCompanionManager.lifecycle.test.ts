/**
 * #26: CatCompanionManager as the single lifecycle owner.
 *
 * These tests drive summon → active → expire → refund-rule → despawn →
 * destroy, cap eviction, and the hold-despawn affordance through
 * CatCompanionManager ALONE — zero per-cat effect systems (ZoomiesSystem,
 * CuriositySystem, PounceSystem) are constructed or wired here. This is the
 * "owner alone" test the plan for #26 calls out explicitly: no unit test
 * before this refactor could prove a cat dies without wiring four systems
 * together (see docs/adr/0004-cat-lifecycle-single-owner.md).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { spawnPlayer } from "../helpers/entityFactories";
import { createMockMapManager } from "../helpers/mockMapManager";
import { CatType } from "~/game/types";
import type { Entity } from "~/game/ecs/Entity";

const DT = 1 / 60;

describe("CatCompanionManager — lifecycle (owner alone, no per-cat systems)", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let mockMap: ReturnType<typeof createMockMapManager>;
  let manager: CatCompanionManager;
  let playerEntity: Entity;

  /**
   * One full fixed-step tick, exactly as Game.ts wires it: update() first,
   * flushExpirations() last (see docs/adr/0004-cat-lifecycle-single-owner.md
   * for why these are two separate calls rather than one).
   */
  function tick(dt = DT): void {
    manager.update(dt);
    manager.flushExpirations();
  }

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

  describe("summon → expire → no refund → destroy (Zoomies, 8 s duration)", () => {
    it("drives the full lifecycle through the owner alone", () => {
      const initialYarn = gameState.yarn;
      const entity = manager.summon(CatType.Zoomies, { x: 10, y: 0, z: 10 })!;
      expect(entity).not.toBeNull();
      expect(world.isAlive(entity)).toBe(true);
      expect(manager.getActiveCompanions()).toContain(entity);
      expect(gameState.yarn).toBeLessThan(initialYarn);

      // First tick: Idle → Active
      tick();
      expect(manager.getCatState(entity)).toBe("Active");
      expect(manager.isActive(entity)).toBe(true);

      // ~481 ticks (safely past 8 s at 1/60 dt) still Active until the boundary.
      for (let i = 0; i < 480; i++) tick();
      expect(manager.getCatState(entity)).toBe("Active");

      const yarnBeforeExpiry = gameState.yarn;

      // One more tick crosses the 8 s boundary: Active → Expired → Despawning,
      // all within this same tick() call (no hold — Zoomies has none).
      tick();
      expect(manager.getActiveCompanions()).not.toContain(entity);
      expect(manager.getCatState(entity)).toBe("Despawning");
      expect(gameState.yarn).toBe(yarnBeforeExpiry); // expired = no refund
      expect(world.isAlive(entity)).toBe(true); // still animating

      // Owner destroys once its own 0.2 s despawn timer elapses.
      for (let i = 0; i < 13; i++) tick(); // >= 0.2s
      expect(world.isAlive(entity)).toBe(false);
    });
  });

  describe("summon → manual dismiss (Active) → refund → destroy", () => {
    it("refunds yarn and destroys after the despawn timer elapses", () => {
      const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
      tick(); // Idle → Active
      expect(manager.getCatState(entity)).toBe("Active");

      const yarnBeforeDismiss = gameState.yarn;
      manager.dismiss(entity);

      expect(gameState.yarn).toBeGreaterThan(yarnBeforeDismiss);
      expect(manager.getActiveCompanions()).not.toContain(entity);
      expect(manager.getCatState(entity)).toBe("Despawning");
      expect(world.isAlive(entity)).toBe(true);

      for (let i = 0; i < 13; i++) tick();
      expect(world.isAlive(entity)).toBe(false);
    });
  });

  describe("cap eviction (owner-driven)", () => {
    it("evicts the oldest cat when summoning at cap", () => {
      const cat1 = manager.summon(CatType.Loaf, { x: 1, y: 0, z: 1 })!;
      manager.summon(CatType.Loaf, { x: 2, y: 0, z: 2 });
      manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });
      expect(manager.getActiveCompanions()).toHaveLength(3);

      manager.summon(CatType.Loaf, { x: 4, y: 0, z: 4 });

      expect(manager.getActiveCompanions()).not.toContain(cat1);
      expect(manager.getActiveCompanions()).toHaveLength(3);
    });
  });

  describe("hold-despawn affordance in isolation (no CuriositySystem)", () => {
    it("blocks despawn while held, and despawns on the tick the hold is released", () => {
      const entity = manager.summon(CatType.Zoomies, { x: 10, y: 0, z: 10 })!;

      // Drive to Expired using update() alone (NOT the composite tick() helper):
      // flushExpirations() must not run yet, or it would begin despawn on the
      // very crossing tick (no hold is in place until the manual holdDespawn()
      // call below) — exactly mirroring the pattern curiosity-fade-despawn.test.ts
      // uses to observe "Expired" before interposing a hold.
      manager.update(DT); // Idle → Active
      for (let i = 0; i < 481; i++) manager.update(DT);
      expect(manager.getCatState(entity)).toBe("Expired");
      expect(world.isAlive(entity)).toBe(true);
      expect(world.getComponent(entity, "CatBehavior")).not.toBeNull();

      // Place a hold directly (no CuriositySystem involved).
      manager.holdDespawn(entity);

      // Many further ticks: still Expired, never despawns while held.
      for (let i = 0; i < 60; i++) tick();
      expect(manager.getCatState(entity)).toBe("Expired");
      expect(world.getComponent(entity, "CatBehavior")).not.toBeNull();
      expect(world.isAlive(entity)).toBe(true);

      // Release the hold — despawn begins on the very next flushExpirations().
      manager.releaseDespawn(entity);
      tick();
      expect(manager.getCatState(entity)).toBe("Despawning");
      expect(world.getComponent(entity, "CatBehavior")).toBeNull();

      for (let i = 0; i < 13; i++) tick();
      expect(world.isAlive(entity)).toBe(false);
    });

    it("is ref-counted: two holds require two releases before despawn proceeds", () => {
      const entity = manager.summon(CatType.Zoomies, { x: 10, y: 0, z: 10 })!;
      // Drive to Expired using update() alone — see comment in the previous
      // test for why flushExpirations() must not run before the hold exists.
      manager.update(DT);
      for (let i = 0; i < 481; i++) manager.update(DT);
      expect(manager.getCatState(entity)).toBe("Expired");

      manager.holdDespawn(entity);
      manager.holdDespawn(entity);

      manager.releaseDespawn(entity);
      tick(); // one hold remains — must not despawn yet
      expect(manager.getCatState(entity)).toBe("Expired");
      expect(world.getComponent(entity, "CatBehavior")).not.toBeNull();

      manager.releaseDespawn(entity);
      tick(); // last hold released — despawns now
      expect(manager.getCatState(entity)).toBe("Despawning");
    });
  });
});
