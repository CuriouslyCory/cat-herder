import { describe, it, expect, beforeEach } from "vitest";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { EventBus } from "~/game/engine/EventBus";

describe("PhysicsEngine", () => {
  let physics: PhysicsEngine;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    physics = new PhysicsEngine(eventBus);
  });

  describe("body lifecycle", () => {
    it("registers and retrieves a body by entity", () => {
      const handle = physics.addBody(1, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      expect(physics.getHandleByEntity(1)).toBe(handle);
    });

    it("removes a body", () => {
      const handle = physics.addBody(1, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.removeBody(handle);
      expect(physics.getHandleByEntity(1)).toBeNull();
    });
  });

  describe("position and velocity", () => {
    it("sets and gets position", () => {
      const handle = physics.addBody(1, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(handle, { x: 5, y: 2, z: 3 });
      const pos = physics.getPosition(handle);
      expect(pos).toEqual({ x: 5, y: 2, z: 3 });
    });

    it("sets and gets velocity", () => {
      const handle = physics.addBody(1, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setVelocity(handle, { x: 1, y: 3.5, z: -1 });
      const vel = physics.getVelocity(handle);
      expect(vel).toEqual({ x: 1, y: 3.5, z: -1 });
    });
  });

  describe("gravity and grounding", () => {
    it("applies gravity to airborne dynamic bodies", () => {
      const handle = physics.addBody(1, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(handle, { x: 0, y: 5, z: 0 });
      physics.setVelocity(handle, { x: 0, y: 0, z: 0 });

      physics.step(1 / 60);

      const vel = physics.getVelocity(handle)!;
      expect(vel.y).toBeLessThan(0);
    });

    it("does not apply gravity when noGravity is set", () => {
      const handle = physics.addBody(1, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(handle, { x: 0, y: 5, z: 0 });
      physics.setVelocity(handle, { x: 0, y: 0, z: 0 });
      physics.setGravityEnabled(handle, false);

      physics.step(1 / 60);

      const vel = physics.getVelocity(handle)!;
      expect(vel.y).toBe(0);
    });

    it("grounds bodies at y=0 floor", () => {
      const handle = physics.addBody(1, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(handle, { x: 0, y: 0.4, z: 0 });
      physics.setVelocity(handle, { x: 0, y: -1, z: 0 });

      physics.step(1 / 60);

      expect(physics.isBodyGrounded(handle)).toBe(true);
      const vel = physics.getVelocity(handle)!;
      expect(vel.y).toBe(0);
    });

    it("does not move static bodies", () => {
      const handle = physics.addBody(1, {
        shape: "box",
        size: 1,
        isStatic: true,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(handle, { x: 0, y: 5, z: 0 });

      physics.step(1 / 60);

      const pos = physics.getPosition(handle)!;
      expect(pos.y).toBe(5);
    });
  });

  describe("trigger overlap events", () => {
    it("emits trigger:enter when bodies overlap", () => {
      const events: unknown[] = [];
      eventBus.on("trigger:enter", (e) => events.push(e));

      physics.addBody(1, {
        shape: "circle",
        size: 2,
        isStatic: true,
        isTrigger: true,
        collisionLayer: 1,
        collisionMask: 1,
      });
      const playerHandle = physics.addBody(2, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(playerHandle, { x: 0, y: 0.4, z: 0 });

      physics.step(1 / 60);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "trigger:enter", trigger: 1, target: 2 });
    });

    it("emits trigger:exit when overlap ends", () => {
      const exits: unknown[] = [];
      eventBus.on("trigger:exit", (e) => exits.push(e));

      physics.addBody(1, {
        shape: "circle",
        size: 1,
        isStatic: true,
        isTrigger: true,
        collisionLayer: 1,
        collisionMask: 1,
      });
      const playerHandle = physics.addBody(2, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(playerHandle, { x: 0, y: 0.4, z: 0 });

      physics.step(1 / 60);
      expect(exits).toHaveLength(0);

      physics.setPosition(playerHandle, { x: 50, y: 0.4, z: 50 });
      physics.step(1 / 60);

      expect(exits).toHaveLength(1);
      expect(exits[0]).toMatchObject({ type: "trigger:exit", trigger: 1, target: 2 });
    });
  });

  describe("ground detection on elevated surfaces", () => {
    it("grounds a dynamic body on top of a static box", () => {
      const boxHandle = physics.addBody(1, {
        shape: "box",
        size: 0.6,
        halfExtents: { x: 0.6, y: 0.375, z: 0.6 },
        isStatic: true,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(boxHandle, { x: 0, y: 0.375, z: 0 });

      const playerHandle = physics.addBody(2, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(playerHandle, { x: 0, y: 1.2, z: 0 });
      physics.setVelocity(playerHandle, { x: 0, y: -2, z: 0 });

      for (let i = 0; i < 30; i++) physics.step(1 / 60);

      expect(physics.isBodyGrounded(playerHandle)).toBe(true);
      const pos = physics.getPosition(playerHandle)!;
      expect(pos.y).toBeCloseTo(0.75 + 0.4, 1);
    });
  });

  describe("Y-overlap guard for horizontal collisions", () => {
    it("does not push player horizontally when standing above a box", () => {
      const boxHandle = physics.addBody(1, {
        shape: "box",
        size: 0.6,
        halfExtents: { x: 0.6, y: 0.375, z: 0.6 },
        isStatic: true,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(boxHandle, { x: 0, y: 0.375, z: 0 });

      const playerHandle = physics.addBody(2, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      // Player standing on top: center at boxTop + radius = 0.75 + 0.4
      physics.setPosition(playerHandle, { x: 0, y: 1.15, z: 0 });
      physics.setVelocity(playerHandle, { x: 0, y: 0, z: 0 });

      physics.step(1 / 60);

      const pos = physics.getPosition(playerHandle)!;
      expect(pos.x).toBeCloseTo(0, 2);
      expect(pos.z).toBeCloseTo(0, 2);
    });

    it("pushes player horizontally when overlapping a box in Y", () => {
      const boxHandle = physics.addBody(1, {
        shape: "box",
        size: 0.6,
        halfExtents: { x: 0.6, y: 0.375, z: 0.6 },
        isStatic: true,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(boxHandle, { x: 0, y: 0.375, z: 0 });

      const playerHandle = physics.addBody(2, {
        shape: "circle",
        size: 0.4,
        isStatic: false,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      // Player at same height as box center — Y ranges overlap
      physics.setPosition(playerHandle, { x: 0.3, y: 0.4, z: 0 });
      physics.setVelocity(playerHandle, { x: 0, y: 0, z: 0 });

      physics.step(1 / 60);

      const pos = physics.getPosition(playerHandle)!;
      expect(Math.abs(pos.x)).toBeGreaterThan(0.3);
    });
  });

  describe("getHighestSurfaceY", () => {
    it("returns 0 when no bodies are present", () => {
      expect(physics.getHighestSurfaceY(0, 0)).toBe(0);
    });

    it("returns top of a static box", () => {
      const handle = physics.addBody(1, {
        shape: "box",
        size: 0.6,
        halfExtents: { x: 0.6, y: 0.375, z: 0.6 },
        isStatic: true,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(handle, { x: 0, y: 0.375, z: 0 });

      const y = physics.getHighestSurfaceY(0, 0);
      expect(y).toBeCloseTo(0.75, 2);
    });

    it("returns highest of two stacked boxes", () => {
      const h1 = physics.addBody(1, {
        shape: "box",
        size: 0.6,
        halfExtents: { x: 0.6, y: 0.375, z: 0.6 },
        isStatic: true,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(h1, { x: 0, y: 0.375, z: 0 });

      const h2 = physics.addBody(2, {
        shape: "box",
        size: 0.6,
        halfExtents: { x: 0.6, y: 0.375, z: 0.6 },
        isStatic: true,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      physics.setPosition(h2, { x: 0, y: 1.125, z: 0 });

      const y = physics.getHighestSurfaceY(0, 0);
      expect(y).toBeCloseTo(1.5, 2);
    });
  });

  describe("raycast", () => {
    it("hits a sphere body", () => {
      physics.addBody(1, {
        shape: "circle",
        size: 1,
        isStatic: true,
        isTrigger: false,
        collisionLayer: 1,
        collisionMask: 1,
      });
      const handle = physics.getHandleByEntity(1)!;
      physics.setPosition(handle, { x: 0, y: 0, z: 5 });

      const hit = physics.raycast(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        10,
      );
      expect(hit).not.toBeNull();
      expect(hit!.entity).toBe(1);
      expect(hit!.distance).toBeCloseTo(4, 1);
    });

    it("ignores trigger bodies", () => {
      physics.addBody(1, {
        shape: "circle",
        size: 1,
        isStatic: true,
        isTrigger: true,
        collisionLayer: 1,
        collisionMask: 1,
      });
      const handle = physics.getHandleByEntity(1)!;
      physics.setPosition(handle, { x: 0, y: 0, z: 5 });

      const hit = physics.raycast(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        10,
      );
      expect(hit).toBeNull();
    });
  });
});
