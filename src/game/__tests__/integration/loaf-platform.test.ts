import { describe, it, expect, beforeEach } from "vitest";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { EventBus } from "~/game/engine/EventBus";
import { CONFIG } from "~/game/config";

describe("loaf platform integration", () => {
  let physics: PhysicsEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    physics = new PhysicsEngine(eventBus);
  });

  it("jumpImpulse is derived from jumpApex and gravity", () => {
    const expected = Math.sqrt(2 * Math.abs(CONFIG.gravity) * CONFIG.jumpApex);
    expect(CONFIG.jumpImpulse).toBeCloseTo(expected, 5);
  });

  it("player can land on a loaf-sized platform", () => {
    // Loaf: 1.2 x 0.75 x 1.2, placed at x=2 so player can jump onto it
    const loafHandle = physics.addBody(1, {
      shape: "box",
      size: 0.6,
      halfExtents: { x: 0.6, y: 0.375, z: 0.6 },
      isStatic: true,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(loafHandle, { x: 0, y: 0.375, z: 0 });

    // Player starts above the loaf with downward velocity (simulating arc descent)
    const playerHandle = physics.addBody(2, {
      shape: "circle",
      size: 0.4,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    physics.setPosition(playerHandle, { x: 0, y: 1.5, z: 0 });
    physics.setVelocity(playerHandle, { x: 0, y: -1, z: 0 });

    // Simulate enough frames for the player to fall and land
    for (let i = 0; i < 60; i++) physics.step(1 / 60);

    expect(physics.isBodyGrounded(playerHandle)).toBe(true);
    const pos = physics.getPosition(playerHandle)!;
    // Player center should be at loafTop + playerRadius = 0.75 + 0.4 = 1.15
    expect(pos.y).toBeCloseTo(1.15, 1);
    // Player should NOT have been pushed off in XZ
    expect(pos.x).toBeCloseTo(0, 1);
    expect(pos.z).toBeCloseTo(0, 1);
  });

  it("max jump height matches jumpApex", () => {
    const playerHandle = physics.addBody(1, {
      shape: "circle",
      size: 0.4,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    // Start grounded at floor level
    physics.setPosition(playerHandle, { x: 0, y: 0.4, z: 0 });
    physics.setVelocity(playerHandle, { x: 0, y: CONFIG.jumpImpulse, z: 0 });

    let maxY = 0.4;
    for (let i = 0; i < 120; i++) {
      physics.step(1 / 60);
      const pos = physics.getPosition(playerHandle)!;
      if (pos.y > maxY) maxY = pos.y;
    }

    // Max center height - start height = jumpApex
    expect(maxY - 0.4).toBeCloseTo(CONFIG.jumpApex, 1);
  });
});
