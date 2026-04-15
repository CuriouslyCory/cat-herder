import { TerrainType } from "../types";

export type { TerrainType };

// ─── Cell Types ───────────────────────────────────────────────────────────────

export interface TerrainCell {
  type: TerrainType;
  height: number; // elevation in world units
  navigable: boolean;
}

export interface WaterZone {
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Depth below terrain surface in world units */
  waterDepth: number;
}

export interface SpawnPoint {
  id: string;
  x: number;
  z: number;
  type: "player" | "cat" | "resource" | "yarn";
}

export interface HiddenTerrainArea {
  x: number;
  z: number;
  width: number;
  depth: number;
}

// ─── MapData ──────────────────────────────────────────────────────────────────

export interface MapData {
  name: string;
  size: { width: number; depth: number };
  /** 2D row-major array of terrain cells [z][x] */
  terrain: TerrainCell[][];
  waterZones: WaterZone[];
  spawnPoints: SpawnPoint[];
  hiddenTerrain: HiddenTerrainArea[];
}
