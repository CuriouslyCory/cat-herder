import { describe, it, expect } from "vitest";

import {
  encode,
  decode,
  buildSaveDataSchema,
  NON_POSITION_DIRTY_PATHS,
  POSITION_DIRTY_PATH,
} from "~/game/state/SaveCodec";
import type { SaveData as InternalSaveData } from "~/game/engine/GameState";
import type { SaveData as ExternalSaveData } from "~/game/state/SaveData";
import { CatType, ResourceType } from "~/game/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fullInternalSaveData(): InternalSaveData {
  return {
    player: {
      appearance: { hue: 120, pattern: "tabby" },
      position: { x: 12.5, y: 0, z: -7.25 },
      stats: { level: 4, health: 6, maxHealth: 10 },
      yarn: 37,
      oxygen: 82,
      abilities: ["dash", "double-jump"],
      inventory: [
        { resourceType: ResourceType.Grass, quantity: 3 },
        { resourceType: ResourceType.Sticks, quantity: 1 },
      ],
    },
    world: {
      currentMapId: "burrow-1",
      activeCats: [
        { catType: CatType.Loaf, position: { x: 1, y: 0, z: 2 } },
        { catType: CatType.Zoomies, position: { x: -3, y: 0, z: 4 } },
      ],
      hiddenTerrain: [1, 2, 3],
      resourceNodes: [
        { nodeId: "node_1_2", cooldownRemaining: 15 },
        { nodeId: "node_3_4", cooldownRemaining: 0 },
      ],
    },
  };
}

function validExternalSaveData(): ExternalSaveData {
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

// The hand-authored external literal in today's key order, for a state built
// from fullInternalSaveData(). This locks byte-compat: same keys, nesting,
// AND insertion order as the pre-#28 hand-written toExternalSaveData().
function expectedExternalLiteral(): ExternalSaveData {
  return {
    character: {
      appearance: { hue: 120, pattern: "tabby" },
      stats: { level: 4, health: 6, maxHealth: 10 },
      inventory: [
        { resourceType: ResourceType.Grass, quantity: 3 },
        { resourceType: ResourceType.Sticks, quantity: 1 },
      ],
      position: { x: 12.5, y: 0, z: -7.25 },
      yarn: 37,
      oxygen: 82,
      abilities: ["dash", "double-jump"],
    },
    world: {
      currentMapId: "burrow-1",
      activeCats: [
        { catType: CatType.Loaf, position: { x: 1, y: 0, z: 2 } },
        { catType: CatType.Zoomies, position: { x: -3, y: 0, z: 4 } },
      ],
      resourceNodeCooldowns: [
        { nodeId: "node_1_2", cooldownRemaining: 15 },
        { nodeId: "node_3_4", cooldownRemaining: 0 },
      ],
      hiddenTerrain: [1, 2, 3],
    },
    session: { totalPlaytimeMs: 0 },
  };
}

// The 12 dirty paths NON_POSITION_DIRTY_PATHS must reproduce exactly
// (mirrors the pre-#28 hand-written NON_POSITION_PATHS list).
const EXPECTED_NON_POSITION_PATHS = [
  "player.appearance",
  "player.stats.health",
  "player.stats.level",
  "player.stats.maxHealth",
  "player.inventory",
  "player.yarn",
  "player.oxygen",
  "player.abilities",
  "world.currentMapId",
  "world.activeCats",
  "world.resourceNodes",
  "world.hiddenTerrain",
];

// ---------------------------------------------------------------------------
// 1. Round-trip decode(encode(state))
// ---------------------------------------------------------------------------

describe("round-trip: decode(encode(internal))", () => {
  it("deep-equals the original internal state", () => {
    const state = fullInternalSaveData();
    expect(decode(encode(state))).toEqual(state);
  });
});

// ---------------------------------------------------------------------------
// 2. Reverse round-trip encode(decode(external))
// ---------------------------------------------------------------------------

describe("reverse round-trip: encode(decode(external))", () => {
  it("deep-equals the original external object", () => {
    const external = validExternalSaveData();
    expect(encode(decode(external))).toEqual(external);
  });

  it("preserves the resourceNodes <-> resourceNodeCooldowns rename", () => {
    const external = validExternalSaveData();
    external.world.resourceNodeCooldowns = [
      { nodeId: "node_5_6", cooldownRemaining: 3 },
    ];
    const roundTripped = encode(decode(external));
    expect(roundTripped.world.resourceNodeCooldowns).toEqual([
      { nodeId: "node_5_6", cooldownRemaining: 3 },
    ]);
  });

  it("re-injects the session.totalPlaytimeMs constant on the way back", () => {
    const external = validExternalSaveData();
    external.session.totalPlaytimeMs = 999999; // decode() drops this
    const roundTripped = encode(decode(external));
    expect(roundTripped.session.totalPlaytimeMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Byte-compatibility — key membership AND insertion order
// ---------------------------------------------------------------------------

describe("byte-compatibility", () => {
  it("JSON.stringify(encode(state)) matches the pre-#28 hand-authored literal exactly", () => {
    const state = fullInternalSaveData();
    expect(JSON.stringify(encode(state))).toBe(
      JSON.stringify(expectedExternalLiteral()),
    );
  });

  it("emits top-level keys in order [character, world, session]", () => {
    const encoded = encode(fullInternalSaveData());
    expect(Object.keys(encoded)).toEqual(["character", "world", "session"]);
  });

  it("emits character keys in the pre-#28 order", () => {
    const encoded = encode(fullInternalSaveData());
    expect(Object.keys(encoded.character)).toEqual([
      "appearance",
      "stats",
      "inventory",
      "position",
      "yarn",
      "oxygen",
      "abilities",
    ]);
  });

  it("emits world keys in the pre-#28 order", () => {
    const encoded = encode(fullInternalSaveData());
    expect(Object.keys(encoded.world)).toEqual([
      "currentMapId",
      "activeCats",
      "resourceNodeCooldowns",
      "hiddenTerrain",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4. Schema equivalence
// ---------------------------------------------------------------------------

describe("buildSaveDataSchema()", () => {
  it("accepts a valid external save-data object", () => {
    expect(() => buildSaveDataSchema().parse(validExternalSaveData())).not.toThrow();
  });

  it("accepts the fully-populated fixture round-tripped through encode()", () => {
    expect(() =>
      buildSaveDataSchema().parse(encode(fullInternalSaveData())),
    ).not.toThrow();
  });

  it("rejects a malformed object matching the current schema's bounds", () => {
    const invalid = validExternalSaveData();
    invalid.character.stats.level = 99; // bound is .int().min(0).max(10)
    expect(() => buildSaveDataSchema().parse(invalid)).toThrow();
  });

  it("rejects negative yarn", () => {
    const invalid = validExternalSaveData();
    invalid.character.yarn = -1;
    expect(() => buildSaveDataSchema().parse(invalid)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. Dirty-set equality
// ---------------------------------------------------------------------------

describe("dirty-path derivation", () => {
  it("NON_POSITION_DIRTY_PATHS set-equals the pre-#28 NON_POSITION_PATHS list", () => {
    expect(new Set(NON_POSITION_DIRTY_PATHS)).toEqual(
      new Set(EXPECTED_NON_POSITION_PATHS),
    );
  });

  it("does not contain player.position", () => {
    expect(NON_POSITION_DIRTY_PATHS).not.toContain("player.position");
  });

  it("POSITION_DIRTY_PATH is player.position", () => {
    expect(POSITION_DIRTY_PATH).toBe("player.position");
  });
});
