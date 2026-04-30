import type { System } from "../ecs/System";
import type { World } from "../ecs/World";
import type { Entity } from "../ecs/Entity";
import type { EventBus } from "../engine/EventBus";
import type { Transform } from "../ecs/components/Transform";
import type { Collider } from "../ecs/components/Collider";
import { runtimeConfig } from "../config";

// ---------------------------------------------------------------------------
// CollisionSystem — per-frame broad + narrow phase collision detection
//
// Broad phase  : axis-aligned bounding-box (AABB) overlap test — O(n²) but
//                acceptably fast for the entity counts in this game.
// Narrow phase : circle–circle and circle–box resolution.
//
// Resolution   : non-static, non-trigger bodies are pushed apart by the
//                minimum overlap vector, respecting `skinWidth` from config.
// Triggers     : overlap without physics response; `collision:enter` /
//                `collision:exit` events emitted via EventBus.
// Layers/masks : a pair only interacts when
//                  (A.layer & B.mask) !== 0 && (B.layer & A.mask) !== 0
// ---------------------------------------------------------------------------

export class CollisionSystem implements System {
  /**
   * Active overlapping trigger pairs.
   * Key: `"triggerEntity:targetEntity"` (smaller entity id first for symmetry)
   */
  private readonly activeTriggers = new Set<string>();

  /**
   * Active solid collision pairs — used to emit collision:enter / exit events
   * for non-trigger contacts too.
   */
  private readonly activeCollisions = new Set<string>();

  constructor(private readonly eventBus: EventBus) {}

  update(world: World, _dt: number): void {
    const entities = world.query("Transform", "Collider");

    const newTriggers = new Set<string>();
    const newCollisions = new Set<string>();

    // ── Broad + narrow phase ────────────────────────────────────────────────
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i]!;
        const b = entities[j]!;

        const tA = world.getComponent<Transform>(a, "Transform")!;
        const cA = world.getComponent<Collider>(a, "Collider")!;
        const tB = world.getComponent<Transform>(b, "Transform")!;
        const cB = world.getComponent<Collider>(b, "Collider")!;

        // Layer / mask filter
        if (
          (cA.collisionLayer & cB.collisionMask) === 0 ||
          (cB.collisionLayer & cA.collisionMask) === 0
        ) {
          continue;
        }

        // Broad phase: AABB — work in XZ plane (top-down 2D collision)
        const halfA = cA.size;
        const halfB = cB.size;
        const dx = Math.abs(tA.x - tB.x);
        const dz = Math.abs(tA.z - tB.z);
        if (dx > halfA + halfB || dz > halfA + halfB) {
          continue; // No AABB overlap
        }

        // Narrow phase
        const isTriggerPair = cA.isTrigger || cB.isTrigger;

        if (cA.shape === "circle" && cB.shape === "circle") {
          const overlap = resolveCircleCircle(a, tA, cA, b, tB, cB, isTriggerPair);
          if (overlap !== null) {
            handleContact(a, b, isTriggerPair, newTriggers, newCollisions);
          }
        } else {
          // circle-box (one must be box; treat box as the fixed reference)
          const circleEntity = cA.shape === "circle" ? a : b;
          const boxEntity = cA.shape === "circle" ? b : a;
          const tCircle = cA.shape === "circle" ? tA : tB;
          const cCircle = cA.shape === "circle" ? cA : cB;
          const tBox = cA.shape === "circle" ? tB : tA;
          const cBox = cA.shape === "circle" ? cB : cA;

          const overlap = resolveCircleBox(
            circleEntity,
            tCircle,
            cCircle,
            tBox,
            cBox,
            isTriggerPair,
          );
          if (overlap !== null) {
            handleContact(circleEntity, boxEntity, isTriggerPair, newTriggers, newCollisions);
          }
        }
      }
    }

    // ── Emit trigger:enter / trigger:exit ────────────────────────────────────
    for (const key of newTriggers) {
      if (!this.activeTriggers.has(key)) {
        const [triggerStr, targetStr] = key.split(":");
        this.eventBus.emit({
          type: "trigger:enter",
          trigger: Number(triggerStr),
          target: Number(targetStr),
        });
      }
    }
    for (const key of this.activeTriggers) {
      if (!newTriggers.has(key)) {
        const [triggerStr, targetStr] = key.split(":");
        this.eventBus.emit({
          type: "trigger:exit",
          trigger: Number(triggerStr),
          target: Number(targetStr),
        });
      }
    }
    this.activeTriggers.clear();
    for (const key of newTriggers) this.activeTriggers.add(key);

    // ── Emit collision:enter / collision:exit ────────────────────────────────
    for (const key of newCollisions) {
      if (!this.activeCollisions.has(key)) {
        const [aStr, bStr] = key.split(":");
        this.eventBus.emit({
          type: "collision:enter",
          entityA: Number(aStr),
          entityB: Number(bStr),
        });
      }
    }
    for (const key of this.activeCollisions) {
      if (!newCollisions.has(key)) {
        const [aStr, bStr] = key.split(":");
        this.eventBus.emit({
          type: "collision:exit",
          entityA: Number(aStr),
          entityB: Number(bStr),
        });
      }
    }
    this.activeCollisions.clear();
    for (const key of newCollisions) this.activeCollisions.add(key);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Canonical key for a pair — smaller entity id first. */
function pairKey(a: Entity, b: Entity): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function handleContact(
  a: Entity,
  b: Entity,
  isTrigger: boolean,
  triggerSet: Set<string>,
  collisionSet: Set<string>,
): void {
  const key = pairKey(a, b);
  if (isTrigger) {
    triggerSet.add(key);
  } else {
    collisionSet.add(key);
  }
}

/**
 * Circle–circle narrow phase.
 * Pushes dynamic bodies apart when overlapping (unless trigger).
 * Returns the overlap distance, or null if not overlapping.
 */
function resolveCircleCircle(
  _entityA: Entity,
  tA: Transform,
  cA: Collider,
  _entityB: Entity,
  tB: Transform,
  cB: Collider,
  isTrigger: boolean,
): number | null {
  const dx = tA.x - tB.x;
  const dz = tA.z - tB.z;
  const distSq = dx * dx + dz * dz;
  const minDist = cA.size + cB.size;
  if (distSq >= minDist * minDist) return null;

  if (!isTrigger && (!cA.isStatic || !cB.isStatic)) {
    const dist = Math.sqrt(distSq) || 0.0001;
    const overlap = minDist - dist + runtimeConfig.skinWidth;
    const nx = dx / dist;
    const nz = dz / dist;

    if (!cA.isStatic && !cB.isStatic) {
      // Push equally
      const half = overlap * 0.5;
      tA.x += nx * half;
      tA.z += nz * half;
      tB.x -= nx * half;
      tB.z -= nz * half;
    } else if (!cA.isStatic) {
      tA.x += nx * overlap;
      tA.z += nz * overlap;
    } else {
      tB.x -= nx * overlap;
      tB.z -= nz * overlap;
    }
  }

  return minDist - Math.sqrt(distSq);
}

/**
 * Circle–box narrow phase (XZ plane).
 * Finds closest point on box to circle center; pushes circle out if overlapping.
 * Returns the overlap distance, or null if not overlapping.
 */
function resolveCircleBox(
  _circleEntity: Entity,
  tCircle: Transform,
  cCircle: Collider,
  tBox: Transform,
  cBox: Collider,
  isTrigger: boolean,
): number | null {
  // Closest point on box (AABB) to circle center
  const closestX = Math.max(tBox.x - cBox.size, Math.min(tCircle.x, tBox.x + cBox.size));
  const closestZ = Math.max(tBox.z - cBox.size, Math.min(tCircle.z, tBox.z + cBox.size));

  const dx = tCircle.x - closestX;
  const dz = tCircle.z - closestZ;
  const distSq = dx * dx + dz * dz;
  const radius = cCircle.size;

  if (distSq >= radius * radius) return null;

  if (!isTrigger && !cCircle.isStatic) {
    const dist = Math.sqrt(distSq);
    const overlap = radius - dist + runtimeConfig.skinWidth;

    if (dist < 0.0001) {
      // Circle center is inside box — push along X axis as a safe default
      tCircle.x += overlap;
    } else {
      const nx = dx / dist;
      const nz = dz / dist;
      tCircle.x += nx * overlap;
      tCircle.z += nz * overlap;
    }
  }

  return radius - Math.sqrt(distSq);
}
