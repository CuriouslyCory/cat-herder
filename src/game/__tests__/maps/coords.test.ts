import { describe, it, expect } from "vitest";
import {
  cellToWorld,
  worldToCell,
  cellMeshGeometry,
  FLOOR_THICKNESS,
} from "../../maps/coords";

// ---------------------------------------------------------------------------
// Test group 1: cellToWorld / worldToCell inverse property
// ---------------------------------------------------------------------------

describe("cellToWorld / worldToCell inverse property", () => {
  it("worldToCell(cellToWorld(col, row)) === (col, row) for TestMap params", () => {
    const cs = 2,
      w = 60,
      d = 60;
    for (let r = 0; r < 30; r++) {
      for (let c = 0; c < 30; c++) {
        const { x, z } = cellToWorld(c, r, cs, w, d);
        const { col, row } = worldToCell(x, z, cs, w, d);
        expect(col).toBe(c);
        expect(row).toBe(r);
      }
    }
  });

  it("cellToWorld(worldToCell(x, z)) rounds back to the same cell center", () => {
    const cs = 2,
      w = 60,
      d = 60;
    // spot-check: map-centre (0,0) → cell (15,15)
    const { col, row } = worldToCell(0, 0, cs, w, d);
    expect(col).toBe(15);
    expect(row).toBe(15);
    const { x, z } = cellToWorld(15, 15, cs, w, d);
    expect(x).toBeCloseTo(1); // -30 + 15*2 + 1 = 1
    expect(z).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// Test group 2: cellToWorld parity with pre-refactor MapManager formula
// Golden values for TestMap (size=60×60, cellSize=2, halfW=30, halfD=30)
// ---------------------------------------------------------------------------

describe("cellToWorld parity with pre-refactor MapManager formula (TestMap snapshot)", () => {
  const cs = 2,
    w = 60,
    d = 60;

  it.each([
    [0, 0, -29, -29],
    [14, 14, -1, -1],
    [15, 15, 1, 1],
    [29, 29, 29, 29],
    [3, 3, -23, -23],
    [21, 2, 13, -25],
  ])("col=%i row=%i → x=%f z=%f", (col, row, expectedX, expectedZ) => {
    const { x, z } = cellToWorld(col, row, cs, w, d);
    expect(x).toBeCloseTo(expectedX);
    expect(z).toBeCloseTo(expectedZ);
  });
});

// ---------------------------------------------------------------------------
// Test group 3: worldToCell parity with pre-refactor getTerrainAt formula
// ---------------------------------------------------------------------------

describe("worldToCell parity with pre-refactor getTerrainAt formula", () => {
  const cs = 2,
    w = 60,
    d = 60;

  it.each([
    // [worldX, worldZ, expectedCol, expectedRow]
    [-30, -30, 0, 0], // NW corner
    [-29, -29, 0, 0], // inside first cell
    [-28.1, -28.1, 0, 0],
    [-27.9, -27.9, 1, 1],
    [0, 0, 15, 15],
    [28.9, 28.9, 29, 29], // last cell
  ])("world (%f,%f) → col=%i row=%i", (x, z, eCol, eRow) => {
    const { col, row } = worldToCell(x, z, cs, w, d);
    expect(col).toBe(eCol);
    expect(row).toBe(eRow);
  });
});

// ---------------------------------------------------------------------------
// Test group 4: cellMeshGeometry height rule correctness
// ---------------------------------------------------------------------------

describe("cellMeshGeometry", () => {
  it("elevated cell: boxHeight = height, centerY = height/2", () => {
    const { boxHeight, centerY } = cellMeshGeometry(2);
    expect(boxHeight).toBe(2);
    expect(centerY).toBe(1);
  });

  it("flat cell (height=0): boxHeight = FLOOR_THICKNESS, centerY = -FLOOR_THICKNESS/2", () => {
    const { boxHeight, centerY } = cellMeshGeometry(0);
    expect(boxHeight).toBe(FLOOR_THICKNESS); // 0.2
    expect(centerY).toBe(-FLOOR_THICKNESS / 2); // -0.1
  });

  it("custom floorThickness overrides the default", () => {
    const { boxHeight, centerY } = cellMeshGeometry(0, 0.4);
    expect(boxHeight).toBeCloseTo(0.4);
    expect(centerY).toBeCloseTo(-0.2);
  });

  it("height=1 (pounce platform)", () => {
    const { boxHeight, centerY } = cellMeshGeometry(1);
    expect(boxHeight).toBe(1);
    expect(centerY).toBe(0.5);
  });
});
