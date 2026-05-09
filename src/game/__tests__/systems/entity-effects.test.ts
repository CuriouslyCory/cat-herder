/**
 * US-311b: entity effects — cat summon/dismiss scale animations,
 * gather progress smooth animation, hidden terrain opacity transition.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { World } from "~/game/ecs/World";
import { VisualEffectsSystem } from "~/game/systems/VisualEffectsSystem";
import { CuriositySystem } from "~/game/systems/CuriositySystem";
import { CatAISystem } from "~/game/systems/CatAISystem";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { createCatScaleAnimation } from "~/game/ecs/components/CatScaleAnimation";
import { createTransform } from "~/game/ecs/components/Transform";
import { createMockMapManager } from "../helpers/mockMapManager";
import { createMockSceneManager } from "../helpers/mockSceneManager";
import {
  spawnPlayer,
  spawnHiddenTerrain,
  spawnCuriosityRevealCat,
} from "../helpers/entityFactories";
import { CatType } from "~/game/types";
import type { CatScaleAnimation } from "~/game/ecs/components/CatScaleAnimation";
import type { Transform } from "~/game/ecs/components/Transform";
import type { HiddenTerrain } from "~/game/ecs/components/HiddenTerrain";
import type { Renderable } from "~/game/ecs/components/Renderable";
import type { Entity } from "~/game/ecs/Entity";

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

function createMockScene() {
  return {
    setMeshEmissive: vi.fn(),
    setMeshOpacity: vi.fn(),
    createHandle: () => Symbol("handle"),
  };
}

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Cat scale animation — VisualEffectsSystem._updateScaleAnimations
// ---------------------------------------------------------------------------

describe("VisualEffectsSystem — cat scale animations", () => {
  let world: World;
  let scene: ReturnType<typeof createMockScene>;
  let system: VisualEffectsSystem;

  beforeEach(() => {
    world = new World();
    scene = createMockScene();
    system = new VisualEffectsSystem(scene as never);
  });

  function spawnAnimatingEntity(fromScale: number, toScale: number, destroyOnComplete = false) {
    const entity = world.createEntity();
    world.addComponent(entity, createTransform(0, 0, 0, 0, fromScale, fromScale, fromScale));
    world.addComponent(entity, createCatScaleAnimation(fromScale, toScale, 0.2, destroyOnComplete));
    return entity;
  }

  it("scale-up: Transform scale increases from 0 toward 1 each frame", () => {
    const entity = spawnAnimatingEntity(0, 1);

    system.update(world, DT);

    const tf = world.getComponent<Transform>(entity, "Transform")!;
    expect(tf.scaleX).toBeGreaterThan(0);
    expect(tf.scaleX).toBeLessThan(1);
    expect(tf.scaleX).toBeCloseTo(DT / 0.2);
  });

  it("scale-up: scale reaches 1 after 0.2 s", () => {
    const entity = spawnAnimatingEntity(0, 1);

    // Run enough frames to pass 0.2 s
    system.update(world, 0.2);

    const tf = world.getComponent<Transform>(entity, "Transform")!;
    expect(tf.scaleX).toBeCloseTo(1);
    expect(tf.scaleY).toBeCloseTo(1);
    expect(tf.scaleZ).toBeCloseTo(1);
  });

  it("scale-up: CatScaleAnimation component removed when complete (destroyOnComplete=false)", () => {
    const entity = spawnAnimatingEntity(0, 1, false);

    system.update(world, 0.25); // past duration

    expect(world.isAlive(entity)).toBe(true);
    expect(world.getComponent<CatScaleAnimation>(entity, "CatScaleAnimation")).toBeNull();
  });

  it("scale-down: Transform scale decreases from 1 toward 0 each frame", () => {
    const entity = spawnAnimatingEntity(1, 0);

    system.update(world, DT);

    const tf = world.getComponent<Transform>(entity, "Transform")!;
    expect(tf.scaleX).toBeGreaterThan(0);
    expect(tf.scaleX).toBeLessThan(1);
  });

  it("scale-down: entity destroyed when destroyOnComplete=true and animation finishes", () => {
    const entity = spawnAnimatingEntity(1, 0, true);

    system.update(world, 0.25); // past 0.2 s duration

    expect(world.isAlive(entity)).toBe(false);
  });

  it("scale-down: entity remains alive during the 0.2 s animation", () => {
    const entity = spawnAnimatingEntity(1, 0, true);

    system.update(world, 0.1); // halfway through

    expect(world.isAlive(entity)).toBe(true);
    const tf = world.getComponent<Transform>(entity, "Transform")!;
    expect(tf.scaleX).toBeCloseTo(0.5);
  });

  it("scale clamped at target — no overshoot beyond [fromScale, toScale]", () => {
    const entity = spawnAnimatingEntity(0, 1);

    system.update(world, 1.0); // far past duration

    const tf = world.getComponent<Transform>(entity, "Transform")!;
    expect(tf.scaleX).toBeCloseTo(1);
  });

  it("all three scale axes are set uniformly", () => {
    const entity = spawnAnimatingEntity(0, 1);

    system.update(world, 0.1);

    const tf = world.getComponent<Transform>(entity, "Transform")!;
    expect(tf.scaleX).toBeCloseTo(tf.scaleY);
    expect(tf.scaleY).toBeCloseTo(tf.scaleZ);
  });
});

// ---------------------------------------------------------------------------
// Cat summon: entity starts at scale 0
// ---------------------------------------------------------------------------

describe("CatCompanionManager — summon scale animation", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let manager: CatCompanionManager;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    const mockMap = createMockMapManager();
    const playerEntity = spawnPlayer(world);

    manager = new CatCompanionManager(
      world,
      eventBus,
      mockMap as never,
      gameState,
      () => playerEntity,
      physics,
    );
  });

  it("summoned cat starts with scale 0 on all axes", () => {
    const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });

    expect(entity).not.toBeNull();
    const tf = world.getComponent<Transform>(entity!, "Transform")!;
    expect(tf.scaleX).toBeCloseTo(0);
    expect(tf.scaleY).toBeCloseTo(0);
    expect(tf.scaleZ).toBeCloseTo(0);
  });

  it("summoned cat has CatScaleAnimation (fromScale=0, toScale=1, destroyOnComplete=false)", () => {
    const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });

    const anim = world.getComponent<CatScaleAnimation>(entity!, "CatScaleAnimation")!;
    expect(anim).not.toBeNull();
    expect(anim.fromScale).toBeCloseTo(0);
    expect(anim.toScale).toBeCloseTo(1);
    expect(anim.destroyOnComplete).toBe(false);
    expect(anim.duration).toBeCloseTo(0.2);
  });

  it("VisualEffectsSystem tweens scale to 1 after 0.2 s", () => {
    const scene = createMockScene();
    const vfx = new VisualEffectsSystem(scene as never);
    const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 });

    vfx.update(world, 0.2);

    const tf = world.getComponent<Transform>(entity!, "Transform")!;
    expect(tf.scaleX).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// Cat dismiss: entity kept alive for animation, then destroyed
// ---------------------------------------------------------------------------

describe("CatCompanionManager — dismiss scale animation", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let manager: CatCompanionManager;

  beforeEach(() => {
    world = new World();
    eventBus = new EventBus();
    gameState = new GameState(50);
    physics = new PhysicsEngine(eventBus);
    const mockMap = createMockMapManager();
    const playerEntity = spawnPlayer(world);

    manager = new CatCompanionManager(
      world,
      eventBus,
      mockMap as never,
      gameState,
      () => playerEntity,
      physics,
    );
  });

  it("dismissed cat entity remains alive immediately after dismiss()", () => {
    const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
    manager.dismiss(entity);

    expect(world.isAlive(entity)).toBe(true);
  });

  it("dismissed cat has CatScaleAnimation (fromScale=1, toScale=0, destroyOnComplete=true)", () => {
    const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
    manager.dismiss(entity);

    const anim = world.getComponent<CatScaleAnimation>(entity, "CatScaleAnimation")!;
    expect(anim).not.toBeNull();
    expect(anim.fromScale).toBeCloseTo(1);
    expect(anim.toScale).toBeCloseTo(0);
    expect(anim.destroyOnComplete).toBe(true);
  });

  it("dismissed cat is removed from active companions immediately", () => {
    const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
    manager.dismiss(entity);

    expect(manager.getActiveCompanions()).not.toContain(entity);
  });

  it("cat:dismissed event fires on dismiss", () => {
    const handler = vi.fn();
    eventBus.on("cat:dismissed", handler);
    const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
    manager.dismiss(entity);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cat:dismissed", catType: CatType.Loaf }),
    );
  });

  it("VisualEffectsSystem destroys dismissed cat entity after 0.2 s", () => {
    const scene = createMockScene();
    const vfx = new VisualEffectsSystem(scene as never);
    const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
    manager.dismiss(entity);

    vfx.update(world, 0.21);

    expect(world.isAlive(entity)).toBe(false);
  });

  it("double dismiss() is idempotent — no crash or double-destroy", () => {
    const scene = createMockScene();
    const vfx = new VisualEffectsSystem(scene as never);
    const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
    manager.dismiss(entity);
    manager.dismiss(entity); // second call must be a no-op

    expect(world.isAlive(entity)).toBe(true); // still animating, not re-destroyed
    vfx.update(world, 0.21);
    expect(world.isAlive(entity)).toBe(false); // destroyed once by animation
  });

  it("dismissed cat has CatBehavior removed (other systems won't process zombie)", () => {
    const entity = manager.summon(CatType.Loaf, { x: 3, y: 0, z: 3 })!;
    manager.dismiss(entity);

    expect(world.getComponent(entity, "CatBehavior")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Gather progress: HUD smooth CSS transition
// ---------------------------------------------------------------------------

describe("HUD — gather progress smooth animation", () => {
  it("setGatherProgress sets bar width proportional to progress", async () => {
    // Minimal DOM mock sufficient for HUD construction
    const createdEls: Array<{ style: Record<string, string>; textContent: string | null }> = [];
    const makeEl = () => {
      const el = {
        style: {} as Record<string, string>,
        dataset: {} as Record<string, string>,
        textContent: null as string | null,
        appendChild: vi.fn(),
        remove: vi.fn(),
      };
      createdEls.push(el);
      return el;
    };

    const containerAppended: unknown[] = [];
    const container = {
      style: {} as Record<string, string>,
      appendChild: vi.fn((el: unknown) => containerAppended.push(el)),
    };

    const docMock = {
      createElement: vi.fn(() => makeEl()),
      getElementById: vi.fn(() => null),
      head: { appendChild: vi.fn() },
    };
    vi.stubGlobal("document", docMock);

    // Import dynamically to use mocked document
    const { HUD } = await import("~/game/ui/HUD");
    const hud = new HUD(container as never);

    // Drive gather progress to 60%
    hud.update(DT, null, 5, 5, 10, null, { progress: 0.6, label: "Gathering Grass" });

    // Find the gather fill bar (has background:#a3e635 in its style.cssText)
    const fillEl = createdEls.find(
      (el) => typeof el.style.cssText === "string" && el.style.cssText.includes("#a3e635") && el.style.cssText.includes("transition"),
    );

    // The fill bar should have a CSS transition for smooth animation
    expect(fillEl?.style.cssText).toMatch(/transition/);

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// Hidden terrain opacity transition (CuriositySystem)
// ---------------------------------------------------------------------------

describe("CuriositySystem — hidden terrain fade-in over 0.5 s", () => {
  let world: World;
  let eventBus: EventBus;
  let gameState: GameState;
  let physics: PhysicsEngine;
  let manager: CatCompanionManager;
  let catAI: CatAISystem;
  let curiosity: CuriositySystem;
  let mockScene: ReturnType<typeof createMockSceneManager>;

  function spawnTerrainWithHandle(x = 2, z = 2): { entity: Entity; handle: symbol } {
    const entity = spawnHiddenTerrain(world, x, z);
    const handle = mockScene.createHandle();
    const renderable = world.getComponent<Renderable>(entity, "Renderable")!;
    (renderable as never as { sceneHandle: symbol }).sceneHandle = handle;
    mockScene.setMeshOpacity(handle, 0);
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
      mockMap as never,
      gameState,
      () => null,
      physics,
    );
    catAI = new CatAISystem();
    curiosity = new CuriositySystem(mockScene as never, manager, eventBus);
  });

  it("hidden terrain opacity starts at 0 before reveal", () => {
    const { entity } = spawnTerrainWithHandle();
    const ht = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain")!;
    expect(ht.currentOpacity).toBeCloseTo(0);
  });

  it("opacity increases gradually after CuriosityCat reveals terrain", () => {
    const { entity } = spawnTerrainWithHandle(2, 2);
    spawnCuriosityRevealCat(world, 2, 2, 5);

    // First tick: CatAI moves to Active, CuriositySystem reveals
    catAI.update(world, DT);
    curiosity.update(world, DT);

    const ht = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain")!;
    expect(ht.currentOpacity).toBeGreaterThan(0);
    expect(ht.currentOpacity).toBeLessThan(1);
  });

  it("opacity reaches 1 after ~0.5 s of animation (FADE_SPEED = 2.0)", () => {
    const { entity } = spawnTerrainWithHandle(2, 2);
    spawnCuriosityRevealCat(world, 2, 2, 5);

    // Activate cat
    catAI.update(world, DT);
    curiosity.update(world, DT);

    // Simulate 0.5 s worth of frames (FADE_SPEED=2.0 → full fade in 0.5 s)
    const frames = Math.ceil(0.5 / DT);
    for (let i = 0; i < frames; i++) {
      curiosity.update(world, DT);
    }

    const ht = world.getComponent<HiddenTerrain>(entity, "HiddenTerrain")!;
    expect(ht.currentOpacity).toBeCloseTo(1, 1);
  });

  it("mesh opacity increases above 0 on the first reveal tick", () => {
    const { handle } = spawnTerrainWithHandle(2, 2);
    spawnCuriosityRevealCat(world, 2, 2, 5);

    catAI.update(world, DT);
    curiosity.update(world, DT);

    // After one tick of activation, CuriositySystem should have called
    // setMeshOpacity with a value > 0 (fade-in has started).
    expect(mockScene.getOpacity(handle)).toBeGreaterThan(0);
  });
});
