import type { System } from "../ecs/System";
import type { World } from "../ecs/World";
import type { EventBus } from "../engine/EventBus";
import type { Transform } from "../ecs/components/Transform";
import type { Collider } from "../ecs/components/Collider";
import { TRANSFORM } from "../ecs/components/Transform";
import { COLLIDER } from "../ecs/components/Collider";
import { runtimeConfig } from "../config";
import type { Entity } from "../ecs/Entity";

interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function getAABB(transform: Transform, collider: Collider): AABB {
  const { x, y, z } = transform.position;
  const hx = collider.size.x / 2;
  const hy = collider.size.y / 2;
  const hz = collider.size.z / 2;
  return {
    minX: x - hx,
    maxX: x + hx,
    minY: y - hy,
    maxY: y + hy,
    minZ: z - hz,
    maxZ: z + hz,
  };
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

/** Compute horizontal penetration depth on X and Z axes. */
function resolveCircleVsAABB(
  movingTransform: Transform,
  staticAABB: AABB,
): { dx: number; dz: number } | null {
  const skin = runtimeConfig.collisionSkinWidth;
  const radius = runtimeConfig.collisionRadius;
  const cx = movingTransform.position.x;
  const cz = movingTransform.position.z;

  // Clamp circle center to AABB to get nearest point
  const nearX = Math.max(staticAABB.minX, Math.min(cx, staticAABB.maxX));
  const nearZ = Math.max(staticAABB.minZ, Math.min(cz, staticAABB.maxZ));

  const dx = cx - nearX;
  const dz = cz - nearZ;
  const distSq = dx * dx + dz * dz;
  const totalRadius = radius + skin;

  if (distSq >= totalRadius * totalRadius) return null;

  const dist = Math.sqrt(distSq);
  const overlap = totalRadius - dist;
  if (dist === 0) return { dx: overlap, dz: 0 }; // degenerate: push along X

  return {
    dx: (dx / dist) * overlap,
    dz: (dz / dist) * overlap,
  };
}

export class CollisionSystem implements System {
  constructor(private readonly eventBus: EventBus) {}

  update(world: World, _dt: number): void {
    const entities = world.query(TRANSFORM, COLLIDER);

    // Build spatial snapshot for this frame
    const snapshot: Array<{ entity: Entity; transform: Transform; collider: Collider; aabb: AABB }> =
      [];

    for (const entity of entities) {
      const transform = world.getComponent<Transform>(entity, TRANSFORM);
      const collider = world.getComponent<Collider>(entity, COLLIDER);
      if (!transform || !collider) continue;
      snapshot.push({ entity, transform, collider, aabb: getAABB(transform, collider) });
    }

    // Broad phase + narrow phase
    for (let i = 0; i < snapshot.length; i++) {
      const a = snapshot[i];
      for (let j = i + 1; j < snapshot.length; j++) {
        const b = snapshot[j];

        // Layer/mask filtering
        if (!(a.collider.collisionLayer & b.collider.collisionMask)) continue;
        if (!(b.collider.collisionLayer & a.collider.collisionMask)) continue;

        // Broad phase
        if (!aabbOverlap(a.aabb, b.aabb)) continue;

        // Trigger detection
        if (a.collider.isTrigger || b.collider.isTrigger) {
          this.eventBus.emit({
            type: "TriggerEntered",
            triggerId: `${String(a.entity)}-${String(b.entity)}`,
            entityId: a.entity,
          });
          continue;
        }

        // Narrow phase — push non-static entity away from static
        const moving = !a.collider.isStatic ? a : !b.collider.isStatic ? b : null;
        const staticEntry = moving === a ? b : a;
        if (!moving || staticEntry.collider.isStatic === false) continue;

        const push = resolveCircleVsAABB(moving.transform, staticEntry.aabb);
        if (push) {
          moving.transform.position.x += push.dx;
          moving.transform.position.z += push.dz;
          // Update AABB after push
          const updated = getAABB(moving.transform, moving.collider);
          moving.aabb = updated;

          this.eventBus.emit({
            type: "CollisionOccurred",
            entityA: a.entity,
            entityB: b.entity,
          });
        }
      }
    }
  }
}
