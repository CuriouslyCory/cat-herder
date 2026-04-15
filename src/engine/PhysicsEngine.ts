import { runtimeConfig } from "../config";
import type { EventBus } from "./EventBus";

// ─── Public Types ─────────────────────────────────────────────────────────────

export type BodyShape = "box" | "sphere" | "cylinder";

export interface BodyConfig {
  shape: BodyShape;
  size: { x: number; y: number; z: number };
  isStatic: boolean;
  isTrigger: boolean;
  collisionLayer: number;
  collisionMask: number;
}

export interface RaycastHit {
  bodyHandle: BodyHandle;
  distance: number;
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

/** Opaque handle — callers do not access internal body data. */
export type BodyHandle = symbol;

// ─── Internal body representation ────────────────────────────────────────────

interface Body {
  config: BodyConfig;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  isGrounded: boolean;
}

// ─── PhysicsEngine ────────────────────────────────────────────────────────────

export class PhysicsEngine {
  private readonly bodies = new Map<BodyHandle, Body>();

  constructor(private readonly eventBus: EventBus) {}

  addBody(
    config: BodyConfig,
    initialPosition = { x: 0, y: 0, z: 0 },
  ): BodyHandle {
    const handle: BodyHandle = Symbol();
    this.bodies.set(handle, {
      config,
      position: { ...initialPosition },
      velocity: { x: 0, y: 0, z: 0 },
      isGrounded: false,
    });
    return handle;
  }

  removeBody(handle: BodyHandle): void {
    this.bodies.delete(handle);
  }

  getPosition(handle: BodyHandle): { x: number; y: number; z: number } | null {
    const body = this.bodies.get(handle);
    return body ? { ...body.position } : null;
  }

  setPosition(handle: BodyHandle, position: { x: number; y: number; z: number }): void {
    const body = this.bodies.get(handle);
    if (body) body.position = { ...position };
  }

  setVelocity(handle: BodyHandle, velocity: { x: number; y: number; z: number }): void {
    const body = this.bodies.get(handle);
    if (body) body.velocity = { ...velocity };
  }

  getVelocity(handle: BodyHandle): { x: number; y: number; z: number } | null {
    const body = this.bodies.get(handle);
    return body ? { ...body.velocity } : null;
  }

  isGrounded(handle: BodyHandle): boolean {
    return this.bodies.get(handle)?.isGrounded ?? false;
  }

  /**
   * Simple downward raycast against all static bodies.
   * Returns the closest hit along direction from origin up to maxDist.
   */
  raycast(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDist: number,
  ): RaycastHit | null {
    let closest: RaycastHit | null = null;

    for (const [handle, body] of this.bodies) {
      if (!body.config.isStatic) continue;

      // Simple AABB slab test along Y axis for downward casts
      if (direction.y >= 0) continue;

      const halfH = body.config.size.y / 2;
      const topY = body.position.y + halfH;

      // Horizontal overlap check
      const halfX = body.config.size.x / 2;
      const halfZ = body.config.size.z / 2;
      if (
        origin.x < body.position.x - halfX ||
        origin.x > body.position.x + halfX ||
        origin.z < body.position.z - halfZ ||
        origin.z > body.position.z + halfZ
      )
        continue;

      const t = (origin.y - topY) / -direction.y;
      if (t < 0 || t > maxDist) continue;
      if (closest && t >= closest.distance) continue;

      closest = {
        bodyHandle: handle,
        distance: t,
        point: {
          x: origin.x + direction.x * t,
          y: topY,
          z: origin.z + direction.z * t,
        },
        normal: { x: 0, y: 1, z: 0 },
      };
    }

    return closest;
  }

  /** Advance physics simulation by dt seconds. */
  step(dt: number): void {
    const gravity = runtimeConfig.gravity;
    const snapTol = runtimeConfig.groundSnapTolerance;

    for (const [handle, body] of this.bodies) {
      if (body.config.isStatic || body.config.isTrigger) continue;

      // Apply gravity if not grounded
      if (!body.isGrounded) {
        body.velocity.y += gravity * dt;
      }

      // Tentative new position
      const next = {
        x: body.position.x + body.velocity.x * dt,
        y: body.position.y + body.velocity.y * dt,
        z: body.position.z + body.velocity.z * dt,
      };

      // Ground detection via downward raycast
      const hit = this.raycast(next, { x: 0, y: -1, z: 0 }, snapTol + 0.2);
      if (hit && body.velocity.y <= 0) {
        next.y = hit.point.y;
        body.velocity.y = 0;
        if (!body.isGrounded) {
          this.eventBus.emit({ type: "PlayerLanded", entityId: handle.toString().length });
        }
        body.isGrounded = true;
      } else {
        body.isGrounded = false;
      }

      body.position = next;

      // Trigger overlap detection
      if (body.config.isTrigger) {
        this.checkTriggerOverlaps(handle, body);
      }
    }
  }

  private checkTriggerOverlaps(triggerHandle: BodyHandle, trigger: Body): void {
    for (const [handle, body] of this.bodies) {
      if (handle === triggerHandle) continue;
      if (!this.aabbOverlap(trigger, body)) continue;

      this.eventBus.emit({
        type: "TriggerEntered",
        triggerId: String(triggerHandle.description ?? ""),
        entityId: body.position.x, // placeholder — real entity mapping done in systems
      });
    }
  }

  private aabbOverlap(a: Body, b: Body): boolean {
    const ax = a.config.size.x / 2;
    const ay = a.config.size.y / 2;
    const az = a.config.size.z / 2;
    const bx = b.config.size.x / 2;
    const by = b.config.size.y / 2;
    const bz = b.config.size.z / 2;

    return (
      Math.abs(a.position.x - b.position.x) < ax + bx &&
      Math.abs(a.position.y - b.position.y) < ay + by &&
      Math.abs(a.position.z - b.position.z) < az + bz
    );
  }
}
