/**
 * #26: Curiosity's "fade the revealed terrain before the cat disappears"
 * behavior, now expressed via the ref-counted holdDespawn()/releaseDespawn()
 * affordance instead of a private pendingDismiss queue.
 *
 * Wires exactly TWO modules — CatCompanionManager (the owner) + CuriositySystem
 * (the effect) — plus a mock SceneManager. No ZoomiesSystem, PounceSystem, or
 * the retired CatAISystem are involved (see docs/adr/0004-cat-lifecycle-single-owner.md).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { CuriositySystem } from "~/game/systems/CuriositySystem";
import { spawnHiddenTerrain, spawnCuriosityRevealCat } from "../helpers/entityFactories";
import { createMockMapManager } from "../helpers/mockMapManager";
import { createMockSceneManager } from "../helpers/mockSceneManager";
import type { HiddenTerrain } from "~/game/ecs/components/HiddenTerrain";
import type { Renderable } from "~/game/ecs/components/Renderable";
import type { Entity } from "~/game/ecs/Entity";

const DT = 1 / 60;

describe("Integration: Curiosity fade-before-despawn (owner + CuriositySystem)", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let manager: CatCompanionManager;
  let curiosity: CuriositySystem;
  let mockScene: ReturnType<typeof createMockSceneManager>;

  /**
   * One full fixed-step tick, mirroring Game.ts's real per-tick sequence for
   * cat-related systems: owner.update() → effect → owner.flushExpirations().
   */
  function tick(): void {
    manager.update(DT);
    curiosity.update(world, DT);
    manager.flushExpirations();
  }

  function spawnTerrainWithHandle(x = 3, z = 3): { entity: Entity; handle: symbol } {
    const entity = spawnHiddenTerrain(world, x, z);
    const handle = mockScene.createHandle();
    mockScene.setMeshOpacity(handle, 0);
    const renderable = world.getComponent<Renderable>(entity, "Renderable")!;
    (renderable as unknown as { sceneHandle: symbol }).sceneHandle = handle;
    return { entity, handle };
  }

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    mockScene = createMockSceneManager();
    const mockMap = createMockMapManager();

    manager = new CatCompanionManager(
      world,
      eventBus,
      mockMap as any,
      gameState,
      () => null,
      physics,
    );
    curiosity = new CuriositySystem(mockScene as any, manager, eventBus);
  });

  it("reveals terrain on activation, fades it in over ~0.5 s", () => {
    const { entity: terrain } = spawnTerrainWithHandle(3, 3);
    spawnCuriosityRevealCat(world, 3, 3, 5);

    tick(); // Idle → Active, terrain revealed

    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.isRevealed).toBe(true);
    expect(ht.targetOpacity).toBe(1);

    for (let i = 0; i < 30; i++) tick(); // ~0.5s fade-in
    expect(ht.currentOpacity).toBe(1);
  });

  it("holds despawn while the terrain fades out, then despawns the tick the fade completes", () => {
    const { entity: terrain } = spawnTerrainWithHandle(3, 3);
    const catEntity = spawnCuriosityRevealCat(world, 3, 3, 5);

    // Activate and fully fade in.
    tick();
    for (let i = 0; i < 30; i++) tick();
    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.currentOpacity).toBe(1);

    // Drive to Expired (CuriosityCat duration = 20s; 1201 ticks safely clears it).
    for (let i = 0; i < 1201; i++) manager.update(DT); // state machine only — no effects yet
    expect(manager.getCatState(catEntity)).toBe("Expired");

    // First tick after expiry: CuriositySystem begins the fade-out and places
    // a hold. flushExpirations() (same tick) must NOT despawn while held —
    // this is the core of the fade-before-despawn contract.
    curiosity.update(world, DT);
    manager.flushExpirations();
    expect(ht.targetOpacity).toBe(0);
    expect(ht.currentOpacity).toBeLessThan(1);
    expect(world.isAlive(catEntity)).toBe(true);
    expect(manager.getCatState(catEntity)).toBe("Expired"); // still held, not Despawning

    // Keep ticking while the fade is still in progress — must remain blocked.
    for (let i = 0; i < 10; i++) {
      curiosity.update(world, DT);
      manager.flushExpirations();
    }
    expect(ht.currentOpacity).toBeGreaterThan(0);
    expect(manager.getCatState(catEntity)).toBe("Expired");
    expect(world.isAlive(catEntity)).toBe(true);

    // Tick until the fade-out completes (0.5s = 30 ticks at FADE_SPEED=2.0,
    // fewer remaining since 11 ticks already elapsed above).
    for (let i = 0; i < 30; i++) {
      curiosity.update(world, DT);
      manager.flushExpirations();
    }

    expect(ht.currentOpacity).toBe(0);
    // The hold was released once the fade completed; flushExpirations() began
    // the despawn on that same tick.
    expect(manager.getCatState(catEntity)).toBe("Despawning");
    expect(world.isAlive(catEntity)).toBe(true); // still animating (0.2s pop-out)

    for (let i = 0; i < 13; i++) manager.update(DT); // owner's despawn timer elapses
    expect(world.isAlive(catEntity)).toBe(false);
  });

  it("break-it-to-verify: without the hold, the owner would despawn before the fade completes", () => {
    // This test does NOT call curiosity.update() after expiry at all — it
    // simulates what would happen if CuriositySystem never placed a hold
    // (the historical bug class this design prevents). It proves
    // flushExpirations() alone, with no hold ever placed, despawns
    // immediately on the Expired tick — demonstrating the hold is load-bearing
    // for the fade-before-despawn guarantee proven above.
    const { entity: terrain } = spawnTerrainWithHandle(3, 3);
    const catEntity = spawnCuriosityRevealCat(world, 3, 3, 5);

    tick();
    for (let i = 0; i < 30; i++) tick();
    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.currentOpacity).toBe(1);

    for (let i = 0; i < 1201; i++) manager.update(DT);
    expect(manager.getCatState(catEntity)).toBe("Expired");

    // No curiosity.update() call here — no hold is placed.
    manager.flushExpirations();

    expect(manager.getCatState(catEntity)).toBe("Despawning");
  });
});
