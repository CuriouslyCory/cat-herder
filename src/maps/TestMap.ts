import { TerrainType } from "../types";
import type { MapData, TerrainCell } from "./MapData";

// ─── Map dimensions ───────────────────────────────────────────────────────────
// 60×60 unit grid; each cell = 1×1 world unit

const WIDTH = 60;
const DEPTH = 60;

// ─── Terrain builder helpers ─────────────────────────────────────────────────

function grass(height = 0): TerrainCell {
  return { type: TerrainType.Grass, height, navigable: true };
}
function dirt(height = 0): TerrainCell {
  return { type: TerrainType.Dirt, height, navigable: true };
}
function stone(height = 0): TerrainCell {
  return { type: TerrainType.Stone, height, navigable: true };
}
function water(): TerrainCell {
  return { type: TerrainType.Water, height: 0, navigable: false };
}
function hidden(): TerrainCell {
  return { type: TerrainType.Hidden, height: 0, navigable: true };
}

// Build a 60×60 grid row-by-row (z increases southward)
function buildTerrain(): TerrainCell[][] {
  const grid: TerrainCell[][] = [];

  for (let z = 0; z < DEPTH; z++) {
    const row: TerrainCell[] = [];
    for (let x = 0; x < WIDTH; x++) {
      // ── Water zone: south-east corner [z: 43-57, x: 43-57] (15×15) ──
      if (z >= 43 && z <= 57 && x >= 43 && x <= 57) {
        row.push(water());
        continue;
      }

      // ── Hidden terrain: east edge [z: 20-35, x: 55-59] ──
      if (z >= 20 && z <= 35 && x >= 55) {
        row.push(hidden());
        continue;
      }

      // ── Elevated platform 1: [z: 10-13, x: 10-14], height 2 ──
      if (z >= 10 && z <= 13 && x >= 10 && x <= 14) {
        row.push(grass(2));
        continue;
      }

      // ── Elevated platform 2: [z: 20-23, x: 40-44], height 3 ──
      if (z >= 20 && z <= 23 && x >= 40 && x <= 44) {
        row.push(stone(3));
        continue;
      }

      // ── Elevated platform 3: [z: 35-38, x: 25-29], height 2 ──
      if (z >= 35 && z <= 38 && x >= 25 && x <= 29) {
        row.push(dirt(2));
        continue;
      }

      // ── Dirt zone: central band [z: 25-35, x: 15-40] ──
      if (z >= 25 && z <= 35 && x >= 15 && x <= 40) {
        row.push(dirt());
        continue;
      }

      // ── Stone area: north-east [z: 5-18, x: 40-54] ──
      if (z >= 5 && z <= 18 && x >= 40 && x <= 54) {
        row.push(stone());
        continue;
      }

      // Default: grass
      row.push(grass());
    }
    grid.push(row);
  }

  return grid;
}

// ─── TestMap definition ───────────────────────────────────────────────────────

export const TestMap: MapData = {
  name: "TestMap",
  size: { width: WIDTH, depth: DEPTH },
  terrain: buildTerrain(),

  waterZones: [
    { x: 43, z: 43, width: 15, depth: 15, waterDepth: 12 },
  ],

  spawnPoints: [
    // Player — map center
    { id: "player-start", x: 30, z: 30, type: "player" },

    // Cat spawns
    { id: "cat-north", x: 30, z: 5, type: "cat" },
    { id: "cat-south", x: 30, z: 55, type: "cat" },

    // Grass resource spawns (8–12, scattered across grass)
    { id: "grass-res-1", x: 5, z: 5, type: "resource" },
    { id: "grass-res-2", x: 15, z: 8, type: "resource" },
    { id: "grass-res-3", x: 8, z: 20, type: "resource" },
    { id: "grass-res-4", x: 22, z: 15, type: "resource" },
    { id: "grass-res-5", x: 5, z: 40, type: "resource" },
    { id: "grass-res-6", x: 12, z: 48, type: "resource" },
    { id: "grass-res-7", x: 50, z: 10, type: "resource" },
    { id: "grass-res-8", x: 55, z: 30, type: "resource" },
    { id: "grass-res-9", x: 38, z: 50, type: "resource" },
    { id: "grass-res-10", x: 20, z: 55, type: "resource" },

    // Sticks — north/forest zone (stone area edges)
    { id: "stick-1", x: 42, z: 8, type: "resource" },
    { id: "stick-2", x: 50, z: 12, type: "resource" },
    { id: "stick-3", x: 45, z: 17, type: "resource" },
    { id: "stick-4", x: 53, z: 6, type: "resource" },

    // Water resources — near water zone
    { id: "water-res-1", x: 40, z: 48, type: "resource" },
    { id: "water-res-2", x: 48, z: 42, type: "resource" },

    // Yarn pickups — scattered
    { id: "yarn-1", x: 10, z: 30, type: "yarn" },
    { id: "yarn-2", x: 50, z: 25, type: "yarn" },
    { id: "yarn-3", x: 35, z: 40, type: "yarn" },
  ],

  hiddenTerrain: [
    { x: 55, z: 20, width: 5, depth: 16 },
  ],
};
