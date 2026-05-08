import { describe, it, expect } from "vitest";
import { ZodError } from "zod";

import { saveDataSchema, CURRENT_VERSION } from "~/game/state/SaveData";
import {
  migrateIfNeeded,
  migration_0_1_to_0_2,
  SaveMigrationError,
} from "~/game/state/migrations";
import { CatType, ResourceType } from "~/game/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validSaveData() {
  return {
    character: {
      appearance: {},
      stats: { level: 1, health: 10, maxHealth: 10 },
      inventory: [],
      position: { x: 0, y: 0, z: 0 },
      yarn: 10,
      oxygen: 100,
      abilities: [],
    },
    world: {
      currentMapId: "default",
      activeCats: [],
      resourceNodeCooldowns: [],
      hiddenTerrain: [],
    },
    session: { totalPlaytimeMs: 0 },
  };
}

// ---------------------------------------------------------------------------
// saveDataSchema
// ---------------------------------------------------------------------------

describe("saveDataSchema", () => {
  it("accepts valid save data", () => {
    expect(() => saveDataSchema.parse(validSaveData())).not.toThrow();
  });

  it("returns typed SaveData on success", () => {
    const result = saveDataSchema.parse(validSaveData());
    expect(result.character.yarn).toBe(10);
    expect(result.world.currentMapId).toBe("default");
    expect(result.session.totalPlaytimeMs).toBe(0);
  });

  it("rejects missing character field", () => {
    const bad = { ...validSaveData(), character: undefined };
    expect(() => saveDataSchema.parse(bad)).toThrow(ZodError);
  });

  it("rejects negative yarn", () => {
    const bad = validSaveData();
    bad.character.yarn = -1;
    expect(() => saveDataSchema.parse(bad)).toThrow(ZodError);
  });

  it("rejects level above 10", () => {
    const bad = validSaveData();
    bad.character.stats.level = 11;
    expect(() => saveDataSchema.parse(bad)).toThrow(ZodError);
  });

  it("rejects negative totalPlaytimeMs", () => {
    const bad = validSaveData();
    bad.session.totalPlaytimeMs = -1;
    expect(() => saveDataSchema.parse(bad)).toThrow(ZodError);
  });

  it("rejects invalid resourceType enum", () => {
    const bad: unknown = {
      ...validSaveData(),
      character: {
        ...validSaveData().character,
        inventory: [{ resourceType: "Gold", quantity: 1 }],
      },
    };
    expect(() => saveDataSchema.parse(bad)).toThrow(ZodError);
  });

  it("accepts valid activeCats", () => {
    const data: unknown = {
      ...validSaveData(),
      world: {
        ...validSaveData().world,
        activeCats: [{ catType: CatType.Loaf, position: { x: 1, y: 0, z: 2 } }],
      },
    };
    const result = saveDataSchema.parse(data);
    expect(result.world.activeCats).toHaveLength(1);
  });

  it("rejects invalid catType enum", () => {
    const bad: unknown = {
      ...validSaveData(),
      world: {
        ...validSaveData().world,
        activeCats: [{ catType: "Dragon", position: { x: 0, y: 0, z: 0 } }],
      },
    };
    expect(() => saveDataSchema.parse(bad)).toThrow(ZodError);
  });

  it("rejects non-integer inventory quantity", () => {
    const bad: unknown = {
      ...validSaveData(),
      character: {
        ...validSaveData().character,
        inventory: [{ resourceType: ResourceType.Grass, quantity: 1.5 }],
      },
    };
    expect(() => saveDataSchema.parse(bad)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// CURRENT_VERSION
// ---------------------------------------------------------------------------

describe("CURRENT_VERSION", () => {
  it("is '0.1'", () => {
    expect(CURRENT_VERSION).toBe("0.1");
  });
});

// ---------------------------------------------------------------------------
// migrateIfNeeded
// ---------------------------------------------------------------------------

describe("migrateIfNeeded", () => {
  it("no-ops on current version (wrapped format)", () => {
    const input = { version: CURRENT_VERSION, saveData: validSaveData() };
    const result = migrateIfNeeded(input);
    expect(result.character.yarn).toBe(10);
  });

  it("no-ops on current version (flat format)", () => {
    const input = { version: CURRENT_VERSION, ...validSaveData() };
    const result = migrateIfNeeded(input);
    expect(result.session.totalPlaytimeMs).toBe(0);
  });

  it("throws SaveMigrationError for unknown version", () => {
    const input = { version: "9.9", saveData: validSaveData() };
    expect(() => migrateIfNeeded(input)).toThrow(SaveMigrationError);
  });

  it("error message mentions the unknown version", () => {
    const input = { version: "5.0", saveData: validSaveData() };
    expect(() => migrateIfNeeded(input)).toThrow(/5\.0/);
  });

  it("throws SaveMigrationError when version field is missing", () => {
    expect(() => migrateIfNeeded({ saveData: validSaveData() })).toThrow(
      SaveMigrationError,
    );
  });

  it("throws SaveMigrationError for non-object input", () => {
    expect(() => migrateIfNeeded("not an object")).toThrow(SaveMigrationError);
  });

  it("throws SaveMigrationError for null input", () => {
    expect(() => migrateIfNeeded(null)).toThrow(SaveMigrationError);
  });

  it("throws ZodError when content is malformed", () => {
    const input = {
      version: CURRENT_VERSION,
      saveData: { character: null, world: null, session: null },
    };
    expect(() => migrateIfNeeded(input)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// Stub migration 0.1 -> 0.2
// ---------------------------------------------------------------------------

describe("migration_0_1_to_0_2", () => {
  it("is a no-op transform (data passes through unchanged)", () => {
    const content = validSaveData() as Record<string, unknown>;
    const result = migration_0_1_to_0_2(content);
    expect(result).toEqual(content);
  });

  it("returns a shallow copy (does not mutate input)", () => {
    const content = validSaveData() as Record<string, unknown>;
    const result = migration_0_1_to_0_2(content);
    expect(result).not.toBe(content);
  });
});
