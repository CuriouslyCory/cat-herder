import { describe, it, expect } from "vitest";
import {
  MapMutationCore,
  HEIGHT_MAX,
  DEFAULT_MAP_SIZE,
  DEFAULT_CELL_SIZE,
} from "~/game/maps/MapMutationCore";
import type { MapData } from "~/game/maps/MapData";
import { mapDataSchema } from "~/game/maps/MapDataSchema";
import { TerrainType, ResourceType } from "~/game/types";

// ---------------------------------------------------------------------------
// MapMutationCore — unit tests (#29).
//
// Deliberately free of any browser/rendering-layer or editor-class coupling:
// only `vitest`, the core module, pure data/type helpers, and `mapDataSchema`
// are imported (mirrors MapPersistenceController.test.ts, the template for
// this file per plans/29.md). No `document` stub, no `makeMockSceneManager`,
// no `MapEditor` construction anywhere in this file.
// ---------------------------------------------------------------------------

function makeMapData(): MapData {
  return {
    name: "valid",
    size: { width: 2, depth: 2 },
    terrain: [
      [
        { type: TerrainType.Grass, height: 0, navigable: true },
        { type: TerrainType.Grass, height: 0, navigable: true },
      ],
      [
        { type: TerrainType.Grass, height: 0, navigable: true },
        { type: TerrainType.Grass, height: 0, navigable: true },
      ],
    ],
    cellSize: 1,
    spawnPoints: [],
    resourceNodes: [],
    yarnPickups: [],
  };
}

describe("MapMutationCore.ensureTerrain()", () => {
  it("builds an all-Grass grid sized round(depth/cellSize) x round(width/cellSize)", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 6, depth: 4 }, 2);
    // 2 rows x 3 cols
    for (const { cell } of core.cells()) {
      expect(cell.type).toBe(TerrainType.Grass);
      expect(cell.height).toBe(0);
      expect(cell.navigable).toBe(true);
    }
    let rows = 0;
    let cols = 0;
    for (const { col, row } of core.cells()) {
      rows = Math.max(rows, row + 1);
      cols = Math.max(cols, col + 1);
    }
    expect(rows).toBe(2);
    expect(cols).toBe(3);
  });

  it("is idempotent — a second call does not rebuild an existing grid", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 4, depth: 4 }, 2);
    core.paintCell(0, 0, TerrainType.Stone);
    core.ensureTerrain({ width: 4, depth: 4 }, 2);
    expect(core.getCell(0, 0)?.type).toBe(TerrainType.Stone);
  });

  it("defaults to DEFAULT_MAP_SIZE/DEFAULT_CELL_SIZE when called with no args", () => {
    const core = new MapMutationCore();
    core.ensureTerrain();
    expect(core.size).toEqual(DEFAULT_MAP_SIZE);
    expect(core.cellSize).toBe(DEFAULT_CELL_SIZE);
  });
});

describe("MapMutationCore.paintCell() — navigable + height-preserve rules", () => {
  it("Water and Hidden are non-navigable; Grass/Dirt/Stone are navigable", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 8, depth: 2 }, 2);
    core.paintCell(0, 0, TerrainType.Water);
    core.paintCell(1, 0, TerrainType.Hidden);
    core.paintCell(2, 0, TerrainType.Grass);
    core.paintCell(3, 0, TerrainType.Dirt);
    expect(core.getCell(0, 0)?.navigable).toBe(false);
    expect(core.getCell(1, 0)?.navigable).toBe(false);
    expect(core.getCell(2, 0)?.navigable).toBe(true);
    expect(core.getCell(3, 0)?.navigable).toBe(true);
  });

  it("height is preserved only when the existing cell's height is > 0", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 4, depth: 2 }, 2);
    // Cell starts at height 0 -> paintCell keeps it 0
    core.paintCell(0, 0, TerrainType.Stone);
    expect(core.getCell(0, 0)?.height).toBe(0);
    // Raise it, then repaint -> height preserved
    core.setCellHeight(0, 0, 3);
    core.paintCell(0, 0, TerrainType.Dirt);
    expect(core.getCell(0, 0)?.height).toBe(3);
  });

  it("no-ops (does not throw) when the grid is not initialized", () => {
    const core = new MapMutationCore();
    expect(() => core.paintCell(0, 0, TerrainType.Stone)).not.toThrow();
    expect(core.getCell(0, 0)).toBeUndefined();
  });

  it("no-ops for an out-of-range cell", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 2, depth: 2 }, 2);
    expect(() => core.paintCell(99, 99, TerrainType.Stone)).not.toThrow();
  });
});

describe("MapMutationCore.setCellHeight() clamp", () => {
  it("clamps below 0 up to 0", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 2, depth: 2 }, 2);
    core.setCellHeight(0, 0, -5);
    expect(core.getCell(0, 0)?.height).toBe(0);
  });

  it(`clamps above HEIGHT_MAX (${HEIGHT_MAX}) down to HEIGHT_MAX`, () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 2, depth: 2 }, 2);
    core.setCellHeight(0, 0, 999);
    expect(core.getCell(0, 0)?.height).toBe(HEIGHT_MAX);
  });

  it("accepts 0 as a valid flat height (does not reject/clamp it up)", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 2, depth: 2 }, 2);
    core.setCellHeight(0, 0, 3);
    core.setCellHeight(0, 0, 0);
    expect(core.getCell(0, 0)?.height).toBe(0);
  });
});

describe("MapMutationCore.setCellType()", () => {
  it("changes only the type, leaving height/navigable untouched", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 2, depth: 2 }, 2);
    core.setCellHeight(0, 0, 2);
    core.setCellType(0, 0, TerrainType.Stone);
    expect(core.getCell(0, 0)).toEqual({ type: TerrainType.Stone, height: 2, navigable: true });
  });
});

describe("MapMutationCore.resetCell()", () => {
  it("resets a painted cell back to {Grass, height:0, navigable:true}", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 2, depth: 2 }, 2);
    core.paintCell(0, 0, TerrainType.Water);
    core.setCellHeight(0, 0, 4);
    core.resetCell(0, 0);
    expect(core.getCell(0, 0)).toEqual({ type: TerrainType.Grass, height: 0, navigable: true });
  });
});

describe("MapMutationCore.moveCell()", () => {
  it("clears the source cell (Grass default) and copies the cell to dest; returns both refs", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 6, depth: 2 }, 2);
    core.paintCell(0, 0, TerrainType.Stone);
    core.setCellHeight(0, 0, 3);
    const affected = core.moveCell({ col: 0, row: 0 }, { col: 2, row: 0 });
    expect(affected).toEqual([
      { col: 0, row: 0 },
      { col: 2, row: 0 },
    ]);
    expect(core.getCell(0, 0)).toEqual({ type: TerrainType.Grass, height: 0, navigable: true });
    expect(core.getCell(2, 0)).toEqual({ type: TerrainType.Stone, height: 3, navigable: true });
  });

  it("returns [] and does nothing when source === destination", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 2, depth: 2 }, 2);
    core.paintCell(0, 0, TerrainType.Stone);
    const affected = core.moveCell({ col: 0, row: 0 }, { col: 0, row: 0 });
    expect(affected).toEqual([]);
    expect(core.getCell(0, 0)?.type).toBe(TerrainType.Stone);
  });

  it("clears the source even when destination is out of range (verbatim pre-extraction behavior)", () => {
    // The pre-extraction MapEditor move-finalize branch always cleared the
    // source cell once a move was committed, gating only the *destination*
    // write on range — so an off-grid drag deletes the block instead of
    // silently no-op'ing. moveCell() preserves that exactly.
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 2, depth: 2 }, 2);
    core.paintCell(0, 0, TerrainType.Stone);
    const affected = core.moveCell({ col: 0, row: 0 }, { col: 99, row: 99 });
    expect(affected).toEqual([{ col: 0, row: 0 }]);
    expect(core.getCell(0, 0)).toEqual({ type: TerrainType.Grass, height: 0, navigable: true });
  });
});

describe("MapMutationCore.paintWaterRect() / paintHiddenRect()", () => {
  it("paintWaterRect fills the inclusive rect with {Water, height:0, navigable:false, depth}", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 8, depth: 8 }, 2);
    const affected = core.paintWaterRect({ col: 0, row: 0 }, { col: 1, row: 1 }, 3.5);
    expect(affected).toHaveLength(4);
    for (const { col, row } of affected) {
      expect(core.getCell(col, row)).toEqual({
        type: TerrainType.Water,
        height: 0,
        navigable: false,
        depth: 3.5,
      });
    }
  });

  it("paintHiddenRect fills the inclusive rect with {Hidden, height, navigable:false}", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 8, depth: 8 }, 2);
    const affected = core.paintHiddenRect({ col: 1, row: 1 }, { col: 2, row: 1 }, 2.5);
    expect(affected).toHaveLength(2);
    for (const { col, row } of affected) {
      expect(core.getCell(col, row)).toEqual({
        type: TerrainType.Hidden,
        height: 2.5,
        navigable: false,
      });
    }
  });

  it("corners can be given in either order (max/min normalized)", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 8, depth: 8 }, 2);
    const affected = core.paintWaterRect({ col: 2, row: 2 }, { col: 0, row: 0 }, 1);
    expect(affected).toHaveLength(9); // 3x3 rect
  });

  it("out-of-range corners are clipped, not thrown", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 4, depth: 4 }, 2); // 2x2 grid
    expect(() =>
      core.paintWaterRect({ col: -5, row: -5 }, { col: 10, row: 10 }, 1),
    ).not.toThrow();
    const affected = core.paintWaterRect({ col: -5, row: -5 }, { col: 10, row: 10 }, 1);
    // Only the 4 in-range cells (2x2 grid) get painted.
    expect(affected).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// ADR-0002 orientation lock
// ---------------------------------------------------------------------------

describe("ADR-0002 orientation lock: terrain[row][col], row=Z, col=X", () => {
  it("paintCell(col=2,row=1,...) writes toMapData().terrain[1][2] — not [2][1]", () => {
    // Non-square grid so a transposed index would land on an out-of-range or
    // wrong cell instead of silently matching: width=6,depth=4,cellSize=2 ->
    // 2 rows (Z) x 3 cols (X).
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 6, depth: 4 }, 2);
    core.paintCell(2, 1, TerrainType.Stone);

    const md = core.toMapData();
    // Correct orientation: row=1 (Z), col=2 (X).
    expect(md.terrain[1]![2]!.type).toBe(TerrainType.Stone);
    // Every other cell remains default Grass — in particular the transposed
    // position [2][1] (which only exists because the grid is not square in
    // the "wrong" direction check below) must NOT have been touched.
    for (let row = 0; row < md.terrain.length; row++) {
      for (let col = 0; col < md.terrain[row]!.length; col++) {
        if (row === 1 && col === 2) continue;
        expect(md.terrain[row]![col]!.type).toBe(TerrainType.Grass);
      }
    }
    // Dimensions confirm row=Z (depth/cellSize=2 rows), col=X (width/cellSize=3 cols).
    expect(md.terrain.length).toBe(2);
    expect(md.terrain[0]!.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Round-trip (AC #3) — schema validity + idempotent serialize
// ---------------------------------------------------------------------------

describe("MapMutationCore round-trip (AC #3)", () => {
  it("build -> toMapData() validates against mapDataSchema; reload -> re-serialize is a deep-equal idempotent round-trip", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 8, depth: 8 }, 2);
    core.paintWaterRect({ col: 0, row: 0 }, { col: 1, row: 1 }, 2);
    core.paintHiddenRect({ col: 2, row: 2 }, { col: 2, row: 2 }, 1.5);
    core.setCellHeight(3, 3, 4);
    core.setCellType(3, 3, TerrainType.Stone);
    core.setPlayerSpawn(-3, -3);
    core.addCatSpawn(1, 1);
    core.addResourceNode({ x: 1, z: 1, type: ResourceType.Grass, respawnTime: 30 });
    core.addYarnPickup({ x: 3, z: 3, yarnAmount: 5 });

    const md = core.toMapData();
    const result = mapDataSchema.safeParse(md);
    expect(result.success).toBe(true);

    const core2 = new MapMutationCore();
    core2.loadFromMapData(md);
    const md2 = core2.toMapData();
    expect(md2).toEqual(md);
  });

  it("loads a hand-authored fixture MapData, mutates, re-serializes, and still validates", () => {
    const core = new MapMutationCore();
    core.loadFromMapData(makeMapData());
    core.paintCell(1, 1, TerrainType.Dirt);
    const md = core.toMapData();
    expect(mapDataSchema.safeParse(md).success).toBe(true);
    expect(md.terrain[1]![1]!.type).toBe(TerrainType.Dirt);
  });
});

describe("MapMutationCore.toMapData() serializer parity — never-initialized edge", () => {
  it("a fresh core (no ensureTerrain/loadFromMapData) serializes to untitled/empty (matches pre-init getMapData())", () => {
    const core = new MapMutationCore();
    const md = core.toMapData();
    expect(md.name).toBe("untitled");
    expect(md.terrain).toEqual([]);
    expect(md.spawnPoints).toEqual([]);
    expect(md.resourceNodes).toEqual([]);
    expect(md.yarnPickups).toEqual([]);
    expect(md.size).toEqual(DEFAULT_MAP_SIZE);
    expect(md.cellSize).toBe(DEFAULT_CELL_SIZE);
  });
});

// ---------------------------------------------------------------------------
// Entity mutation
// ---------------------------------------------------------------------------

describe("MapMutationCore entity mutation", () => {
  it("setPlayerSpawn replaces any existing spawn (only one allowed)", () => {
    const core = new MapMutationCore();
    core.setPlayerSpawn(1, 1);
    core.setPlayerSpawn(2, 2);
    expect(core.playerSpawn).toEqual({ x: 2, z: 2 });
  });

  it("clearPlayerSpawn() removes it", () => {
    const core = new MapMutationCore();
    core.setPlayerSpawn(1, 1);
    core.clearPlayerSpawn();
    expect(core.playerSpawn).toBeNull();
  });

  it("addCatSpawn / removeCatSpawn identity splice", () => {
    const core = new MapMutationCore();
    const a = core.addCatSpawn(1, 1);
    const b = core.addCatSpawn(2, 2);
    core.removeCatSpawn(a);
    expect(core.catSpawns).toEqual([b]);
  });

  it("addResourceNode / removeResourceNode identity splice", () => {
    const core = new MapMutationCore();
    const a = core.addResourceNode({ x: 1, z: 1, type: ResourceType.Grass, respawnTime: 30 });
    const b = core.addResourceNode({ x: 2, z: 2, type: ResourceType.Sticks, respawnTime: 45 });
    core.removeResourceNode(a);
    expect(core.resourceNodes).toEqual([b]);
  });

  it("addYarnPickup / removeYarnPickup identity splice", () => {
    const core = new MapMutationCore();
    const a = core.addYarnPickup({ x: 1, z: 1, yarnAmount: 3 });
    const b = core.addYarnPickup({ x: 2, z: 2, yarnAmount: 5 });
    core.removeYarnPickup(a);
    expect(core.yarnPickups).toEqual([b]);
  });

  it("removing an object not in the collection is a no-op (indexOf === -1 guard)", () => {
    const core = new MapMutationCore();
    const a = core.addCatSpawn(1, 1);
    core.removeCatSpawn(a);
    expect(() => core.removeCatSpawn(a)).not.toThrow();
    expect(core.catSpawns).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Iterators
// ---------------------------------------------------------------------------

describe("MapMutationCore iterators", () => {
  it("nonDefaultCells() yields only cells that differ from {Grass, height:0}", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 4, depth: 4 }, 2);
    core.paintCell(0, 0, TerrainType.Stone);
    core.setCellHeight(1, 1, 2);
    const found = [...core.nonDefaultCells()].map(({ col, row }) => `${col},${row}`);
    expect(found.sort()).toEqual(["0,0", "1,1"]);
  });

  it("cellsOfType(Water) yields only Water cells", () => {
    const core = new MapMutationCore();
    core.ensureTerrain({ width: 4, depth: 4 }, 2);
    core.paintCell(0, 0, TerrainType.Water);
    core.paintCell(1, 1, TerrainType.Hidden);
    const found = [...core.cellsOfType(TerrainType.Water)];
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ col: 0, row: 0 });
  });
});

// ---------------------------------------------------------------------------
// Break-it-to-verify discipline (CLAUDE.md). These document the red/green
// cycle performed during implementation; they are ordinary regression tests
// that would catch the same regressions if reintroduced:
//   1. Transposing the internal index to terrain[col][row] fails the
//      orientation-lock test above.
//   2. Dropping the Water/Hidden check in the navigable rule fails the
//      "Water and Hidden are non-navigable" test above.
//   3. Omitting resourceNodes from toMapData() fails the schema round-trip
//      test above (required field).
// ---------------------------------------------------------------------------
