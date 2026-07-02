import { describe, it, expect, beforeEach, vi } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CuriositySystem } from "~/game/systems/CuriositySystem";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { spawnPlayer, spawnHiddenTerrain, spawnCuriosityRevealCat } from "../helpers/entityFactories";
import { createMockSceneManager } from "../helpers/mockSceneManager";
import { createMockMapManager } from "../helpers/mockMapManager";
import type { HiddenTerrain } from "~/game/ecs/components/HiddenTerrain";
import type { CatBehavior } from "~/game/ecs/components/CatBehavior";
import type { Renderable } from "~/game/ecs/components/Renderable";

function spawnHiddenTerrainWithHandle(
  world: World,
  mockScene: ReturnType<typeof createMockSceneManager>,
  x = 3,
  z = 3,
) {
  const entity = spawnHiddenTerrain(world, x, z);
  const handle = mockScene.createHandle();
  mockScene.setMeshOpacity(handle, 0);
  const renderable = world.getComponent<Renderable>(entity, "Renderable")!;
  (renderable as any).sceneHandle = handle;
  return { entity, handle };
}

describe("CuriositySystem", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let catManager: CatCompanionManager;
  let curiositySystem: CuriositySystem;
  let mockScene: ReturnType<typeof createMockSceneManager>;
  const DT = 1 / 60;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    mockScene = createMockSceneManager();
    const mockMap = createMockMapManager();
    let playerEntity: number | null = null;

    catManager = new CatCompanionManager(
      world,
      eventBus,
      mockMap as any,
      gameState,
      () => playerEntity,
      physics,
    );
    // CuriositySystem depends only on the CatStateView seam — the concrete
    // manager satisfies it (see src/game/cats/CatLifecycle.ts).
    curiositySystem = new CuriositySystem(mockScene as any, catManager, eventBus);

    playerEntity = spawnPlayer(world);
  });

  it("reveals hidden terrain within radius on activation", () => {
    const terrain = spawnHiddenTerrain(world, 3, 3);
    spawnCuriosityRevealCat(world, 3, 3, 5);

    catManager.update(DT);
    curiositySystem.update(world, DT);

    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.isRevealed).toBe(true);
    expect(ht.revealCount).toBe(1);
  });

  it("does not reveal terrain outside radius", () => {
    const terrain = spawnHiddenTerrain(world, 50, 50);
    spawnCuriosityRevealCat(world, 3, 3, 5);

    catManager.update(DT);
    curiositySystem.update(world, DT);

    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.isRevealed).toBe(false);
  });

  it("emits hidden:terrain:revealed event", () => {
    const handler = vi.fn();
    eventBus.on("hidden:terrain:revealed", handler);

    spawnHiddenTerrain(world, 3, 3);
    spawnCuriosityRevealCat(world, 3, 3, 5);

    catManager.update(DT);
    curiositySystem.update(world, DT);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "hidden:terrain:revealed" }),
    );
  });

  it("hides terrain and despawns cat on expiry after fade-out", () => {
    const terrain = spawnHiddenTerrain(world, 3, 3);
    const catEntity = spawnCuriosityRevealCat(world, 3, 3, 5);

    catManager.update(DT);
    curiositySystem.update(world, DT);

    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.isRevealed).toBe(true);

    for (let i = 0; i < 1201; i++) {
      catManager.update(DT);
    }

    const behavior = world.getComponent<CatBehavior>(catEntity, "CatBehavior")!;
    expect(behavior.state).toBe("Expired");

    // Same tick: effect runs (places-then-immediately-releases the hold,
    // since the terrain's opacity never finished rising before expiry —
    // see the equivalent legacy quirk this test preserves), then the owner's
    // flushExpirations() finalizes the despawn — mirroring Game.ts's real
    // per-tick ordering (update → effects → flushExpirations).
    curiositySystem.update(world, DT);
    catManager.flushExpirations();

    expect(ht.isRevealed).toBe(false);
    expect(ht.revealCount).toBe(0);
    // beginDespawn() was called: CatBehavior removed, scale-down animation queued.
    // Entity stays alive until CatCompanionManager completes the 0.2 s despawn timer.
    expect(world.getComponent(catEntity, "CatBehavior")).toBeNull();
  });

  it("handles overlapping reveal from multiple cats", () => {
    const terrain = spawnHiddenTerrain(world, 3, 3);
    spawnCuriosityRevealCat(world, 3, 3, 5);
    spawnCuriosityRevealCat(world, 4, 4, 5);

    catManager.update(DT);
    curiositySystem.update(world, DT);

    const ht = world.getComponent<HiddenTerrain>(terrain, "HiddenTerrain")!;
    expect(ht.revealCount).toBe(2);
    expect(ht.isRevealed).toBe(true);
  });

  describe("fade animation", () => {
    it("sets targetOpacity to 1 on reveal, starts animating from 0", () => {
      const { entity } = spawnHiddenTerrainWithHandle(world, mockScene, 3, 3);
      spawnCuriosityRevealCat(world, 3, 3, 5);

      catManager.update(DT);
      curiositySystem.update(world, DT);

      const ht = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain")!;
      expect(ht.targetOpacity).toBe(1);
      // After one tick, currentOpacity should have moved toward 1 but not reached it
      expect(ht.currentOpacity).toBeGreaterThan(0);
      expect(ht.currentOpacity).toBeLessThan(1);
    });

    it("animates opacity to 1 over ~0.5s (FADE_SPEED = 2)", () => {
      const { entity, handle } = spawnHiddenTerrainWithHandle(world, mockScene, 3, 3);
      spawnCuriosityRevealCat(world, 3, 3, 5);

      catManager.update(DT);
      curiositySystem.update(world, DT);

      const ht = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain")!;
      const opacityAfterOneTick = ht.currentOpacity;
      expect(opacityAfterOneTick).toBeCloseTo(2 * DT, 4);

      // Run enough ticks for full fade (0.5s = 30 ticks at 60fps)
      for (let i = 0; i < 30; i++) {
        curiositySystem.update(world, DT);
      }

      expect(ht.currentOpacity).toBe(1);
      expect(mockScene.getOpacity(handle)).toBe(1);
    });

    it("defers despawn until fade-out completes", () => {
      const { entity } = spawnHiddenTerrainWithHandle(world, mockScene, 3, 3);
      const catEntity = spawnCuriosityRevealCat(world, 3, 3, 5);

      // Activate and fully fade in
      catManager.update(DT);
      curiositySystem.update(world, DT);
      for (let i = 0; i < 30; i++) {
        curiositySystem.update(world, DT);
      }

      const ht = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain")!;
      expect(ht.currentOpacity).toBe(1);

      // Expire the cat (1201 ticks to safely clear the 20s boundary)
      for (let i = 0; i < 1201; i++) {
        catManager.update(DT);
      }
      expect(
        world.getComponent<CatBehavior>(catEntity, "CatBehavior")!.state,
      ).toBe("Expired");

      // First tick after expiry: CuriositySystem begins fade-out and places a
      // despawn hold. flushExpirations() (same tick, real ordering) must NOT
      // despawn while the hold is active — this proves the hold actually
      // blocks the owner.
      curiositySystem.update(world, DT);
      catManager.flushExpirations();
      expect(ht.targetOpacity).toBe(0);
      expect(ht.currentOpacity).toBeLessThan(1);
      expect(world.isAlive(catEntity)).toBe(true);
      expect(world.getComponent(catEntity, "CatBehavior")).not.toBeNull();

      // Tick until fade-out completes; flushExpirations() runs each tick to
      // mirror the real per-tick sequence.
      for (let i = 0; i < 30; i++) {
        curiositySystem.update(world, DT);
        catManager.flushExpirations();
      }

      expect(ht.currentOpacity).toBe(0);
      // The hold was released once the fade completed — flushExpirations()
      // then began the despawn: CatBehavior removed, entity kept alive for
      // CatCompanionManager's own 0.2 s despawn timer.
      expect(world.getComponent(catEntity, "CatBehavior")).toBeNull();
    });

    it("updates scene mesh opacity each frame during fade", () => {
      const { entity, handle } = spawnHiddenTerrainWithHandle(world, mockScene, 3, 3);
      spawnCuriosityRevealCat(world, 3, 3, 5);

      catManager.update(DT);

      // Track opacity values set on scene across 5 ticks
      const opacities: number[] = [];
      curiositySystem.update(world, DT);
      opacities.push(mockScene.getOpacity(handle)!);

      for (let i = 0; i < 4; i++) {
        curiositySystem.update(world, DT);
        opacities.push(mockScene.getOpacity(handle)!);
      }

      // Each tick should increase monotonically
      for (let i = 1; i < opacities.length; i++) {
        expect(opacities[i]).toBeGreaterThan(opacities[i - 1]!);
      }
    });

    it("does not animate entities already at target opacity", () => {
      const { entity, handle } = spawnHiddenTerrainWithHandle(world, mockScene, 3, 3);
      spawnCuriosityRevealCat(world, 3, 3, 5);

      catManager.update(DT);

      // Fully fade in
      for (let i = 0; i < 40; i++) {
        curiositySystem.update(world, DT);
      }

      const ht = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain")!;
      expect(ht.currentOpacity).toBe(1);

      // Set mock opacity to a different value to detect if it gets written again
      mockScene.setMeshOpacity(handle, 0.999);
      curiositySystem.update(world, DT);

      // Should not have been overwritten since current === target
      expect(mockScene.getOpacity(handle)).toBe(0.999);
    });
  });
});
