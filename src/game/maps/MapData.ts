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
}

export interface SpawnPoint {
  /** World X coordinate */
  x: number;
  /** World Z coordinate */
  z: number;
  role: "player" | "cat" | "item";
}

// ---------------------------------------------------------------------------
// Optional editor-extension fields (serialized from MapEditor live state).
// These are OPTIONAL so existing maps (TestMap) remain valid without them.
// MapManager.loadMap() ignores unknown fields, so adding them is safe.
// ---------------------------------------------------------------------------

export interface MapDataBlock {
  x: number;
  z: number;
  type: TerrainType;
  height: number;
}

export interface MapDataWaterZone {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  depth: number;
}

export interface MapDataHiddenTerrainZone {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  height: number;
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
   */
  terrain: TerrainCell[][];
  /** World units per grid cell */
  cellSize: number;
  spawnPoints: SpawnPoint[];

  // Optional editor-serialized collections (absent in hand-authored maps)
  blocks?: MapDataBlock[];
  waterZones?: MapDataWaterZone[];
  hiddenTerrainZones?: MapDataHiddenTerrainZone[];
  resourceNodes?: MapDataResourceNode[];
  yarnPickups?: MapDataYarnPickup[];
}
