import { z } from "zod";
import { ResourceType, TerrainType } from "../types";

// ---------------------------------------------------------------------------
// MapDataSchema — Zod v4 schema mirroring the MapData interface.
// Used by the MapEditor (US-305) to validate imported map JSON files.
// ---------------------------------------------------------------------------

export const terrainCellSchema = z.object({
  type: z.nativeEnum(TerrainType),
  height: z.number(),
  navigable: z.boolean(),
});

export const spawnPointSchema = z.object({
  x: z.number(),
  z: z.number(),
  role: z.enum(["player", "cat", "item"]),
});

// Optional editor-extension schemas (mirrors MapData optional fields)

export const mapDataBlockSchema = z.object({
  x: z.number(),
  z: z.number(),
  type: z.nativeEnum(TerrainType),
  height: z.number(),
});

export const mapDataWaterZoneSchema = z.object({
  x1: z.number(),
  z1: z.number(),
  x2: z.number(),
  z2: z.number(),
  depth: z.number(),
});

export const mapDataHiddenTerrainZoneSchema = z.object({
  x1: z.number(),
  z1: z.number(),
  x2: z.number(),
  z2: z.number(),
  height: z.number(),
});

export const mapDataResourceNodeSchema = z.object({
  x: z.number(),
  z: z.number(),
  type: z.nativeEnum(ResourceType),
  respawnTime: z.number(),
});

export const mapDataYarnPickupSchema = z.object({
  x: z.number(),
  z: z.number(),
  yarnAmount: z.number(),
});

export const mapDataSchema = z.object({
  name: z.string(),
  // Finding 5: require positive dimensions so NavigationOverlay never divides by zero
  size: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
  }),
  terrain: z.array(z.array(terrainCellSchema)),
  // cellSize must be positive (used as a divisor in world-to-pixel calculations)
  cellSize: z.number().positive(),
  spawnPoints: z.array(spawnPointSchema),
  // Optional editor-extension fields
  blocks: z.array(mapDataBlockSchema).optional(),
  waterZones: z.array(mapDataWaterZoneSchema).optional(),
  hiddenTerrainZones: z.array(mapDataHiddenTerrainZoneSchema).optional(),
  resourceNodes: z.array(mapDataResourceNodeSchema).optional(),
  yarnPickups: z.array(mapDataYarnPickupSchema).optional(),
});
