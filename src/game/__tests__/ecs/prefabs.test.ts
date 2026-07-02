import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CAT_REGISTRY } from "~/game/cats/definitions";
import { RESOURCE_CONFIGS } from "~/game/config";
import { ResourceType, CatType } from "~/game/types";
import type { Velocity } from "~/game/ecs/components/Velocity";
import type { Transform } from "~/game/ecs/components/Transform";
import type { PlayerControlled } from "~/game/ecs/components/PlayerControlled";
import type { Renderable } from "~/game/ecs/components/Renderable";
import type { Collider } from "~/game/ecs/components/Collider";
import type { ResourceNode } from "~/game/ecs/components/ResourceNode";
import type { YarnPickup } from "~/game/ecs/components/YarnPickup";
import type { CatBehavior } from "~/game/ecs/components/CatBehavior";
import {
  spawnPlayerEntity,
  spawnResourceNodeEntity,
  spawnYarnPickupEntity,
  assembleCatEntity,
  resourceNodeId,
} from "~/game/ecs/prefabs";

// ---------------------------------------------------------------------------
// prefabs.test.ts — headless unit tests for the single-source-of-truth entity
// spawn recipes (AC7: no DOM, no Three.js runtime required).
// ---------------------------------------------------------------------------

describe("prefabs", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  describe("spawnPlayerEntity", () => {
    it("adds Transform/Velocity/PlayerControlled/Renderable/Collider", () => {
      const entity = spawnPlayerEntity(world, { position: { x: 1, y: 2, z: 3 } });

      const transform = world.getComponent<Transform>(entity, "Transform");
      const velocity = world.getComponent<Velocity>(entity, "Velocity");
      const player = world.getComponent<PlayerControlled>(entity, "PlayerControlled");
      const renderable = world.getComponent<Renderable>(entity, "Renderable");
      const collider = world.getComponent<Collider>(entity, "Collider");

      expect(transform).toEqual(
        expect.objectContaining({ x: 1, y: 2, z: 3 }),
      );
      expect(player).not.toBeNull();
      expect(renderable).not.toBeNull();
      expect(collider).not.toBeNull();

      // Velocity MUST be the real {dx,dy,dz} shape (drift catcher — see
      // MovementSystem.test.ts for the behavioral counterpart of this check).
      expect(velocity).toEqual({ type: "Velocity", dx: 0, dy: 0, dz: 0 });
      expect(velocity?.dx).toBeDefined();
      expect((velocity as unknown as Record<string, unknown>).x).toBeUndefined();
    });

    it("registers a physics body when a PhysicsEngine is supplied", () => {
      const eventBus = new EventBus();
      const physics = new PhysicsEngine(eventBus);

      const entity = spawnPlayerEntity(world, {
        position: { x: 5, y: 1, z: -2 },
        physics,
      });

      const handle = physics.getHandleByEntity(entity);
      expect(handle).not.toBeNull();
      expect(physics.getPosition(handle!)).toEqual({ x: 5, y: 1, z: -2 });
    });

    it("does not register a physics body when none is supplied", () => {
      const entity = spawnPlayerEntity(world, { position: { x: 0, y: 0, z: 0 } });
      expect(world.getComponent<Collider>(entity, "Collider")).not.toBeNull();
      // No physics engine was ever created, so there is nothing to look up —
      // this test just documents that the option is optional and safe to omit.
    });
  });

  describe("resourceNodeId", () => {
    it("produces the node_${x}_${z} convention (ADR-0002 §5)", () => {
      expect(resourceNodeId(1, 2)).toBe("node_1_2");
      expect(resourceNodeId(-3, 4)).toBe("node_-3_4");
      expect(resourceNodeId(0, 0)).toBe("node_0_0");
    });
  });

  describe("spawnResourceNodeEntity", () => {
    it("returns nodeId === node_${x}_${z} and a ResourceNode from RESOURCE_CONFIGS", () => {
      const { entity, nodeId } = spawnResourceNodeEntity(world, {
        node: { x: 4, z: -1, type: ResourceType.Grass, respawnTime: 30 },
      });

      expect(nodeId).toBe("node_4_-1");

      const node = world.getComponent<ResourceNode>(entity, "ResourceNode");
      expect(node).toEqual(
        expect.objectContaining({
          resourceType: ResourceType.Grass,
          gatherTime: RESOURCE_CONFIGS.Grass.gatherTime,
          yieldAmount: RESOURCE_CONFIGS.Grass.yieldAmount,
          respawnTime: 30,
        }),
      );
    });

    it("uses the node's own respawnTime, not the RESOURCE_CONFIGS default", () => {
      const { entity } = spawnResourceNodeEntity(world, {
        node: { x: 0, z: 0, type: ResourceType.Water, respawnTime: 999 },
      });
      const node = world.getComponent<ResourceNode>(entity, "ResourceNode")!;
      expect(node.respawnTime).toBe(999);
      expect(node.gatherTime).toBe(RESOURCE_CONFIGS.Water.gatherTime);
    });
  });

  describe("spawnYarnPickupEntity", () => {
    it("adds YarnPickup with amount === pickup.yarnAmount", () => {
      const entity = spawnYarnPickupEntity(world, {
        pickup: { x: 2, z: 2, yarnAmount: 7 },
      });
      const pickup = world.getComponent<YarnPickup>(entity, "YarnPickup");
      expect(pickup).toEqual({ type: "YarnPickup", amount: 7 });
    });
  });

  describe("assembleCatEntity", () => {
    it("adds Transform/Renderable(def.meshConfig)/Collider/CatBehavior", () => {
      const def = CAT_REGISTRY.get(CatType.Loaf)!;
      const entity = assembleCatEntity(world, {
        definition: def,
        position: { x: 3, y: 0, z: 3 },
        centerY: 1.5,
        owner: 1,
        halfHeight: 0.375,
        xzHalfExtent: 0.6,
      });

      const transform = world.getComponent<Transform>(entity, "Transform");
      const renderable = world.getComponent<Renderable>(entity, "Renderable");
      const collider = world.getComponent<Collider>(entity, "Collider");
      const behavior = world.getComponent<CatBehavior>(entity, "CatBehavior");

      expect(transform).toEqual(
        expect.objectContaining({ x: 3, y: 1.5, z: 3 }),
      );
      expect(renderable?.meshConfig).toBe(def.meshConfig);
      expect(collider).toEqual(
        expect.objectContaining({
          shape: "box",
          size: 0.6,
          halfHeight: 0.375,
          isStatic: true,
        }),
      );
      expect(behavior).toEqual(
        expect.objectContaining({
          catType: CatType.Loaf,
          ownerId: 1,
          yarnCost: def.yarnCost,
        }),
      );
    });
  });
});
