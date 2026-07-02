/**
 * #26: exact-tick despawn-timing preservation.
 *
 * The single-lifecycle-owner refactor could easily introduce a 1-tick delay
 * for holdless cats (Zoomies): if despawn-initiation were folded into the
 * same update(dt) call as the Active→Expired transition, a cat could only
 * begin despawning on the tick AFTER it expires, because at the moment the
 * switch sets Expired there has been no chance yet for a hold to be placed.
 * See docs/adr/0004-cat-lifecycle-single-owner.md's "two-phase driver"
 * section for the full explanation of why that would happen and how the
 * update(dt) / flushExpirations() split avoids it.
 *
 * This test wires the FULL real per-tick sequence Game.ts uses for
 * cat-related systems — CatCompanionManager.update() → ZoomiesSystem →
 * CuriositySystem → PounceSystem → CatCompanionManager.flushExpirations() —
 * because proving "zero extra ticks" is inherently a cross-system timing
 * claim; the owner-alone lifecycle test (CatCompanionManager.lifecycle.test.ts)
 * and the curiosity-fade-despawn integration test each already prove the two
 * halves of this in isolation. This test is the belt-and-suspenders proof
 * that, wired exactly as Game.ts wires them, both a holdless cat (Zoomies)
 * and a held cat (Curiosity) begin despawn on the EXACT tick the legacy
 * four-system pipeline would have — not one tick later.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { ZoomiesSystem } from "~/game/systems/ZoomiesSystem";
import { CuriositySystem } from "~/game/systems/CuriositySystem";
import { PounceSystem } from "~/game/systems/PounceSystem";
import {
  spawnPlayer,
  spawnHiddenTerrain,
  spawnCuriosityRevealCat,
} from "../helpers/entityFactories";
import { createMockMapManager } from "../helpers/mockMapManager";
import { createMockSceneManager } from "../helpers/mockSceneManager";
import type { HiddenTerrain } from "~/game/ecs/components/HiddenTerrain";
import type { Renderable } from "~/game/ecs/components/Renderable";
import type { Entity } from "~/game/ecs/Entity";
import { CatType } from "~/game/types";

const DT = 1 / 60;

describe("Integration: cat despawn-timing preservation (exact tick, held + holdless)", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let manager: CatCompanionManager;
  let zoomies: ZoomiesSystem;
  let curiosity: CuriositySystem;
  let pounce: PounceSystem;
  let mockScene: ReturnType<typeof createMockSceneManager>;
  let playerEntity: Entity;

  /**
   * One full fixed-step tick, in the EXACT order Game.ts wires cat-related
   * systems (see the fixed-step loop in src/game/engine/Game.ts):
   *   CatCompanionManager.update() → ZoomiesSystem → CuriositySystem →
   *   PounceSystem → CatCompanionManager.flushExpirations()
   */
  function tick(): void {
    manager.update(DT);
    zoomies.update(world, DT);
    curiosity.update(world, DT);
    pounce.update(world, DT);
    manager.flushExpirations();
  }

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    mockScene = createMockSceneManager();
    const mockMap = createMockMapManager();
    playerEntity = spawnPlayer(world);

    manager = new CatCompanionManager(
      world,
      eventBus,
      mockMap as any,
      gameState,
      () => playerEntity,
      physics,
    );
    zoomies = new ZoomiesSystem(manager);
    curiosity = new CuriositySystem(mockScene as any, manager, eventBus);
    pounce = new PounceSystem(physics, manager);
  });

  it("holdless cat (Zoomies): despawn begins on the SAME tick the duration timer crosses, not one tick later", () => {
    const entity = manager.summon(CatType.Zoomies, { x: 10, y: 0, z: 10 })!;

    tick(); // Idle → Active
    for (let i = 0; i < 480; i++) tick(); // just under 8s — still Active

    expect(world.getComponent(entity, "CatBehavior")).not.toBeNull();
    expect(manager.getCatState(entity)).toBe("Active");

    // The crossing tick: Active → Expired happens inside manager.update() at
    // the START of this tick(); by the time this single tick() call returns,
    // flushExpirations() (called at the END of the very same tick()) must
    // ALREADY have begun despawn. If a regression reintroduced the 1-tick
    // delay, CatBehavior would still be present here (state "Expired") and
    // this assertion would fail.
    tick();

    expect(manager.getActiveCompanions()).not.toContain(entity);
    expect(world.getComponent(entity, "CatBehavior")).toBeNull();
    expect(manager.getCatState(entity)).toBe("Despawning");
  });

  it("held cat (CuriosityCat): despawn begins on the SAME tick the fade-out hold is released, not one tick later", () => {
    const terrainEntity = spawnHiddenTerrain(world, 3, 3);
    const handle = mockScene.createHandle();
    mockScene.setMeshOpacity(handle, 0);
    const renderable = world.getComponent<Renderable>(terrainEntity, "Renderable")!;
    (renderable as unknown as { sceneHandle: symbol }).sceneHandle = handle;

    const catEntity = spawnCuriosityRevealCat(world, 3, 3, 5);

    // Activate + fully fade in.
    tick();
    for (let i = 0; i < 30; i++) tick();
    const ht = world.getComponent<HiddenTerrain>(terrainEntity, "HiddenTerrain")!;
    expect(ht.currentOpacity).toBe(1);

    // Drive to Expired (CuriosityCat duration = 20s = 1200 ticks at 1/60 dt).
    // The fade-in preamble above already ran 31 ticks (1 Idle→Active + 30
    // active), contributing 30 dt-additions, so this loop needs 1200 - 30 =
    // 1170 more ticks to land exactly on the crossing tick — landing later
    // would run past the entire subsequent hold→fade→release→despawn cycle
    // (the fade takes 30 more ticks at FADE_SPEED=2.0), overshooting into
    // "Despawning" before this assertion even runs. Each tick() call runs the
    // full sequence, so the moment Expired is set (inside manager.update()),
    // CuriositySystem (later the SAME tick) sees it and places a hold before
    // flushExpirations() (also the SAME tick) runs.
    for (let i = 0; i < 1170; i++) tick();
    expect(manager.getCatState(catEntity)).toBe("Expired");
    expect(world.getComponent(catEntity, "CatBehavior")).not.toBeNull();
    expect(world.isAlive(catEntity)).toBe(true);

    // Keep ticking until the fade-out completes. The tick on which
    // currentOpacity reaches 0 is the SAME tick CuriositySystem releases the
    // hold (inside its own update(), which runs before flushExpirations() in
    // this tick()) — so by the time THIS SAME tick() call returns, the cat
    // must already be Despawning. A regression that despawns one tick late
    // would leave CatBehavior present here.
    let despawnedThisTick = false;
    for (let i = 0; i < 60; i++) {
      tick();
      if (ht.currentOpacity === 0) {
        despawnedThisTick = world.getComponent(catEntity, "CatBehavior") === null;
        break;
      }
    }

    expect(ht.currentOpacity).toBe(0);
    expect(despawnedThisTick).toBe(true);
    expect(manager.getCatState(catEntity)).toBe("Despawning");
  });
});
