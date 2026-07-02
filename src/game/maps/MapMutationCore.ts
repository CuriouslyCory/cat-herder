import type {
  MapData,
  MapDataResourceNode,
  MapDataYarnPickup,
  SpawnPoint,
  TerrainCell,
} from "./MapData";
import { ResourceType, TerrainType } from "../types";

// ---------------------------------------------------------------------------
// MapMutationCore — owns the canonical map document (#29) extracted from
// MapEditor. DOM-free and Three.js-free: the only imports are `MapData`
// types and the `TerrainType`/`ResourceType` enums, so every terrain/entity
// mutation and the MapData serialize/deserialize round-trip is unit-testable
// without jsdom (no `document`, no `SceneManager`/`SceneHandle`).
//
// ADR-0002 compliance: this class stores exactly one grid, `_terrain:
// TerrainCell[][]`, in canonical orientation — `terrain[row][col]`, row = Z
// (north→south), col = X (west→east) — consistent with `coords.ts`. Every
// mutation method takes `(col, row)` (matching `worldToCell`'s `{col, row}`
// return) and internally indexes `_terrain[row][col]`. There is no parallel
// blocks[]/waterZones[]/hiddenTerrainZones[] storage; Water/Hidden cells are
// simply `terrain[][]` cells of that TerrainType. `toMapData()` always
// produces output that validates against `mapDataSchema` (required
// `resourceNodes`/`yarnPickups`, non-empty rectangular `terrain`).
//
// This is a behavior-preserving extraction; see plans/29.md. MapEditor keeps
// all Three.js `SceneHandle` bookkeeping and world<->cell coordinate
// conversion (via coords.ts) — it drives this core through a small
// cell-indexed interface and reflects the returned change-sets into meshes.
// ---------------------------------------------------------------------------

/** Pure clamp ceiling for cell height edits. Mirrors MapEditor's HEIGHT_MAX. */
export const HEIGHT_MAX = 5;

/** Default map dimensions used when no map data has been loaded/ensured yet. */
export const DEFAULT_MAP_SIZE = { width: 30, depth: 30 } as const;

/** Default world units per grid cell. */
export const DEFAULT_CELL_SIZE = 2;

// ---------------------------------------------------------------------------
// Pure entity records — data only, NO SceneHandle. MapEditor pairs each of
// these (by identity) with an optional SceneHandle in its own handle registry.
// ---------------------------------------------------------------------------

export interface CorePlayerSpawn {
  x: number;
  z: number;
}

export interface CoreCatSpawn {
  x: number;
  z: number;
}

export interface CoreResourceNode {
  x: number;
  z: number;
  type: ResourceType;
  respawnTime: number;
}

export interface CoreYarnPickup {
  x: number;
  z: number;
  yarnAmount: number;
}

export interface CellRef {
  col: number;
  row: number;
}

export class MapMutationCore {
  private _name = "untitled";
  private _size: { width: number; depth: number } = { ...DEFAULT_MAP_SIZE };
  private _cellSize = DEFAULT_CELL_SIZE;
  /** Canonical grid — terrain[row][col]; row = Z, col = X (ADR-0002). */
  private _terrain: TerrainCell[][] | null = null;
  private _playerSpawn: CorePlayerSpawn | null = null;
  private _catSpawns: CoreCatSpawn[] = [];
  private _resourceNodes: CoreResourceNode[] = [];
  private _yarnPickups: CoreYarnPickup[] = [];

  // ── dimensions / reads ───────────────────────────────────────────────────

  get size(): { width: number; depth: number } {
    return { ...this._size };
  }

  get cellSize(): number {
    return this._cellSize;
  }

  get name(): string {
    return this._name;
  }

  /** True once ensureTerrain()/loadFromMapData() has initialized the grid. */
  hasTerrain(): boolean {
    return this._terrain !== null;
  }

  getCell(col: number, row: number): TerrainCell | undefined {
    return this._terrain?.[row]?.[col];
  }

  get resourceNodes(): readonly CoreResourceNode[] {
    return this._resourceNodes;
  }

  get yarnPickups(): readonly CoreYarnPickup[] {
    return this._yarnPickups;
  }

  get catSpawns(): readonly CoreCatSpawn[] {
    return this._catSpawns;
  }

  /**
   * Returns the live internal record (not a copy) — like `resourceNodes`/
   * `catSpawns`/`yarnPickups`, this lets MapEditor key its SceneHandle
   * registry by identity and detect the same record across calls (needed for
   * move/delete-by-identity parity with the pre-extraction editor code).
   */
  get playerSpawn(): CorePlayerSpawn | null {
    return this._playerSpawn;
  }

  /** Iterate every cell in the grid, in row-major (Z then X) order. */
  *cells(): Iterable<{ col: number; row: number; cell: TerrainCell }> {
    if (!this._terrain) return;
    for (let row = 0; row < this._terrain.length; row++) {
      const terrainRow = this._terrain[row];
      if (!terrainRow) continue;
      for (let col = 0; col < terrainRow.length; col++) {
        const cell = terrainRow[col];
        if (!cell) continue;
        yield { col, row, cell };
      }
    }
  }

  /** Cells that differ from the default (Grass, height 0) — mirrors getEditorBlocks(). */
  *nonDefaultCells(): Iterable<{ col: number; row: number; cell: TerrainCell }> {
    for (const entry of this.cells()) {
      if (entry.cell.type === TerrainType.Grass && entry.cell.height === 0) continue;
      yield entry;
    }
  }

  /** Cells of a specific TerrainType — powers getEditorWaterZones()/getEditorHiddenTerrainZones(). */
  *cellsOfType(t: TerrainType): Iterable<{ col: number; row: number; cell: TerrainCell }> {
    for (const entry of this.cells()) {
      if (entry.cell.type === t) yield entry;
    }
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  /**
   * Lazily build an all-Grass grid from size/cellSize if not already present.
   * Mirrors MapEditor._ensureTerrain(): rows = round(depth/cellSize),
   * cols = round(width/cellSize).
   */
  ensureTerrain(
    size: { width: number; depth: number } = this._size,
    cellSize: number = this._cellSize,
  ): void {
    if (this._terrain) return;
    this._size = { ...size };
    this._cellSize = cellSize;
    const rows = Math.round(size.depth / cellSize);
    const cols = Math.round(size.width / cellSize);
    this._terrain = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, (): TerrainCell => ({
        type: TerrainType.Grass,
        height: 0,
        navigable: true,
      })),
    );
  }

  /**
   * Replace the whole document from MapData: deep-copies terrain rows and
   * copies entity records (data only — no handles). Mirrors the data half of
   * MapEditor.loadMapData().
   */
  loadFromMapData(data: MapData): void {
    this._name = data.name;
    this._size = { ...data.size };
    this._cellSize = data.cellSize;
    this._terrain = data.terrain.map((row) => [...row]);

    this._playerSpawn = null;
    this._catSpawns = [];
    for (const sp of data.spawnPoints) {
      if (sp.role === "player") {
        this._playerSpawn = { x: sp.x, z: sp.z };
      } else if (sp.role === "cat") {
        this._catSpawns.push({ x: sp.x, z: sp.z });
      }
    }

    this._resourceNodes = data.resourceNodes.map((rn) => ({
      x: rn.x,
      z: rn.z,
      type: rn.type,
      respawnTime: rn.respawnTime,
    }));
    this._yarnPickups = data.yarnPickups.map((yp) => ({
      x: yp.x,
      z: yp.z,
      yarnAmount: yp.yarnAmount,
    }));
  }

  /** Drop all document state (terrain + entities). Mirrors the data half of _clearEditorState. */
  clear(): void {
    this._terrain = null;
    this._playerSpawn = null;
    this._catSpawns = [];
    this._resourceNodes = [];
    this._yarnPickups = [];
  }

  // ── terrain mutation (cell-indexed; col = X, row = Z) ─────────────────────

  /**
   * placeBlock rule (verbatim port): keep height if the existing cell's
   * height is >0, else 0; navigable = type is neither Water nor Hidden.
   * No-op if the grid isn't initialized or (col,row) is out of range.
   */
  paintCell(col: number, row: number, type: TerrainType): void {
    const cell = this._terrain?.[row]?.[col];
    if (!cell) return;
    this._terrain![row]![col] = {
      type,
      height: cell.height > 0 ? cell.height : 0,
      navigable: type !== TerrainType.Water && type !== TerrainType.Hidden,
    };
  }

  setCellType(col: number, row: number, type: TerrainType): void {
    const cell = this._terrain?.[row]?.[col];
    if (!cell) return;
    cell.type = type;
  }

  /** Clamps to [0, HEIGHT_MAX]. 0 is a valid (flat) height. */
  setCellHeight(col: number, row: number, height: number): void {
    const cell = this._terrain?.[row]?.[col];
    if (!cell) return;
    cell.height = Math.max(0, Math.min(HEIGHT_MAX, height));
  }

  /** Reset a cell to the default {Grass, height:0, navigable:true}. */
  resetCell(col: number, row: number): void {
    if (!this._terrain?.[row]?.[col]) return;
    this._terrain[row]![col] = { type: TerrainType.Grass, height: 0, navigable: true };
  }

  /**
   * Clear the source cell (reset to default) and copy its previous contents
   * to the destination cell. Returns the affected refs (source first, then
   * destination) so the caller can refresh exactly those meshes.
   *
   * Verbatim port of MapEditor's move-finalize block branch: the source cell
   * is ALWAYS cleared once a move is committed (from !== to and the source
   * cell exists) — even if the destination turns out to be out of range —
   * matching the pre-extraction behavior exactly. The destination is only
   * written (and only appears in the returned list) when it is in range.
   * No-op (returns []) when source === destination, or the source is out of
   * range / uninitialized.
   */
  moveCell(from: CellRef, to: CellRef): CellRef[] {
    if (!this._terrain) return [];
    if (from.col === to.col && from.row === to.row) return [];
    const srcCell = this._terrain[from.row]?.[from.col];
    if (!srcCell) return [];

    this._terrain[from.row]![from.col] = { type: TerrainType.Grass, height: 0, navigable: true };
    const affected: CellRef[] = [{ col: from.col, row: from.row }];

    if (this._terrain[to.row]?.[to.col] !== undefined) {
      this._terrain[to.row]![to.col] = { ...srcCell };
      affected.push({ col: to.col, row: to.row });
    }
    return affected;
  }

  /**
   * Fill the inclusive rectangle spanned by corners a/b with Water cells at
   * the given depth. Out-of-range cells are skipped (no throw). Returns the
   * list of affected {col,row} refs.
   */
  paintWaterRect(a: CellRef, b: CellRef, depth: number): CellRef[] {
    return this._paintRect(a, b, (): TerrainCell => ({
      type: TerrainType.Water,
      height: 0,
      navigable: false,
      depth,
    }));
  }

  /**
   * Fill the inclusive rectangle spanned by corners a/b with Hidden cells at
   * the given height. Out-of-range cells are skipped (no throw). Returns the
   * list of affected {col,row} refs.
   */
  paintHiddenRect(a: CellRef, b: CellRef, height: number): CellRef[] {
    return this._paintRect(a, b, (): TerrainCell => ({
      type: TerrainType.Hidden,
      height,
      navigable: false,
    }));
  }

  private _paintRect(a: CellRef, b: CellRef, makeCell: () => TerrainCell): CellRef[] {
    if (!this._terrain) return [];
    const minCol = Math.min(a.col, b.col);
    const maxCol = Math.max(a.col, b.col);
    const minRow = Math.min(a.row, b.row);
    const maxRow = Math.max(a.row, b.row);

    const affected: CellRef[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!this._terrain[row]?.[col]) continue;
        this._terrain[row]![col] = makeCell();
        affected.push({ col, row });
      }
    }
    return affected;
  }

  // ── entity mutation (pure data; returns the record for handle-keying) ────

  /** Replaces any existing player spawn (only one allowed). */
  setPlayerSpawn(x: number, z: number): CorePlayerSpawn {
    const spawn: CorePlayerSpawn = { x, z };
    this._playerSpawn = spawn;
    return spawn;
  }

  clearPlayerSpawn(): void {
    this._playerSpawn = null;
  }

  addCatSpawn(x: number, z: number): CoreCatSpawn {
    const spawn: CoreCatSpawn = { x, z };
    this._catSpawns.push(spawn);
    return spawn;
  }

  addResourceNode(n: CoreResourceNode): CoreResourceNode {
    this._resourceNodes.push(n);
    return n;
  }

  addYarnPickup(p: CoreYarnPickup): CoreYarnPickup {
    this._yarnPickups.push(p);
    return p;
  }

  /** Identity splice (mirrors indexOf-based removal in MapEditor._removeFoundObject). */
  removeCatSpawn(ref: CoreCatSpawn): void {
    const idx = this._catSpawns.indexOf(ref);
    if (idx !== -1) this._catSpawns.splice(idx, 1);
  }

  removeResourceNode(ref: CoreResourceNode): void {
    const idx = this._resourceNodes.indexOf(ref);
    if (idx !== -1) this._resourceNodes.splice(idx, 1);
  }

  removeYarnPickup(ref: CoreYarnPickup): void {
    const idx = this._yarnPickups.indexOf(ref);
    if (idx !== -1) this._yarnPickups.splice(idx, 1);
  }

  // ── serialization ──────────────────────────────────────────────────────

  /**
   * Exact port of MapEditor.getMapData(): name/size/cellSize, shallow-copied
   * terrain rows, spawnPoints synthesized from playerSpawn+catSpawns,
   * resourceNodes/yarnPickups stripped of handles (there are none here).
   * Always produces schema-valid MapData shape (empty arrays at minimum).
   */
  toMapData(): MapData {
    const name = this._name ?? "untitled";
    const size = { ...this._size };
    const cellSize = this._cellSize;
    const terrain = this._terrain?.map((row) => [...row]) ?? [];

    const spawnPoints: SpawnPoint[] = [];
    if (this._playerSpawn) {
      spawnPoints.push({ x: this._playerSpawn.x, z: this._playerSpawn.z, role: "player" });
    }
    for (const s of this._catSpawns) {
      spawnPoints.push({ x: s.x, z: s.z, role: "cat" });
    }

    const resourceNodes: MapDataResourceNode[] = this._resourceNodes.map((n) => ({
      x: n.x,
      z: n.z,
      type: n.type,
      respawnTime: n.respawnTime,
    }));

    const yarnPickups: MapDataYarnPickup[] = this._yarnPickups.map((p) => ({
      x: p.x,
      z: p.z,
      yarnAmount: p.yarnAmount,
    }));

    return {
      name,
      size,
      terrain,
      cellSize,
      spawnPoints,
      resourceNodes,
      yarnPickups,
    };
  }
}
