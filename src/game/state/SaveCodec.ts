// ---------------------------------------------------------------------------
// SaveCodec — the single owner of the save-data shape.
//
// Every saved field is declared exactly once, in SAVE_FIELDS below. Everything
// else in the save pipeline is DERIVED from that list:
//   - encode() / decode()      replace the hand-written toExternalSaveData /
//                               fromExternalSaveData converters in Persistence.ts.
//   - buildSaveDataSchema()    replaces the hand-written Zod object literal in
//                               SaveData.ts.
//   - NON_POSITION_DIRTY_PATHS replaces the hand-written NON_POSITION_PATHS
//                               list in Persistence.ts.
//
// Adding a saved field means adding ONE entry to SAVE_FIELDS. Forgetting to
// wire it up on the internal or external side is caught by the round-trip
// test in SaveCodec.test.ts; forgetting to classify its dirty behavior is
// caught by the dirty-set test.
//
// CRITICAL invariant (see docs/adr/0003-save-codec-single-owner.md): the
// external { character, world, session } shape — including JSON key
// *insertion order* — must stay byte-compatible with saves written before
// this module existed. SAVE_FIELDS is declared in the exact order the
// external shape must serialize in; encode()/decode() must preserve that
// order when building output objects.
// ---------------------------------------------------------------------------

import { z } from "zod";

import { CatType, ResourceType } from "../types";
import type { SaveData as InternalSaveData } from "../engine/GameState";
import type { SaveData as ExternalSaveData } from "./SaveData";

const vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

/** Dirty classification for a saved field. */
type DirtyClass =
  | { kind: "non-position"; paths: readonly string[] } // internal onChange paths
  | { kind: "position" } // throttled separately
  | { kind: "none" }; // e.g. session constant

interface SaveField<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Internal GameState path (dot-notation into { player, world }); null for constants. */
  readonly internalPath: string | null;
  /** External save-data path (dot-notation into { character, world, session }). Depth-2. */
  readonly externalPath: string;
  /** Zod schema for this leaf/subtree (used to build saveDataSchema). */
  readonly schema: TSchema;
  /** How this field participates in dirty tracking. */
  readonly dirty: DirtyClass;
  /** Constant value used on encode when internalPath is null (e.g. session.totalPlaytimeMs = 0). */
  readonly encodeConstant?: unknown;
}

/** The single position-throttled path, for Persistence's separate subscription. */
export const POSITION_DIRTY_PATH = "player.position";

// ---------------------------------------------------------------------------
// The declaration list. Order is load-bearing for byte-compat: encode()
// builds the external object by inserting keys in this order, section by
// section, and each section's leaves must stay contiguous in the list so the
// nested object's key order matches too.
// ---------------------------------------------------------------------------

export const SAVE_FIELDS = [
  {
    internalPath: "player.appearance",
    externalPath: "character.appearance",
    schema: z.record(z.string(), z.unknown()),
    dirty: { kind: "non-position", paths: ["player.appearance"] },
  },
  {
    internalPath: "player.stats",
    externalPath: "character.stats",
    schema: z.object({
      level: z.number().int().min(0).max(10),
      health: z.number().min(0),
      maxHealth: z.number().positive(),
    }),
    dirty: {
      kind: "non-position",
      paths: [
        "player.stats.health",
        "player.stats.level",
        "player.stats.maxHealth",
      ],
    },
  },
  {
    internalPath: "player.inventory",
    externalPath: "character.inventory",
    schema: z.array(
      z.object({
        resourceType: z.nativeEnum(ResourceType),
        quantity: z.number().int().min(0),
      }),
    ),
    dirty: { kind: "non-position", paths: ["player.inventory"] },
  },
  {
    internalPath: "player.position",
    externalPath: "character.position",
    schema: vec3Schema,
    dirty: { kind: "position" },
  },
  {
    internalPath: "player.yarn",
    externalPath: "character.yarn",
    schema: z.number().min(0),
    dirty: { kind: "non-position", paths: ["player.yarn"] },
  },
  {
    internalPath: "player.oxygen",
    externalPath: "character.oxygen",
    schema: z.number().min(0),
    dirty: { kind: "non-position", paths: ["player.oxygen"] },
  },
  {
    internalPath: "player.abilities",
    externalPath: "character.abilities",
    schema: z.array(z.string()),
    dirty: { kind: "non-position", paths: ["player.abilities"] },
  },
  {
    internalPath: "world.currentMapId",
    externalPath: "world.currentMapId",
    schema: z.string(),
    dirty: { kind: "non-position", paths: ["world.currentMapId"] },
  },
  {
    internalPath: "world.activeCats",
    externalPath: "world.activeCats",
    schema: z.array(
      z.object({ catType: z.nativeEnum(CatType), position: vec3Schema }),
    ),
    dirty: { kind: "non-position", paths: ["world.activeCats"] },
  },
  {
    internalPath: "world.resourceNodes",
    externalPath: "world.resourceNodeCooldowns",
    schema: z.array(
      z.object({
        nodeId: z.string(),
        cooldownRemaining: z.number().min(0),
      }),
    ),
    dirty: { kind: "non-position", paths: ["world.resourceNodes"] },
  },
  {
    internalPath: "world.hiddenTerrain",
    externalPath: "world.hiddenTerrain",
    schema: z.array(z.number().int()),
    dirty: { kind: "non-position", paths: ["world.hiddenTerrain"] },
  },
  {
    internalPath: null,
    externalPath: "session.totalPlaytimeMs",
    schema: z.number().min(0),
    dirty: { kind: "none" },
    encodeConstant: 0,
  },
] as const satisfies readonly SaveField[];

// ---------------------------------------------------------------------------
// Generic depth-2 get/set helpers. Mirrors the private path helpers in
// GameState.ts (_getAtPath / _setAtPath): build intermediate objects on
// demand and assign leaves in call order, so insertion order of the result
// matches iteration order of the caller.
// ---------------------------------------------------------------------------

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (typeof next !== "object" || next === null) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

// ---------------------------------------------------------------------------
// encode / decode — replace the hand-written converters.
// ---------------------------------------------------------------------------

/** Build external { character, world, session } from internal { player, world }. */
export function encode(state: InternalSaveData): ExternalSaveData {
  const result: Record<string, unknown> = {};
  for (const field of SAVE_FIELDS) {
    const value =
      field.internalPath === null
        ? field.encodeConstant
        : getAtPath(
            state as unknown as Record<string, unknown>,
            field.internalPath,
          );
    setAtPath(result, field.externalPath, value);
  }
  return result as unknown as ExternalSaveData;
}

/** Build internal { player, world } from external { character, world, session }. */
export function decode(data: ExternalSaveData): InternalSaveData {
  const result: Record<string, unknown> = {};
  for (const field of SAVE_FIELDS) {
    if (field.internalPath === null) continue; // session is not part of internal state
    const value = getAtPath(
      data as unknown as Record<string, unknown>,
      field.externalPath,
    );
    setAtPath(result, field.internalPath, value);
  }
  return result as unknown as InternalSaveData;
}

// ---------------------------------------------------------------------------
// buildSaveDataSchema — replaces the hand-written Zod object literal.
//
// Groups SAVE_FIELDS by top-level external section (character / world /
// session) into a z.object of second-level keys, matching the shape and key
// order of the previous hand-written saveDataSchema exactly.
// ---------------------------------------------------------------------------

type FieldTuple = typeof SAVE_FIELDS;
type ExternalPathOf = FieldTuple[number]["externalPath"];
type SectionOf<P extends string> = P extends `${infer S}.${string}` ? S : never;
type LeafOf<P extends string> = P extends `${string}.${infer L}` ? L : never;
type SchemaForPath<P extends string> = Extract<
  FieldTuple[number],
  { externalPath: P }
>["schema"];
type SectionShape<S extends string> = {
  [L in LeafOf<Extract<ExternalPathOf, `${S}.${string}`>>]: SchemaForPath<`${S}.${L}`>;
};
type SaveDataSchemaShape = {
  [S in SectionOf<ExternalPathOf>]: z.ZodObject<SectionShape<S>>;
};

export function buildSaveDataSchema(): z.ZodObject<SaveDataSchemaShape> {
  const sections = new Map<string, Record<string, z.ZodTypeAny>>();
  for (const field of SAVE_FIELDS) {
    const [section, leaf] = field.externalPath.split(".") as [string, string];
    if (!sections.has(section)) sections.set(section, {});
    sections.get(section)![leaf] = field.schema;
  }
  const shape: Record<string, z.ZodObject<Record<string, z.ZodTypeAny>>> = {};
  for (const [section, fields] of sections) {
    shape[section] = z.object(fields);
  }
  return z.object(shape) as unknown as z.ZodObject<SaveDataSchemaShape>;
}

// ---------------------------------------------------------------------------
// Dirty-path derivation — replaces the hand-written NON_POSITION_PATHS list.
// ---------------------------------------------------------------------------

export const NON_POSITION_DIRTY_PATHS: readonly string[] = SAVE_FIELDS.flatMap(
  (field) => (field.dirty.kind === "non-position" ? field.dirty.paths : []),
);
