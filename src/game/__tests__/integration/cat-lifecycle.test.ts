import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { spawnPlayer } from "../helpers/entityFactories";
import { createMockMapManager } from "../helpers/mockMapManager";
import { CatType } from "~/game/types";
import type { CatBehavior } from "~/game/ecs/components/CatBehavior";
import type { Entity } from "~/game/ecs/Entity";

describe("Integration: Cat Lifecycle (Summon → Active → Expired → Despawn)", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let catManager: CatCompanionManager;
  let playerEntity: Entity;
  const DT = 1 / 60;

  /**
   * Drives one full fixed-step tick through the owner alone (no per-cat
   * effect systems wired — this test proves the lifecycle end-to-end using
   * only CatCompanionManager). Mirrors the exact two-call sequence Game.ts
   * wires per tick: update() first, flushExpirations() last (see
   * docs/adr/0004-cat-lifecycle-single-owner.md).
   */
  function tick(dt: number): void {
    catManager.update(dt);
    catManager.flushExpirations();
  }

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    const mockMap = createMockMapManager();
    playerEntity = spawnPlayer(world);

    catManager = new CatCompanionManager(
      world,
      eventBus,
      mockMap as any,
      gameState,
      () => playerEntity,
      physics,
    );
  });

  it("Zoomies full lifecycle: summon → deduct yarn → 8s active → expired → auto-despawn → yarn consumed", () => {
    const initialYarn = gameState.yarn;
    const entity = catManager.summon(CatType.Zoomies, { x: 10, y: 0, z: 10 })!;
    expect(entity).not.toBeNull();

    const yarnCost = initialYarn - gameState.yarn;
    expect(yarnCost).toBeGreaterThan(0);

    // First tick: Idle → Active
    tick(DT);
    const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
    expect(behavior.state).toBe("Active");

    // 480 ticks still Active (just under 8s)
    for (let i = 0; i < 480; i++) {
      tick(DT);
    }
    expect(behavior.state).toBe("Active");

    const yarnBeforeExpiry = gameState.yarn;

    // One more tick pushes past 8s: expires AND despawns in this same tick
    // (no hold — Zoomies has none), preserving legacy same-tick timing.
    tick(DT);

    expect(catManager.getActiveCompanions()).not.toContain(entity);
    expect(world.getComponent(entity, "CatBehavior")).toBeNull();
    expect(gameState.yarn).toBe(yarnBeforeExpiry);

    // Entity stays alive for the 0.2 s scale-down animation; owner destroys it.
    expect(world.isAlive(entity)).toBe(true);
    for (let i = 0; i < 13; i++) tick(DT); // >= 0.2s at 1/60 dt
    expect(world.isAlive(entity)).toBe(false);
  });

  it("manual dismiss of active Zoomies refunds yarn", () => {
    const entity = catManager.summon(CatType.Zoomies, { x: 10, y: 0, z: 10 })!;
    const yarnAfterSummon = gameState.yarn;

    tick(DT);

    catManager.dismiss(entity);
    expect(gameState.yarn).toBeGreaterThan(yarnAfterSummon);
  });

  it("Loaf persists indefinitely until manually dismissed", () => {
    const entity = catManager.summon(CatType.Loaf, { x: 5, y: 0, z: 5 })!;

    for (let i = 0; i < 3600; i++) {
      tick(DT);
    }

    const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior")!;
    expect(behavior.state).toBe("Active");
    expect(world.isAlive(entity)).toBe(true);

    catManager.dismiss(entity);
    // Entity stays alive for 0.2 s scale-down animation; removed from companions.
    expect(world.isAlive(entity)).toBe(true);
    expect(catManager.getActiveCompanions()).not.toContain(entity);
  });
});
