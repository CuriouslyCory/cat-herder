import type { Entity } from "../ecs/Entity";
import type { Vec3 } from "../types";
import type { EventBus } from "./EventBus";
import { runtimeConfig } from "../config";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Opaque handle for a registered physics body. */
export type BodyHandle = symbol;

export interface BodyConfig {
  /** Circle (capsule in 2D XZ) or box for terrain/walls. */
  shape: "circle" | "box";
  /** Radius for circle; uniform half-extent for box (used when halfExtents is omitted). */
  size: number;
  /**
   * For shape === "box": optional per-axis half-extents. When provided, this
   * overrides `size` for box collision math (rayBox, resolveCircleBox, overlapsXZ).
   * Required for non-cubic colliders such as the Loaf cat (1.2 × 1.5 × 1.2).
   */
  halfExtents?: Vec3;
  /** Static bodies are never moved by the solver. */
  isStatic: boolean;
  /** Trigger bodies detect overlap but produce no physics response. */
  isTrigger: boolean;
  /** Bitmask — which layer this body belongs to. */
  collisionLayer: number;
  /** Bitmask — which layers this body interacts with. */
  collisionMask: number;
}

export interface RaycastHit {
  /** The entity at the hit point. */
  entity: Entity;
  /** World-space point of intersection. */
  point: Vec3;
  /** Distance from ray origin to hit point. */
  distance: number;
  /** Outward-facing surface normal at the hit point. */
  normal: Vec3;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface PhysicsBody {
  handle: BodyHandle;
  entity: Entity;
  config: BodyConfig;
  position: Vec3;
  velocity: Vec3;
  isGrounded: boolean;
  /** Grounded state from the previous step — bridges the 1-frame lag
   *  between PhysicsEngine.step() and MovementSystem reading the flag. */
  wasGroundedLastFrame: boolean;
  /** When true, gravity is not applied — used for swimming entities. */
  noGravity: boolean;
}

// ---------------------------------------------------------------------------
// PhysicsEngine
// ---------------------------------------------------------------------------

/**
 * Lightweight, self-contained physics engine.
 *
 * Maintains its own body state (position, velocity, grounded flag) independently
 * of the ECS World. The MovementSystem is responsible for syncing ECS
 * Transform/Velocity components with body state via the accessor methods.
 *
 * Frame order: MovementSystem (sets velocity) → PhysicsEngine.step() →
 *              CollisionSystem → RenderSystem → InputManager.poll() (end of frame)
 */
export class PhysicsEngine {
  private readonly bodies = new Map<BodyHandle, PhysicsBody>();
  private readonly entityToHandle = new Map<Entity, BodyHandle>();
  /** Tracks currently-active trigger overlaps as "triggerEntity:targetEntity" keys. */
  private activeOverlaps = new Set<string>();

  constructor(private readonly eventBus: EventBus) {}

  // --- Body lifecycle ---

  /**
   * Register a new physics body for the given entity.
   * Initial position defaults to the origin — call setPosition() after
   * the ECS Transform is known.
   */
  addBody(entity: Entity, config: BodyConfig): BodyHandle {
    const handle: BodyHandle = Symbol("PhysicsBody");
    this.bodies.set(handle, {
      handle,
      entity,
      config,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      isGrounded: false,
      wasGroundedLastFrame: false,
      noGravity: false,
    });
    this.entityToHandle.set(entity, handle);
    return handle;
  }

  removeBody(handle: BodyHandle): void {
    const body = this.bodies.get(handle);
    if (!body) return;
    this.entityToHandle.delete(body.entity);
    this.bodies.delete(handle);
  }

  // --- Accessors for MovementSystem / sync ---

  getPosition(handle: BodyHandle): Readonly<Vec3> | null {
    return this.bodies.get(handle)?.position ?? null;
  }

  setPosition(handle: BodyHandle, position: Vec3): void {
    const body = this.bodies.get(handle);
    if (!body) return;
    body.position.x = position.x;
    body.position.y = position.y;
    body.position.z = position.z;
  }

  getVelocity(handle: BodyHandle): Readonly<Vec3> | null {
    return this.bodies.get(handle)?.velocity ?? null;
  }

  setVelocity(handle: BodyHandle, velocity: Vec3): void {
    const body = this.bodies.get(handle);
    if (!body) return;
    body.velocity.x = velocity.x;
    body.velocity.y = velocity.y;
    body.velocity.z = velocity.z;
  }

  isBodyGrounded(handle: BodyHandle): boolean {
    return this.bodies.get(handle)?.isGrounded ?? false;
  }

  wasBodyGroundedLastFrame(handle: BodyHandle): boolean {
    return this.bodies.get(handle)?.wasGroundedLastFrame ?? false;
  }

  /** Reverse-lookup: entity → BodyHandle, or null if not registered. */
  getHandleByEntity(entity: Entity): BodyHandle | null {
    return this.entityToHandle.get(entity) ?? null;
  }

  /**
   * Enable or disable gravity for a specific body.
   * Disable when the entity is swimming so buoyancy logic controls Y instead.
   */
  setGravityEnabled(handle: BodyHandle, enabled: boolean): void {
    const body = this.bodies.get(handle);
    if (body) body.noGravity = !enabled;
  }

  // --- Raycast ---

  /**
   * Cast a ray through all non-trigger bodies and return the closest hit.
   * Direction is automatically normalized.
   */
  raycast(origin: Vec3, direction: Vec3, maxDist: number): RaycastHit | null {
    const len = Math.sqrt(
      direction.x ** 2 + direction.y ** 2 + direction.z ** 2,
    );
    if (len === 0) return null;
    const dir: Vec3 = {
      x: direction.x / len,
      y: direction.y / len,
      z: direction.z / len,
    };

    let closest: RaycastHit | null = null;

    for (const body of this.bodies.values()) {
      if (body.config.isTrigger) continue;

      const hit =
        body.config.shape === "circle"
          ? this.raySphere(origin, dir, maxDist, body)
          : this.rayBox(origin, dir, maxDist, body);

      if (hit && (!closest || hit.distance < closest.distance)) {
        closest = hit;
      }
    }

    return closest;
  }

  /**
   * Returns the Y coordinate of the highest static surface at the given XZ
   * position, or 0 if no static body covers that point.
   */
  getHighestSurfaceY(x: number, z: number): number {
    const RAY_CEILING = 50;
    const hit = this.raycast(
      { x, y: RAY_CEILING, z },
      { x: 0, y: -1, z: 0 },
      RAY_CEILING,
    );
    return hit ? hit.point.y : 0;
  }

  // --- Simulation step ---

  /** Advance the simulation by dt seconds. */
  step(dt: number): void {
    for (const body of this.bodies.values()) {
      if (body.config.isStatic) continue;
      this.integrateBody(body, dt);
    }
    this.detectTriggerOverlaps();
  }

  /**
   * Returns the per-axis half-extents for a box body.
   * Falls back to a uniform cube of `size` when `halfExtents` is omitted.
   * Caller is responsible for ensuring the body is shape === "box".
   */
  private static boxHalf(body: PhysicsBody): Vec3 {
    const he = body.config.halfExtents;
    if (he) return he;
    const s = body.config.size;
    return { x: s, y: s, z: s };
  }

  // ---------------------------------------------------------------------------
  // Private — integration
  // ---------------------------------------------------------------------------

  private integrateBody(body: PhysicsBody, dt: number): void {
    const cfg = runtimeConfig;

    // Gravity — only when airborne and gravity is not suppressed (e.g. swimming)
    if (!body.isGrounded && !body.noGravity) {
      body.velocity.y += cfg.gravity * dt;
    }

    // Tentative new position after integrating velocity
    const newPos: Vec3 = {
      x: body.position.x + body.velocity.x * dt,
      y: body.position.y + body.velocity.y * dt,
      z: body.position.z + body.velocity.z * dt,
    };

    // Ground detection — downward raycast from body center
    // Only when falling or at rest; skip while rising so the raycast doesn't
    // re-ground the body mid-jump on nearby surfaces (e.g. loaf platforms).
    body.wasGroundedLastFrame = body.isGrounded;
    body.isGrounded = false;
    if (body.velocity.y <= 0) {
      const groundMaxDist = body.config.size + cfg.groundSnapTolerance;
      const groundHit = this.raycastDownward(newPos, groundMaxDist, body);
      if (groundHit) {
        newPos.y = groundHit.point.y + body.config.size;
        if (body.velocity.y < 0) body.velocity.y = 0;
        body.isGrounded = true;
      }
    }

    // Flat-floor fallback: prevents dynamic bodies from falling below the base terrain
    // (y = 0). Elevated platforms are handled by registered static physics bodies.
    // Skip for noGravity bodies (e.g. swimming) — buoyancy logic controls their Y.
    if (!body.isGrounded && !body.noGravity && newPos.y <= body.config.size) {
      newPos.y = body.config.size;
      if (body.velocity.y < 0) body.velocity.y = 0;
      body.isGrounded = true;
    }

    // Horizontal collision resolution (XZ plane) against static solids
    this.resolveHorizontalCollisions(body, newPos, cfg.skinWidth);

    body.position.x = newPos.x;
    body.position.y = newPos.y;
    body.position.z = newPos.z;
  }

  /**
   * Downward raycast that skips `exclude` and non-static/trigger bodies.
   * Returns the closest hit on the top surface of a static solid.
   */
  private raycastDownward(
    origin: Vec3,
    maxDist: number,
    exclude: PhysicsBody,
  ): RaycastHit | null {
    const down: Vec3 = { x: 0, y: -1, z: 0 };
    let closest: RaycastHit | null = null;

    for (const body of this.bodies.values()) {
      if (body === exclude) continue;
      if (body.config.isTrigger || !body.config.isStatic) continue;
      if (!(body.config.collisionLayer & exclude.config.collisionMask)) continue;

      const hit =
        body.config.shape === "box"
          ? this.rayBox(origin, down, maxDist, body)
          : this.raySphere(origin, down, maxDist, body);

      if (hit && (!closest || hit.distance < closest.distance)) {
        closest = hit;
      }
    }

    return closest;
  }

  /** Push `newPos` out of any static solid it overlaps in both XZ and Y. */
  private resolveHorizontalCollisions(
    body: PhysicsBody,
    newPos: Vec3,
    skinWidth: number,
  ): void {
    const bodyBottom = newPos.y - body.config.size;
    const bodyTop = newPos.y + body.config.size;

    for (const other of this.bodies.values()) {
      if (other === body) continue;
      if (!other.config.isStatic || other.config.isTrigger) continue;
      if (!(other.config.collisionLayer & body.config.collisionMask)) continue;

      // Y-overlap guard: skip when the bodies are vertically separated.
      // Epsilon avoids false positives from float rounding (e.g. 0.75+0.4−0.4 ≠ 0.75).
      const Y_EPSILON = 1e-4;
      const otherHalf = PhysicsEngine.boxHalf(other);
      const otherBottom = other.position.y - otherHalf.y;
      const otherTop = other.position.y + otherHalf.y;
      if (bodyBottom >= otherTop - Y_EPSILON || bodyTop <= otherBottom + Y_EPSILON)
        continue;

      if (body.config.shape === "circle" && other.config.shape === "circle") {
        this.resolveCircleCircle(body.config.size + skinWidth, other, newPos);
      } else if (body.config.shape === "circle" && other.config.shape === "box") {
        this.resolveCircleBox(body.config.size + skinWidth, other, newPos);
      }
    }
  }

  private resolveCircleCircle(
    radius: number,
    other: PhysicsBody,
    newPos: Vec3,
  ): void {
    const dx = newPos.x - other.position.x;
    const dz = newPos.z - other.position.z;
    const distSq = dx * dx + dz * dz;
    const minDist = radius + other.config.size;
    if (distSq < minDist * minDist && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const push = (minDist - dist) / dist;
      newPos.x += dx * push;
      newPos.z += dz * push;
    }
  }

  /**
   * Push a circle body out of a box body (XZ plane).
   * Finds the closest point on the box surface and pushes the circle center
   * away — this produces the wall-sliding effect.
   *
   * Uses per-axis half-extents (boxHalf.x / boxHalf.z) so non-cubic colliders
   * such as the Loaf cat are resolved against their actual XZ footprint, not
   * an inflated uniform-cube approximation.
   */
  private resolveCircleBox(
    radius: number,
    other: PhysicsBody,
    newPos: Vec3,
  ): void {
    const half = PhysicsEngine.boxHalf(other);
    const nearX = Math.max(
      other.position.x - half.x,
      Math.min(newPos.x, other.position.x + half.x),
    );
    const nearZ = Math.max(
      other.position.z - half.z,
      Math.min(newPos.z, other.position.z + half.z),
    );
    const dx = newPos.x - nearX;
    const dz = newPos.z - nearZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      if (distSq > 0) {
        const dist = Math.sqrt(distSq);
        const push = (radius - dist) / dist;
        newPos.x += dx * push;
        newPos.z += dz * push;
      } else {
        // Origin exactly on box surface — push out on X as fallback
        newPos.x = other.position.x + half.x + radius;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private — trigger overlaps
  // ---------------------------------------------------------------------------

  private detectTriggerOverlaps(): void {
    const currentOverlaps = new Set<string>();

    for (const trigger of this.bodies.values()) {
      if (!trigger.config.isTrigger) continue;

      for (const other of this.bodies.values()) {
        if (other === trigger) continue;
        if (!(trigger.config.collisionLayer & other.config.collisionMask)) continue;

        if (this.overlapsXZ(trigger, other)) {
          const key = `${trigger.entity}:${other.entity}`;
          currentOverlaps.add(key);
          if (!this.activeOverlaps.has(key)) {
            this.eventBus.emit({
              type: "trigger:enter",
              trigger: trigger.entity,
              target: other.entity,
            });
          }
        }
      }
    }

    // Emit exit events for overlaps that ended this frame
    for (const key of this.activeOverlaps) {
      if (!currentOverlaps.has(key)) {
        const sep = key.indexOf(":");
        const triggerEntity = parseInt(key.slice(0, sep), 10);
        const targetEntity = parseInt(key.slice(sep + 1), 10);
        this.eventBus.emit({
          type: "trigger:exit",
          trigger: triggerEntity,
          target: targetEntity,
        });
      }
    }

    this.activeOverlaps = currentOverlaps;
  }

  /** XZ-plane overlap test used for trigger detection (ignores Y). */
  private overlapsXZ(a: PhysicsBody, b: PhysicsBody): boolean {
    if (a.config.shape === "circle" && b.config.shape === "circle") {
      const dx = a.position.x - b.position.x;
      const dz = a.position.z - b.position.z;
      const minDist = a.config.size + b.config.size;
      return dx * dx + dz * dz < minDist * minDist;
    }
    // For box or mixed: use AABB-style footprint with per-axis half-extents.
    // (Treats circles as their bounding square in XZ — a slight overshoot at
    // corners but matches existing behavior and is cheap.)
    const aHalfX =
      a.config.shape === "box" ? PhysicsEngine.boxHalf(a).x : a.config.size;
    const aHalfZ =
      a.config.shape === "box" ? PhysicsEngine.boxHalf(a).z : a.config.size;
    const bHalfX =
      b.config.shape === "box" ? PhysicsEngine.boxHalf(b).x : b.config.size;
    const bHalfZ =
      b.config.shape === "box" ? PhysicsEngine.boxHalf(b).z : b.config.size;
    return (
      Math.abs(a.position.x - b.position.x) < aHalfX + bHalfX &&
      Math.abs(a.position.z - b.position.z) < aHalfZ + bHalfZ
    );
  }

  // ---------------------------------------------------------------------------
  // Private — ray intersection math
  // ---------------------------------------------------------------------------

  /** Ray vs. sphere intersection (normalized direction assumed). */
  private raySphere(
    origin: Vec3,
    dir: Vec3,
    maxDist: number,
    body: PhysicsBody,
  ): RaycastHit | null {
    const r = body.config.size;
    const ox = origin.x - body.position.x;
    const oy = origin.y - body.position.y;
    const oz = origin.z - body.position.z;
    // a = 1 (dir is normalized)
    const b = 2 * (ox * dir.x + oy * dir.y + oz * dir.z);
    const c = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / 2;
    if (t < 0 || t > maxDist) return null;
    const point: Vec3 = {
      x: origin.x + dir.x * t,
      y: origin.y + dir.y * t,
      z: origin.z + dir.z * t,
    };
    const normal: Vec3 = {
      x: (point.x - body.position.x) / r,
      y: (point.y - body.position.y) / r,
      z: (point.z - body.position.z) / r,
    };
    return { entity: body.entity, point, distance: t, normal };
  }

  /**
   * Ray vs. AABB intersection using the slab method.
   * Returns the entry hit (tmin), or null if the ray misses or starts past maxDist.
   */
  private rayBox(
    origin: Vec3,
    dir: Vec3,
    maxDist: number,
    body: PhysicsBody,
  ): RaycastHit | null {
    const half = PhysicsEngine.boxHalf(body);
    const axes = ["x", "y", "z"] as const;
    let tmin = 0;
    let tmax = maxDist;
    let hitNormal: Vec3 = { x: 0, y: 1, z: 0 };

    for (const axis of axes) {
      const d = dir[axis];
      const bmin = body.position[axis] - half[axis];
      const bmax = body.position[axis] + half[axis];

      if (Math.abs(d) < 1e-10) {
        // Ray parallel to this slab — miss if origin is outside
        if (origin[axis] < bmin || origin[axis] > bmax) return null;
      } else {
        const invD = 1 / d;
        let t1 = (bmin - origin[axis]) * invD;
        let t2 = (bmax - origin[axis]) * invD;
        let entryNormal: Vec3 = { x: 0, y: 0, z: 0 };

        if (t1 > t2) {
          // Swap so t1 ≤ t2; entry normal points in positive axis direction
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          entryNormal = {
            x: axis === "x" ? 1 : 0,
            y: axis === "y" ? 1 : 0,
            z: axis === "z" ? 1 : 0,
          };
        } else {
          entryNormal = {
            x: axis === "x" ? -1 : 0,
            y: axis === "y" ? -1 : 0,
            z: axis === "z" ? -1 : 0,
          };
        }

        if (t1 > tmin) {
          tmin = t1;
          hitNormal = entryNormal;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
    }

    // tmin < 0 means the ray origin is inside the box — no entry hit
    if (tmin < 0) return null;

    const point: Vec3 = {
      x: origin.x + dir.x * tmin,
      y: origin.y + dir.y * tmin,
      z: origin.z + dir.z * tmin,
    };
    return { entity: body.entity, point, distance: tmin, normal: hitNormal };
  }
}
