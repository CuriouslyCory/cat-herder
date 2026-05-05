/**
 * Integration tests for US-205: Load & restore flow
 *
 * These tests verify the restore-side logic using real CatCompanionManager,
 * GameState, World, and EventBus — no Three.js or canvas required.
 *
 * The logic under test corresponds to the private helpers _restoreActiveCats()
 * and _applyResourceNodeCooldowns() in Game.ts, exercised here by replicating
 * the same operations through the public APIs they use.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { GameState } from "~/game/engine/GameState";
import { PhysicsEngine } from "~/game/engine/PhysicsEngine";
import { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import { CAT_REGISTRY } from "~/game/cats/definitions";
import { createMockMapManager } from "../helpers/mockMapManager";
import { spawnPlayer } from "../helpers/entityFactories";
import { createResourceNode } from "~/game/ecs/components/ResourceNode";
import { createTransform } from "~/game/ecs/components/Transform";
import type { ResourceNode } from "~/game/ecs/components/ResourceNode";
import { CatType, ResourceType, TerrainType } from "~/game/types";
import type { Vec3 } from "~/game/types";

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let world: World;
let eventBus: EventBus;
let gameState: GameState;
let physics: PhysicsEngine;
let catManager: CatCompanionManager;
let playerEntity: ReturnType<typeof spawnPlayer>;
const mockMap = createMockMapManager();

beforeEach(() => {
  world = new World();
  eventBus = new EventBus();
  gameState = new GameState(10);
  physics = new PhysicsEngine(eventBus);
  playerEntity = spawnPlayer(world);

  catManager = new CatCompanionManager(
    world,
    eventBus,
    mockMap as never,
    gameState,
    () => playerEntity,
    physics,
  );
});

// ---------------------------------------------------------------------------
// _restoreActiveCats logic
// (replicated directly — pre-add yarn, call summon, undo on failure)
// ---------------------------------------------------------------------------

function restoreActiveCats(
  activeCats: Array<{ catType: CatType; position: Vec3 }>,
): void {
  for (const { catType, position } of activeCats) {
    const def = CAT_REGISTRY.get(catType);
    if (!def) continue;
    if (!catManager.isValidPosition(position)) continue;
    gameState.addYarn(def.yarnCost);
    const entity = catManager.summon(catType, position);
    if (!entity) {
      gameState.deductYarn(def.yarnCost);
    }
  }
}

// ---------------------------------------------------------------------------
// Cat restore: yarn invariant
// ---------------------------------------------------------------------------

describe("restoreActiveCats — yarn invariant", () => {
  it("yarn is unchanged after restoring a valid cat", () => {
    const initialYarn = gameState.yarn; // 10
    // Loaf costs 3 yarn per CAT_REGISTRY; we start with 10 so restore must net 0
    restoreActiveCats([{ catType: CatType.Loaf, position: { x: 0, y: 0, z: 0 } }]);
    expect(gameState.yarn).toBe(initialYarn);
  });

  it("yarn is unchanged after restoring multiple valid cats", () => {
    const initialYarn = 50;
    gameState.set("player.yarn", initialYarn);

    restoreActiveCats([
      { catType: CatType.Loaf, position: { x: 0, y: 0, z: 0 } },
      { catType: CatType.Loaf, position: { x: 5, y: 0, z: 5 } },
    ]);

    expect(gameState.yarn).toBe(initialYarn);
  });

  it("yarn is unchanged when cat position is invalid (water terrain)", () => {
    mockMap.setTerrain(10, 10, TerrainType.Water);
    const initialYarn = gameState.yarn;

    restoreActiveCats([{ catType: CatType.Loaf, position: { x: 10, y: 0, z: 10 } }]);

    expect(gameState.yarn).toBe(initialYarn);
  });
});

// ---------------------------------------------------------------------------
// Cat restore: entity creation
// ---------------------------------------------------------------------------

describe("restoreActiveCats — entity creation", () => {
  it("creates a cat entity for each valid saved position", () => {
    const before = catManager.getActiveCompanions().length;
    restoreActiveCats([{ catType: CatType.Loaf, position: { x: 0, y: 0, z: 0 } }]);
    expect(catManager.getActiveCompanions().length).toBe(before + 1);
  });

  it("skips cats at invalid positions silently", () => {
    mockMap.setTerrain(99, 99, TerrainType.Water);
    const before = catManager.getActiveCompanions().length;

    restoreActiveCats([
      { catType: CatType.Loaf, position: { x: 99, y: 0, z: 99 } }, // invalid
      { catType: CatType.Loaf, position: { x: 0, y: 0, z: 0 } },   // valid
    ]);

    expect(catManager.getActiveCompanions().length).toBe(before + 1);
  });

  it("skips unknown cat types silently", () => {
    const before = catManager.getActiveCompanions().length;
    // Pass an unknown catType value
    restoreActiveCats([{ catType: "UnknownCat" as CatType, position: { x: 0, y: 0, z: 0 } }]);
    expect(catManager.getActiveCompanions().length).toBe(before);
  });

  it("respects the active cat cap (auto-dismisses oldest)", () => {
    // Fill to cap with extra yarn
    gameState.set("player.yarn", 100);
    for (let i = 0; i < 3; i++) {
      catManager.summon(CatType.Loaf, { x: i * 2, y: 0, z: 0 });
    }
    gameState.set("player.yarn", 0); // drain yarn so no cap-related side effects

    const atCap = catManager.getActiveCompanions().length;
    expect(atCap).toBe(3);

    // Restore one more — should auto-dismiss oldest (no crash, still 3 total)
    restoreActiveCats([{ catType: CatType.Loaf, position: { x: 20, y: 0, z: 0 } }]);
    expect(catManager.getActiveCompanions().length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// _applyResourceNodeCooldowns logic
// ---------------------------------------------------------------------------

/** Build a minimal nodeId → entity map and apply cooldowns (mirrors _applyResourceNodeCooldowns). */
function applyResourceNodeCooldowns(
  nodeIdMap: Map<string, number>,
  cooldowns: Array<{ nodeId: string; cooldownRemaining: number }>,
): void {
  for (const { nodeId, cooldownRemaining } of cooldowns) {
    if (cooldownRemaining <= 0) continue;
    const entity = nodeIdMap.get(nodeId);
    if (entity === undefined) continue;
    const node = world.getComponent<ResourceNode>(entity, "ResourceNode");
    if (!node) continue;
    node.cooldownRemaining = cooldownRemaining;
  }
}

describe("_applyResourceNodeCooldowns", () => {
  it("sets cooldownRemaining on matching resource node entity", () => {
    const entity = world.createEntity();
    world.addComponent(entity, createTransform(1, 0, 2));
    world.addComponent(entity, createResourceNode(ResourceType.Grass, 1.5, 1, 30));

    const nodeIdMap = new Map([["node_1_2", entity]]);
    applyResourceNodeCooldowns(nodeIdMap, [
      { nodeId: "node_1_2", cooldownRemaining: 15 },
    ]);

    const node = world.getComponent<ResourceNode>(entity, "ResourceNode")!;
    expect(node.cooldownRemaining).toBe(15);
  });

  it("ignores cooldowns with 0 remaining", () => {
    const entity = world.createEntity();
    world.addComponent(entity, createTransform(1, 0, 2));
    world.addComponent(entity, createResourceNode(ResourceType.Grass, 1.5, 1, 30));

    const nodeIdMap = new Map([["node_1_2", entity]]);
    applyResourceNodeCooldowns(nodeIdMap, [
      { nodeId: "node_1_2", cooldownRemaining: 0 },
    ]);

    const node = world.getComponent<ResourceNode>(entity, "ResourceNode")!;
    expect(node.cooldownRemaining).toBe(0); // unchanged
  });

  it("silently skips unknown nodeIds", () => {
    const nodeIdMap = new Map<string, number>();
    expect(() =>
      applyResourceNodeCooldowns(nodeIdMap, [
        { nodeId: "node_999_999", cooldownRemaining: 10 },
      ]),
    ).not.toThrow();
  });

  it("applies cooldowns to multiple nodes independently", () => {
    const e1 = world.createEntity();
    world.addComponent(e1, createTransform(1, 0, 2));
    world.addComponent(e1, createResourceNode(ResourceType.Grass, 1.5, 1, 30));

    const e2 = world.createEntity();
    world.addComponent(e2, createTransform(3, 0, 4));
    world.addComponent(e2, createResourceNode(ResourceType.Sticks, 1.5, 1, 45));

    const nodeIdMap = new Map([
      ["node_1_2", e1],
      ["node_3_4", e2],
    ]);
    applyResourceNodeCooldowns(nodeIdMap, [
      { nodeId: "node_1_2", cooldownRemaining: 20 },
      { nodeId: "node_3_4", cooldownRemaining: 35 },
    ]);

    expect(world.getComponent<ResourceNode>(e1, "ResourceNode")!.cooldownRemaining).toBe(20);
    expect(world.getComponent<ResourceNode>(e2, "ResourceNode")!.cooldownRemaining).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// Persistence.load() → Persistence.restoreFromSave() pipeline
// ---------------------------------------------------------------------------

import { Persistence } from "~/game/state/Persistence";
import { CURRENT_VERSION } from "~/game/state/SaveData";
import type { SaveData as ExternalSaveData } from "~/game/state/SaveData";
import type { GameTrpcAdapter } from "~/game/engine/Game";

describe("Persistence.load() → restoreFromSave() pipeline", () => {
  function validSaveData(overrides?: Partial<ExternalSaveData["character"]>): ExternalSaveData {
    return {
      character: {
        appearance: {},
        stats: { level: 2, health: 8, maxHealth: 10 },
        inventory: [],
        position: { x: 5, y: 1, z: 3 },
        yarn: 42,
        oxygen: 100,
        abilities: [],
        ...overrides,
      },
      world: {
        currentMapId: "test",
        activeCats: [],
        resourceNodeCooldowns: [],
        hiddenTerrain: [],
      },
      session: { totalPlaytimeMs: 0 },
    };
  }

  it("restores yarn from saved character data", async () => {
    const adapter: GameTrpcAdapter = {
      upsertSave: vi.fn().mockResolvedValue(undefined),
      getSave: vi.fn().mockResolvedValue({
        version: CURRENT_VERSION,
        saveData: validSaveData({ yarn: 42 }),
      }),
    };
    const gs = new GameState(10);
    const eb = new EventBus();
    const p = new Persistence(gs, adapter, eb);

    const saveData = await p.load();
    expect(saveData).not.toBeNull();
    p.restoreFromSave(saveData!);

    expect(gs.yarn).toBe(42);
    p.dispose();
  });

  it("restores player position from saved character data", async () => {
    const adapter: GameTrpcAdapter = {
      upsertSave: vi.fn().mockResolvedValue(undefined),
      getSave: vi.fn().mockResolvedValue({
        version: CURRENT_VERSION,
        saveData: validSaveData(),
      }),
    };
    const gs = new GameState(10);
    const eb = new EventBus();
    const p = new Persistence(gs, adapter, eb);

    const saveData = await p.load();
    p.restoreFromSave(saveData!);

    const pos = gs.get<{ x: number; y: number; z: number }>("player.position");
    expect(pos).toEqual({ x: 5, y: 1, z: 3 });
    p.dispose();
  });

  it("returns null when no save exists (fresh-start path)", async () => {
    const adapter: GameTrpcAdapter = {
      upsertSave: vi.fn().mockResolvedValue(undefined),
      getSave: vi.fn().mockResolvedValue(null),
    };
    const gs = new GameState(10);
    const eb = new EventBus();
    const p = new Persistence(gs, adapter, eb);

    const saveData = await p.load();
    expect(saveData).toBeNull();
    p.dispose();
  });

  it("propagates load errors (caller must handle / offer retry)", async () => {
    const adapter: GameTrpcAdapter = {
      upsertSave: vi.fn().mockResolvedValue(undefined),
      getSave: vi.fn().mockRejectedValue(new Error("Network error")),
    };
    const gs = new GameState(10);
    const eb = new EventBus();
    const p = new Persistence(gs, adapter, eb);

    await expect(p.load()).rejects.toThrow("Network error");
    p.dispose();
  });
});
