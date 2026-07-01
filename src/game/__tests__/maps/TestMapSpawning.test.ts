import { describe, it, expect } from "vitest";
import { TestMap } from "~/game/maps/TestMap";
import { ResourceType } from "~/game/types";

// ---------------------------------------------------------------------------
// Regression test: TestMap resource node and yarn pickup spawn list.
//
// The golden cooldown id list is derived from the ORIGINAL Game.ts
// spawnTestMapResourceNodes() formula: x = -29 + col*2, z = -29 + row*2.
// These ids must remain byte-identical to preserve existing save-game data.
// ---------------------------------------------------------------------------

const GOLDEN_NODE_IDS = [
  "node_1_-19",
  "node_7_-13",
  "node_-19_-5",
  "node_-5_1",
  "node_1_7",
  "node_11_11",
  "node_1_15",
  "node_-9_21",
  "node_19_-9",
  "node_13_-13",
  "node_17_-9",
  "node_11_-5",
  "node_7_-11",
  "node_-19_-7",
  "node_-11_-9",
];

describe("TestMap resource/yarn spawn regression", () => {
  it("resourceNodes has 15 entries with correct types", () => {
    expect(TestMap.resourceNodes).toHaveLength(15);
  });

  it("has 9 Grass nodes, 4 Sticks nodes, 2 Water nodes", () => {
    const counts: Record<string, number> = {};
    for (const node of TestMap.resourceNodes) {
      counts[node.type] = (counts[node.type] ?? 0) + 1;
    }
    expect(counts[ResourceType.Grass]).toBe(9);
    expect(counts[ResourceType.Sticks]).toBe(4);
    expect(counts[ResourceType.Water]).toBe(2);
  });

  it("every node produces a unique node_<x>_<z> id matching the pre-change hardcoded list", () => {
    const actual = TestMap.resourceNodes.map((n) => `node_${n.x}_${n.z}`);
    expect(actual.sort()).toEqual([...GOLDEN_NODE_IDS].sort());
  });

  it("each cooldown id is unique (no duplicate positions)", () => {
    const ids = TestMap.resourceNodes.map((n) => `node_${n.x}_${n.z}`);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("Grass nodes have respawnTime 30", () => {
    const grassNodes = TestMap.resourceNodes.filter((n) => n.type === ResourceType.Grass);
    for (const node of grassNodes) {
      expect(node.respawnTime).toBe(30);
    }
  });

  it("Sticks nodes have respawnTime 45", () => {
    const sticksNodes = TestMap.resourceNodes.filter((n) => n.type === ResourceType.Sticks);
    for (const node of sticksNodes) {
      expect(node.respawnTime).toBe(45);
    }
  });

  it("Water nodes have respawnTime 60", () => {
    const waterNodes = TestMap.resourceNodes.filter((n) => n.type === ResourceType.Water);
    for (const node of waterNodes) {
      expect(node.respawnTime).toBe(60);
    }
  });

  it("yarnPickups has 3 entries each with yarnAmount=3", () => {
    expect(TestMap.yarnPickups).toHaveLength(3);
    for (const pickup of TestMap.yarnPickups) {
      expect(pickup.yarnAmount).toBe(3);
    }
  });

  it("yarn pickup positions match pre-change hardcoded list", () => {
    const positions = TestMap.yarnPickups.map((p) => ({ x: p.x, z: p.z }));
    expect(positions).toEqual(
      expect.arrayContaining([
        { x: -1, z: -1 },
        { x: 15, z: -1 },
        { x: -15, z: 7 },
      ]),
    );
    expect(positions).toHaveLength(3);
  });
});
