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
  depth: z.number().optional(),
});

export const spawnPointSchema = z.object({
  x: z.number(),
  z: z.number(),
  role: z.enum(["player", "cat", "item"]),
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

// terrain — non-empty + rectangular superRefine
const terrainSchema = z
  .array(z.array(terrainCellSchema))
  .superRefine((grid, ctx) => {
    if (grid.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "terrain must have at least one row" });
      return;
    }
    const rowLen = grid[0]!.length;
    if (rowLen === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "terrain rows must have at least one column" });
      return;
    }
    for (let r = 1; r < grid.length; r++) {
      if (grid[r]!.length !== rowLen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `terrain is not rectangular: row 0 has ${rowLen} cols, row ${r} has ${grid[r]!.length}`,
        });
      }
    }
  });

export const mapDataSchema = z.object({
  name: z.string(),
  // Finding 5: require positive dimensions so NavigationOverlay never divides by zero
  size: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
  }),
  terrain: terrainSchema,
  // cellSize must be positive (used as a divisor in world-to-pixel calculations)
  cellSize: z.number().positive(),
  spawnPoints: z.array(spawnPointSchema),
  resourceNodes: z.array(mapDataResourceNodeSchema),
  yarnPickups: z.array(mapDataYarnPickupSchema),
}).superRefine((data, ctx) => {
  // Terrain dimensions must match size/cellSize
  const expectedRows = data.size.depth / data.cellSize;
  const expectedCols = data.size.width / data.cellSize;
  if (data.terrain.length !== expectedRows) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `terrain has ${data.terrain.length} rows but size.depth/cellSize = ${expectedRows}`,
    });
  }
  const actualCols = data.terrain[0]?.length ?? 0;
  if (actualCols !== expectedCols) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `terrain row 0 has ${actualCols} cols but size.width/cellSize = ${expectedCols}`,
    });
  }
});
