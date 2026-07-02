import { describe, it, expect } from "vitest";
import { mapDataSchema } from "~/game/maps/MapDataSchema";
import { TerrainType, ResourceType } from "~/game/types";

// ---------------------------------------------------------------------------
// MapDataSchema — validation tests for the canonical terrain[][] format.
// Tests the non-empty/rectangular checks and required field enforcement.
// ---------------------------------------------------------------------------

// Helper to build a 1x1 valid map
function makeValidMap() {
  return {
    name: "valid",
    size: { width: 2, depth: 2 },
    terrain: [
      [
        { type: TerrainType.Grass, height: 0, navigable: true },
        { type: TerrainType.Grass, height: 0, navigable: true },
      ],
      [
        { type: TerrainType.Grass, height: 0, navigable: true },
        { type: TerrainType.Grass, height: 0, navigable: true },
      ],
    ],
    cellSize: 1,
    spawnPoints: [],
    resourceNodes: [],
    yarnPickups: [],
  };
}

describe("MapDataSchema terrain validation", () => {
  it("rejects terrain with zero rows", () => {
    const data = { ...makeValidMap(), terrain: [] };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("at least one row"))).toBe(true);
    }
  });

  it("rejects terrain with zero columns in first row", () => {
    const data = { ...makeValidMap(), terrain: [[]] };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("at least one column"))).toBe(true);
    }
  });

  it("rejects non-rectangular terrain (mismatched row lengths)", () => {
    const row = { type: TerrainType.Grass, height: 0, navigable: true };
    const data = {
      ...makeValidMap(),
      size: { width: 2, depth: 2 },
      cellSize: 1,
      terrain: [
        [row, row],   // 2 cols
        [row],        // 1 col — mismatch
      ],
    };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("not rectangular"))).toBe(true);
    }
  });

  it("rejects terrain dimension mismatch: row count vs size.depth/cellSize", () => {
    const row = [{ type: TerrainType.Grass, height: 0, navigable: true }];
    const data = {
      ...makeValidMap(),
      size: { width: 1, depth: 3 }, // expects 3 rows
      cellSize: 1,
      terrain: [row], // only 1 row
    };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("rows") && m.includes("size.depth"))).toBe(true);
    }
  });

  it("rejects terrain dimension mismatch: col count vs size.width/cellSize", () => {
    const cell = { type: TerrainType.Grass, height: 0, navigable: true };
    const data = {
      ...makeValidMap(),
      size: { width: 3, depth: 1 }, // expects 3 cols
      cellSize: 1,
      terrain: [[cell]], // only 1 col
    };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("cols") && m.includes("size.width"))).toBe(true);
    }
  });

  it("accepts valid map with matching dimensions", () => {
    const result = mapDataSchema.safeParse(makeValidMap());
    expect(result.success).toBe(true);
  });

  it("accepts a cell with optional depth field set", () => {
    const data = {
      ...makeValidMap(),
      terrain: [
        [
          { type: TerrainType.Water, height: 0, navigable: false, depth: 2.5 },
          { type: TerrainType.Grass, height: 0, navigable: true },
        ],
        [
          { type: TerrainType.Grass, height: 0, navigable: true },
          { type: TerrainType.Grass, height: 0, navigable: true },
        ],
      ],
    };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe("MapDataSchema required fields", () => {
  it("rejects missing resourceNodes", () => {
    const { resourceNodes: _, ...data } = makeValidMap();
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects missing yarnPickups", () => {
    const { yarnPickups: _, ...data } = makeValidMap();
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("accepts empty arrays for resourceNodes and yarnPickups", () => {
    const result = mapDataSchema.safeParse(makeValidMap());
    expect(result.success).toBe(true);
  });

  it("accepts populated resourceNodes with valid data", () => {
    const data = {
      ...makeValidMap(),
      resourceNodes: [{ x: 0, z: 0, type: ResourceType.Grass, respawnTime: 30 }],
    };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects invalid ResourceType in resourceNodes", () => {
    const data = {
      ...makeValidMap(),
      resourceNodes: [{ x: 0, z: 0, type: "NotAType", respawnTime: 30 }],
    };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("accepts populated yarnPickups with valid data", () => {
    const data = {
      ...makeValidMap(),
      yarnPickups: [{ x: 1, z: 2, yarnAmount: 5 }],
    };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects missing required top-level fields", () => {
    const result = mapDataSchema.safeParse({ name: "incomplete" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid TerrainType", () => {
    const data = makeValidMap();
    // biome-ignore lint/suspicious/noExplicitAny: test intentional bad type
    (data.terrain[0]![0] as any).type = "InvalidType";
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects invalid spawnPoint role", () => {
    const data = { ...makeValidMap(), spawnPoints: [{ x: 0, z: 0, role: "badRole" }] };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Positive-dimension constraints (migrated from MapEditor.test.ts "Finding 5
// regression" — schema-only assertions, no editor/DOM involved; #29).
// ---------------------------------------------------------------------------

describe("MapDataSchema positive dimension constraints", () => {
  it("rejects width of 0", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: 0, depth: 10 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative width", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: -5, depth: 10 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects depth of 0", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: 10, depth: 0 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative depth", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: 10, depth: -3 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects cellSize of 0", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: 10, depth: 10 },
      terrain: [],
      cellSize: 0,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative cellSize", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: 10, depth: 10 },
      terrain: [],
      cellSize: -1,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid map with correct terrain dimensions", () => {
    const result = mapDataSchema.safeParse({
      name: "good",
      size: { width: 4, depth: 2 },
      terrain: [
        [{ type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }],
        [{ type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }],
      ],
      cellSize: 1,
      spawnPoints: [],
      resourceNodes: [],
      yarnPickups: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid resourceNodes and yarnPickups arrays", () => {
    const result = mapDataSchema.safeParse({
      name: "with-entities",
      size: { width: 1, depth: 1 },
      terrain: [[{ type: TerrainType.Grass, height: 0, navigable: true }]],
      cellSize: 1,
      spawnPoints: [],
      resourceNodes: [{ x: 5, z: 5, type: ResourceType.Grass, respawnTime: 30 }],
      yarnPickups: [{ x: 7, z: 7, yarnAmount: 5 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid ResourceType in resourceNodes array", () => {
    const result = mapDataSchema.safeParse({
      name: "bad-resource",
      size: { width: 1, depth: 1 },
      terrain: [[{ type: TerrainType.Grass, height: 0, navigable: true }]],
      cellSize: 1,
      spawnPoints: [],
      resourceNodes: [{ x: 1, z: 2, type: "BadResource", respawnTime: 30 }],
      yarnPickups: [],
    });
    expect(result.success).toBe(false);
  });
});
