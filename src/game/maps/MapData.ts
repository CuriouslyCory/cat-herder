import type { ResourceType, TerrainType } from "../types";

// ---------------------------------------------------------------------------
// MapData — terrain cell and map structure types
// ---------------------------------------------------------------------------

export interface TerrainCell {
  type: TerrainType;
  /** Surface height in world units (y-axis). 0 = ground level. */
  height: number;
  /** Whether entities can walk on this cell (false for water, lava, etc.) */
  navigable: boolean;
  /**
   * Water depth in world units. Only meaningful when type === TerrainType.Water.
   * Optional; omit for non-water cells.
   */
  depth?: number;
}

export interface SpawnPoint {
  /** World X coordinate */
  x: number;
  /** World Z coordinate */
  z: number;
  role: "player" | "cat" | "item";
}

export interface MapDataResourceNode {
  x: number;
  z: number;
  type: ResourceType;
  respawnTime: number;
}

export interface MapDataYarnPickup {
  x: number;
  z: number;
  yarnAmount: number;
}

export interface MapData {
  name: string;
  /** Total map size in world units */
  size: { width: number; depth: number };
  /**
   * 2-D terrain grid.
   * terrain[row][col] — row = Z axis, col = X axis.
   * Origin (row=0, col=0) is the north-west corner of the map.
   * Dimensions must satisfy: terrain.length === size.depth / cellSize,
   * terrain[0].length === size.width / cellSize.
   */
  terrain: TerrainCell[][];
  /** World units per grid cell */
  cellSize: number;
  spawnPoints: SpawnPoint[];
  /** Resource nodes that exist on this map. */
  resourceNodes: MapDataResourceNode[];
  /** Yarn pickups that exist on this map. */
  yarnPickups: MapDataYarnPickup[];
}
