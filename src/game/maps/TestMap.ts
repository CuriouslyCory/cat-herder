import { TerrainType } from "../types";
import type { MapData, TerrainCell } from "./MapData";

// ---------------------------------------------------------------------------
// TestMap — 60 × 60 unit map (30 × 30 grid, cellSize = 2 u/cell)
//
// Coordinate system:
//   World X ∈ [−30, 30],  Z ∈ [−30, 30].
//   Grid origin (row=0, col=0) → world NW corner (−30, 0, −30).
//   Cell center: x = −30 + col×2 + 1,  z = −30 + row×2 + 1.
//
// Feature overview (approximate world coords):
//   Water zone      rows  3– 9, cols  3– 9  →  X ∈ [−24, −10], Z ∈ [−24, −10]
//   Dirt path       rows 10–14, cols 13–16  →  crosses map centre toward water
//   Stone platform  rows  2– 6, cols 21–27  →  NE area, elevated 2 u
//   Hidden zone     rows 22–27, cols 22–27  →  SE area, same height as grass
//   Grass platform  rows 12–14, cols 20–23  →  elevated 2 u
//   Grass platform  rows 18–20, cols  8–11  →  elevated 3 u
//   Pounce platform rows 14–15, cols  6– 7  →  X ∈ [−18,−14], Z ∈ [−2, 2], height 1 u
//   Spawn: player (0,0), cat (−10, 10), cat (10,−10)
// ---------------------------------------------------------------------------

const ROWS = 30;
const COLS = 30;

function grass(height = 0): TerrainCell {
  return { type: TerrainType.Grass, height, navigable: true };
}
function dirt(): TerrainCell {
  return { type: TerrainType.Dirt, height: 0, navigable: true };
}
function stone(height: number): TerrainCell {
  return { type: TerrainType.Stone, height, navigable: true };
}
function water(): TerrainCell {
  return { type: TerrainType.Water, height: 0, navigable: false };
}
function hidden(): TerrainCell {
  return { type: TerrainType.Hidden, height: 0, navigable: true };
}

function buildTerrain(): TerrainCell[][] {
  // Base layer — all grass at ground level
  const terrain: TerrainCell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => grass()),
  );

  // ── Water zone (SW quadrant) ────────────────────────────────────────────
  for (let r = 3; r <= 9; r++) {
    for (let c = 3; c <= 9; c++) {
      terrain[r]![c] = water();
    }
  }

  // ── Dirt path from map centre toward the water zone ──────────────────────
  for (let r = 10; r <= 14; r++) {
    for (let c = 13; c <= 16; c++) {
      terrain[r]![c] = dirt();
    }
  }

  // ── Stone platform (NE area, elevated 2 u) ──────────────────────────────
  for (let r = 2; r <= 6; r++) {
    for (let c = 21; c <= 27; c++) {
      terrain[r]![c] = stone(2);
    }
  }

  // ── Hidden terrain zone (SE area) ───────────────────────────────────────
  for (let r = 22; r <= 27; r++) {
    for (let c = 22; c <= 27; c++) {
      terrain[r]![c] = hidden();
    }
  }

  // ── Elevated grass platforms ────────────────────────────────────────────
  // Platform 1 — 8 × 6 u, height 2 u (east-centre area)
  for (let r = 12; r <= 14; r++) {
    for (let c = 20; c <= 23; c++) {
      terrain[r]![c] = grass(2);
    }
  }

  // Platform 2 — 8 × 6 u, height 3 u (west-centre area)
  for (let r = 18; r <= 20; r++) {
    for (let c = 8; c <= 11; c++) {
      terrain[r]![c] = grass(3);
    }
  }

  // Pounce platform — 4 × 4 u, height 1 u (west of spawn).
  // Reachable by placing a Pounce cat on the flat ground beside it and stepping on.
  // World coords: X ∈ [−18, −14], Z ∈ [−2, 2].
  for (let r = 14; r <= 15; r++) {
    for (let c = 6; c <= 7; c++) {
      terrain[r]![c] = grass(1);
    }
  }

  return terrain;
}

export const TestMap: MapData = {
  name: "TestMap",
  size: { width: 60, depth: 60 },
  cellSize: 2,
  terrain: buildTerrain(),
  spawnPoints: [
    { x: 0, z: 0, role: "player" },    // Map centre
    { x: -10, z: 10, role: "cat" },    // Near water zone
    { x: 10, z: -10, role: "cat" },    // NE side
  ],
};
