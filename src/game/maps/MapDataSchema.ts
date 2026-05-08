import { z } from "zod";
import { TerrainType } from "../types";

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

export const mapDataSchema = z.object({
  name: z.string(),
  size: z.object({ width: z.number(), depth: z.number() }),
  terrain: z.array(z.array(terrainCellSchema)),
  cellSize: z.number(),
  spawnPoints: z.array(spawnPointSchema),
});
