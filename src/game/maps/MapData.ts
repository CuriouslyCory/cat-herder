import type { TerrainType } from "../types";

// ---------------------------------------------------------------------------
// MapData — terrain cell and map structure types
// ---------------------------------------------------------------------------

export interface TerrainCell {
  type: TerrainType;
  /** Surface height in world units (y-axis). 0 = ground level. */
  height: number;
  /** Whether entities can walk on this cell (false for water, lava, etc.) */
  navigable: boolean;
}

export interface SpawnPoint {
  /** World X coordinate */
  x: number;
  /** World Z coordinate */
  z: number;
  role: "player" | "cat" | "item";
}

export interface MapData {
  name: string;
  /** Total map size in world units */
  size: { width: number; depth: number };
  /**
   * 2-D terrain grid.
   * terrain[row][col] — row = Z axis, col = X axis.
   * Origin (row=0, col=0) is the north-west corner of the map.
   */
  terrain: TerrainCell[][];
  /** World units per grid cell */
  cellSize: number;
  spawnPoints: SpawnPoint[];
}
