import { describe, it, expect, beforeEach } from "vitest";
import { World } from "~/game/ecs/World";
import { EventBus } from "~/game/engine/EventBus";
import { MapManager } from "~/game/maps/MapManager";
import { TestMap } from "~/game/maps/TestMap";
import { TerrainType } from "~/game/types";
import { cellToWorld } from "~/game/maps/coords";

// ---------------------------------------------------------------------------
// TerrainParity — verifies that MapManager.loadMap(TestMap) correctly
// represents water and hidden terrain zones from the terrain[][] grid.
//
// TestMap water zone:   rows 3–9, cols 3–9
// TestMap hidden zone:  rows 22–27, cols 22–27
// TestMap params: cellSize=2, size={width:60, depth:60}
// ---------------------------------------------------------------------------

const CS = TestMap.cellSize;       // 2
const W  = TestMap.size.width;     // 60
const D  = TestMap.size.depth;     // 60

let mapManager: MapManager;

beforeEach(() => {
  const world = new World();
  const eventBus = new EventBus();
  mapManager = new MapManager(world, eventBus);
  mapManager.loadMap(TestMap);
});

describe("TerrainParity: water zone (rows 3–9, cols 3–9)", () => {
  it("getTerrainAt returns TerrainType.Water for a cell in the water zone", () => {
    // Pick a cell in the middle of the water zone (row=5, col=5)
    const { x, z } = cellToWorld(5, 5, CS, W, D);
    const cell = mapManager.getTerrainAt(x, z);
    expect(cell).not.toBeNull();
    expect(cell!.type).toBe(TerrainType.Water);
  });

  it("getTerrainAt returns navigable:false for water zone cells", () => {
    const { x, z } = cellToWorld(4, 4, CS, W, D);
    const cell = mapManager.getTerrainAt(x, z);
    expect(cell).not.toBeNull();
    expect(cell!.navigable).toBe(false);
  });

  it("all water zone cells (rows 3–9, cols 3–9) are Water type", () => {
    for (let row = 3; row <= 9; row++) {
      for (let col = 3; col <= 9; col++) {
        const { x, z } = cellToWorld(col, row, CS, W, D);
        const cell = mapManager.getTerrainAt(x, z);
        expect(cell?.type, `row=${row} col=${col}`).toBe(TerrainType.Water);
      }
    }
  });

  it("cell just outside the water zone is not Water (row=2, col=5)", () => {
    const { x, z } = cellToWorld(5, 2, CS, W, D);
    const cell = mapManager.getTerrainAt(x, z);
    expect(cell).not.toBeNull();
    expect(cell!.type).not.toBe(TerrainType.Water);
  });
});

describe("TerrainParity: hidden zone (rows 22–27, cols 22–27)", () => {
  it("getTerrainAt returns TerrainType.Hidden for a cell in the hidden zone", () => {
    // Pick a cell in the middle of the hidden zone (row=24, col=24)
    const { x, z } = cellToWorld(24, 24, CS, W, D);
    const cell = mapManager.getTerrainAt(x, z);
    expect(cell).not.toBeNull();
    expect(cell!.type).toBe(TerrainType.Hidden);
  });

  it("getTerrainAt returns navigable:true for hidden zone cells", () => {
    // Hidden terrain is traversable (just invisible) — navigable is true
    const { x, z } = cellToWorld(23, 23, CS, W, D);
    const cell = mapManager.getTerrainAt(x, z);
    expect(cell).not.toBeNull();
    expect(cell!.navigable).toBe(true);
  });

  it("all hidden zone cells (rows 22–27, cols 22–27) are Hidden type", () => {
    for (let row = 22; row <= 27; row++) {
      for (let col = 22; col <= 27; col++) {
        const { x, z } = cellToWorld(col, row, CS, W, D);
        const cell = mapManager.getTerrainAt(x, z);
        expect(cell?.type, `row=${row} col=${col}`).toBe(TerrainType.Hidden);
      }
    }
  });

  it("cell just outside the hidden zone is not Hidden (row=28, col=24)", () => {
    const { x, z } = cellToWorld(24, 28, CS, W, D);
    const cell = mapManager.getTerrainAt(x, z);
    expect(cell).not.toBeNull();
    expect(cell!.type).not.toBe(TerrainType.Hidden);
  });
});

describe("TerrainParity: general terrain lookup", () => {
  it("center of map (row=15, col=15) returns Grass (flat ground)", () => {
    const { x, z } = cellToWorld(15, 15, CS, W, D);
    const cell = mapManager.getTerrainAt(x, z);
    expect(cell).not.toBeNull();
    expect(cell!.type).toBe(TerrainType.Grass);
  });

  it("returns null for coordinates outside the map", () => {
    const cell = mapManager.getTerrainAt(200, 200);
    expect(cell).toBeNull();
  });
});
