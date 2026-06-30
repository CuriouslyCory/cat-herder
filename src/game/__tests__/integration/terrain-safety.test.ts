/**
 * US-310a — terrain safety & cat validation edge cases.
 *
 * 1. Player spawned overlapping a static terrain block is pushed out.
 * 2. Boundary walls block movement at all map edges.
 * 3. isPositionOccupied() correctly detects body overlap.
 * 4. CatCompanionManager.summon() auto-raises when default Y is occupied.
 * 5. summon() emits cat:place:failed and returns null after 3 failed attempts.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { EventBus } from "~/game/engine/EventBus";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { CatType } from "~/game/types";
import type { Vec3, GameEvent } from "~/game/types";

// ---------------------------------------------------------------------------
// PhysicsEngine push-out & boundary tests
// ---------------------------------------------------------------------------

describe("terrain push-out", () => {
  let physics: PhysicsEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    physics = new PhysicsEngine(eventBus);
  });

  it("player spawned inside static box is pushed out after one step", () => {
    // Box: 2×4×2 centred at (0, 2, 0), occupies x ∈ [-1, 1], y ∈ [0, 4], z ∈ [-1, 1]
    const wallHandle = physics.addBody(1, {
      shape: "box",
      size: 1,
      halfExtents: { x: 1, y: 2, z: 1 },
      isStatic: true,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(wallHandle, { x: 0, y: 2, z: 0 });

    const playerHandle = physics.addBody(2, {
      shape: "circle",
      size: 0.4,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    // Player spawns at centre of box — fully embedded
    physics.setPosition(playerHandle, { x: 0, y: 2, z: 0 });
    physics.setVelocity(playerHandle, { x: 0, y: 0, z: 0 });

    physics.step(1 / 60);

    const pos = physics.getPosition(playerHandle)!;
    // After push-out the player should be fully outside the box in at least one axis.
    // The engine's fallback pushes along +X: newPos.x = boxRight + radius = 1 + 0.4 = 1.4
    const outsideX = pos.x >= 1 + 0.4 - 0.05;
    const outsideNegX = pos.x <= -1 - 0.4 + 0.05;
    const outsideZ = pos.z >= 1 + 0.4 - 0.05;
    const outsideNegZ = pos.z <= -1 - 0.4 + 0.05;
    expect(outsideX || outsideNegX || outsideZ || outsideNegZ).toBe(true);
  });

  it("player cannot be pushed past a boundary wall", () => {
    // North wall: 32×10×1 centred at (0, 5, -15.5)
    const wallHandle = physics.addBody(1, {
      shape: "box",
      size: 16,
      halfExtents: { x: 16, y: 5, z: 0.5 },
      isStatic: true,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(wallHandle, { x: 0, y: 5, z: -15.5 });

    const playerHandle = physics.addBody(2, {
      shape: "circle",
      size: 0.4,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    // Player near north wall, moving north fast
    physics.setPosition(playerHandle, { x: 0, y: 0.4, z: -13 });
    physics.setVelocity(playerHandle, { x: 0, y: 0, z: -20 });

    for (let i = 0; i < 60; i++) physics.step(1 / 60);

    const pos = physics.getPosition(playerHandle)!;
    // Wall inner face is at z = -15.5 + 0.5 = -15. Player (r=0.4) must stay ≥ -15 + 0.4
    expect(pos.z).toBeGreaterThanOrEqual(-15 + 0.4 - 0.05);
  });
});

// ---------------------------------------------------------------------------
// isPositionOccupied()
// ---------------------------------------------------------------------------

describe("PhysicsEngine.isPositionOccupied", () => {
  let physics: PhysicsEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    physics = new PhysicsEngine(eventBus);
    // Static box at (0, 1, 0) with half-extents (1, 1, 1)
    const handle = physics.addBody(1, {
      shape: "box",
      size: 1,
      halfExtents: { x: 1, y: 1, z: 1 },
      isStatic: true,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(handle, { x: 0, y: 1, z: 0 });
  });

  it("returns true when AABB overlaps static body", () => {
    // A small box at (0, 1, 0) — coincides with the static body
    expect(
      physics.isPositionOccupied(0, 1, 0, { x: 0.5, y: 0.5, z: 0.5 }),
    ).toBe(true);
  });

  it("returns false when AABB is above the static body", () => {
    // Clear space above: static body top is at y=2; test at y=3 half=0.5
    expect(
      physics.isPositionOccupied(0, 3, 0, { x: 0.5, y: 0.5, z: 0.5 }),
    ).toBe(false);
  });

  it("returns false when AABB is beside the static body (no XZ overlap)", () => {
    // Displaced far on X — no overlap
    expect(
      physics.isPositionOccupied(5, 1, 0, { x: 0.5, y: 0.5, z: 0.5 }),
    ).toBe(false);
  });

  it("returns false for trigger-only bodies", () => {
    const triggerHandle = physics.addBody(2, {
      shape: "box",
      size: 1,
      halfExtents: { x: 1, y: 1, z: 1 },
      isStatic: true,
      isTrigger: true, // trigger — should be ignored
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(triggerHandle, { x: 5, y: 1, z: 0 });

    expect(
      physics.isPositionOccupied(5, 1, 0, { x: 0.5, y: 0.5, z: 0.5 }),
    ).toBe(false);
  });

  it("returns false for dynamic (non-static) bodies", () => {
    const dynHandle = physics.addBody(3, {
      shape: "circle",
      size: 0.5,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(dynHandle, { x: 8, y: 1, z: 0 });

    expect(
      physics.isPositionOccupied(8, 1, 0, { x: 0.5, y: 0.5, z: 0.5 }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CatCompanionManager auto-raise & failure feedback
// ---------------------------------------------------------------------------

function makeManagerWithPhysics(overrides?: {
  isPositionOccupied?: (x: number, y: number, z: number, he: Vec3) => boolean;
  getHighestSurfaceY?: (x: number, z: number) => number;
}) {
  const world = {
    createEntity: vi.fn(() => 99),
    addComponent: vi.fn(),
    isAlive: vi.fn(() => true),
    destroyEntity: vi.fn(),
    getComponent: vi.fn(() => null),
  };
  const eventBus = new EventBus();
  const mapManager = {
    getTerrainAt: vi.fn(() => ({ type: "Grass" })),
    getHeightAt: vi.fn(() => 0),
  };
  const gameState = {
    yarn: 20,
    deductYarn: vi.fn((cost: number) => {
      gameState.yarn -= cost;
      return true;
    }),
    addYarn: vi.fn(),
    maxInventoryCapacity: 10,
  };
  const getPlayerEntity = vi.fn(() => null);
  const physics = {
    getHighestSurfaceY: vi.fn(overrides?.getHighestSurfaceY ?? (() => 0)),
    isPositionOccupied: vi.fn(overrides?.isPositionOccupied ?? (() => false)),
    addBody: vi.fn(() => Symbol()),
    setPosition: vi.fn(),
    removeBody: vi.fn(),
  };

  const manager = new CatCompanionManager(
    world as never,
    eventBus,
    mapManager as never,
    gameState as never,
    getPlayerEntity as never,
    physics as never,
  );

  return { manager, physics, eventBus, gameState };
}

describe("CatCompanionManager auto-raise", () => {
  it("places cat at default centerY when position is clear", () => {
    const { manager, physics } = makeManagerWithPhysics({
      isPositionOccupied: () => false,
      getHighestSurfaceY: () => 0,
    });

    // Loaf yarnCost=1; surfaceY=0, halfHeight=0.375 → centerY=0.375
    const result = manager.summon(CatType.Loaf, { x: 0, y: 0, z: 0 });
    expect(result).not.toBeNull();
    // isPositionOccupied was called with the first attempt (attempt 0)
    expect((physics.isPositionOccupied as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toBeCloseTo(0.375, 3);
  });

  it("raises centerY by 0.5u on second attempt when first is occupied", () => {
    let callCount = 0;
    const { manager, physics } = makeManagerWithPhysics({
      isPositionOccupied: () => callCount++ === 0, // first call occupied, rest clear
      getHighestSurfaceY: () => 0,
    });

    const result = manager.summon(CatType.Loaf, { x: 0, y: 0, z: 0 });
    expect(result).not.toBeNull();
    const calls = (physics.isPositionOccupied as ReturnType<typeof vi.fn>).mock.calls;
    // Second call should use y = 0.375 + 0.5 = 0.875
    expect(calls[1]?.[1]).toBeCloseTo(0.875, 3);
  });

  it("raises centerY by 1.0u on third attempt", () => {
    let callCount = 0;
    const { manager, physics } = makeManagerWithPhysics({
      isPositionOccupied: () => callCount++ < 2, // first two calls occupied
      getHighestSurfaceY: () => 0,
    });

    const result = manager.summon(CatType.Loaf, { x: 0, y: 0, z: 0 });
    expect(result).not.toBeNull();
    const calls = (physics.isPositionOccupied as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[2]?.[1]).toBeCloseTo(0.375 + 1.0, 3);
  });

  it("returns null and emits cat:place:failed after all 3 attempts occupied", () => {
    const emitted: Extract<GameEvent, { type: "cat:place:failed" }>[] = [];
    const { manager, eventBus } = makeManagerWithPhysics({
      isPositionOccupied: () => true, // always occupied
    });
    eventBus.on("cat:place:failed", (e) => emitted.push(e));

    const result = manager.summon(CatType.Loaf, { x: 0, y: 0, z: 0 });
    expect(result).toBeNull();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.catType).toBe(CatType.Loaf);
  });

  it("does not deduct yarn when all positions are occupied", () => {
    const { manager, gameState } = makeManagerWithPhysics({
      isPositionOccupied: () => true,
    });
    const yarnBefore = gameState.yarn;

    manager.summon(CatType.Loaf, { x: 0, y: 0, z: 0 });
    expect(gameState.yarn).toBe(yarnBefore);
  });
});
