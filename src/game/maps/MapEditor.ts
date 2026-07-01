import type {
  MapData,
  MapDataResourceNode,
  MapDataYarnPickup,
  TerrainCell,
} from "./MapData";
import type { CameraController } from "../engine/CameraController";
import type { MeshConfig, SceneHandle } from "../engine/SceneManager";
import { TerrainType, ResourceType } from "../types";
import { mapDataSchema } from "./MapDataSchema";
import { cellToWorld, worldToCell, cellMeshGeometry } from "./coords";

// ---------------------------------------------------------------------------
// MapEditor — developer-facing map editor, dev builds only.
//
// US-301: Base editor (Ctrl+E toggle, free camera, EDITOR MODE banner)
// US-302a: Terrain tool palette, ghost preview, block placement
// US-302b: Block selection, property editing (type/height), Delete key removal,
//          water zone drag-to-define with depth input.
// US-303: Entity placement — Player Spawn, Cat Spawn, Resource Node,
//         Hidden Terrain Zone, Yarn Pickup.
// US-304: Move tool (M), Delete tool (D), 1-9 palette shortcuts.
// US-315: Cell-aware snapping — blocks snap to cell centres via coords.ts helpers;
//         terrain is stored directly in terrain[][] (no parallel block/zone arrays).
//
// Gated by process.env.NODE_ENV === 'production'. Constructor returns early
// in production, leaving all element refs null and _active always false.
// ---------------------------------------------------------------------------

interface GameLifecycle {
  pause(): void;
  resume(): void;
}

// Minimal adapter for map DB operations — mirrors the map methods in GameTrpcAdapter
// (Game.ts). Defined here as a structural subset to avoid circular imports.
interface MapTrpcAdapter {
  mapList(): Promise<Array<{ id: number; name: string; isDefault: boolean; createdAt: Date }>>;
  mapGet(input: { id: number }): Promise<{ id: number; name: string; mapData: unknown; isDefault: boolean }>;
  mapSave(input: { id?: number; name: string; mapData: MapData }): Promise<{ id: number; name: string }>;
  mapSetDefault(input: { id: number }): Promise<void>;
  mapDelete(input: { id: number }): Promise<void>;
}

// Minimal user info the editor needs to determine admin status.
interface EditorUser {
  isAdmin: boolean;
}

// Minimal subset of SceneManager needed by the editor — avoids Three.js import.
interface SceneManagerLike {
  addMesh(config: MeshConfig): SceneHandle;
  removeMesh(handle: SceneHandle): void;
  updateTransform(
    handle: SceneHandle,
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number },
    scale: { x: number; y: number; z: number },
  ): void;
  screenToWorld(
    screenX: number,
    screenY: number,
    excludeHandles?: ReadonlySet<SceneHandle>,
  ): { x: number; y: number; z: number } | null;
  setMeshEmissive(handle: SceneHandle, color: string | number, intensity: number): void;
  setMeshColor(handle: SceneHandle, color: string | number): void;
  setTerrainGrid(totalWidth: number, totalDepth: number, cellSize: number): void;
  render(): void;
}

// Minimal subset of MapManager needed by the editor — avoids circular import.
interface MapManagerLike {
  loadMap(data: MapData): void;
  getMapData?(): MapData | null;
  unloadMap?(): void;
}

// ---------------------------------------------------------------------------
// Terrain block types — kept for backward-compat public API
// ---------------------------------------------------------------------------

/** @deprecated Editor terrain data now lives in terrain[][]; EditorBlock is a compat shim. */
export interface EditorBlock {
  x: number;
  z: number;
  type: TerrainType;
  height: number;
  handle: SceneHandle | null;
}

/** @deprecated Editor terrain data now lives in terrain[][]; EditorWaterZone is a compat shim. */
export interface EditorWaterZone {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  depth: number;
  handle: SceneHandle | null;
}

// ---------------------------------------------------------------------------
// Entity tool types (US-303)
// ---------------------------------------------------------------------------

export type EntityTool =
  | "playerSpawn"
  | "catSpawn"
  | "resourceNode"
  | "hiddenTerrain"
  | "yarnPickup";

// US-304: meta-tool modes that operate on already-placed objects.
export type EditorToolMode = "move" | "delete";

// Internal discriminated union for the object currently being moved.
type MovingObject =
  | { kind: "block"; obj: EditorBlock }
  | { kind: "playerSpawn"; obj: EditorPlayerSpawn }
  | { kind: "catSpawn"; obj: EditorCatSpawn }
  | { kind: "resourceNode"; obj: EditorResourceNode }
  | { kind: "yarnPickup"; obj: EditorYarnPickup };

export interface EditorPlayerSpawn {
  x: number;
  z: number;
  handle: SceneHandle | null;
}

export interface EditorCatSpawn {
  x: number;
  z: number;
  handle: SceneHandle | null;
}

export interface EditorResourceNode {
  x: number;
  z: number;
  type: ResourceType;
  respawnTime: number;
  handle: SceneHandle | null;
}

/** @deprecated Editor terrain data now lives in terrain[][]; EditorHiddenTerrainZone is a compat shim. */
export interface EditorHiddenTerrainZone {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  height: number;
  handle: SceneHandle | null;
}

export interface EditorYarnPickup {
  x: number;
  z: number;
  yarnAmount: number;
  handle: SceneHandle | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Colors matching MapManager TERRAIN_COLORS (kept in sync manually).
const EDITOR_TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.Grass]: "#4a7c59",
  [TerrainType.Dirt]: "#8b6355",
  [TerrainType.Stone]: "#6e7074",
  [TerrainType.Water]: "#1565c0",
  [TerrainType.Hidden]: "#1a1a2e",
};

// Only these four types are user-placeable from the terrain palette.
const PLACEABLE_TOOLS: readonly TerrainType[] = [
  TerrainType.Grass,
  TerrainType.Dirt,
  TerrainType.Stone,
  TerrainType.Water,
];

// Entity marker colors
const ENTITY_COLORS: Record<EntityTool, string> = {
  playerSpawn: "#ff6b35",   // orange — matches player color
  catSpawn: "#9b59b6",      // purple
  resourceNode: "#7bc67e",  // grass green (default; varies by resource type)
  hiddenTerrain: "#4a4a8a", // dark indigo
  yarnPickup: "#ffd700",    // gold
};

// Resource-type-specific colors for resource node markers
const RESOURCE_NODE_COLORS: Record<ResourceType, string> = {
  [ResourceType.Grass]: "#7bc67e",
  [ResourceType.Sticks]: "#8b6355",
  [ResourceType.Water]: "#4fc3f7",
};

// Default respawn times (seconds) — match Game.ts spawnTestMapResourceNodes()
export const RESOURCE_RESPAWN_DEFAULTS: Record<ResourceType, number> = {
  [ResourceType.Grass]: 30,
  [ResourceType.Sticks]: 45,
  [ResourceType.Water]: 60,
};

const ENTITY_TOOL_LABELS: Record<EntityTool, string> = {
  playerSpawn: "Player Spawn",
  catSpawn: "Cat Spawn",
  resourceNode: "Resource Node",
  hiddenTerrain: "Hidden Terrain",
  yarnPickup: "Yarn Pickup",
};

const HEIGHT_MIN = 0.5;
const HEIGHT_MAX = 5;
const HEIGHT_STEP = 0.5;
const SELECTION_EMISSIVE_COLOR = "#ffffff";
const SELECTION_EMISSIVE_INTENSITY = 0.4;
const DEFAULT_YARN_AMOUNT = 3;

// Default map dimensions (used when no map data is loaded)
const DEFAULT_MAP_SIZE = { width: 30, depth: 30 };
const DEFAULT_CELL_SIZE = 2;

// ---------------------------------------------------------------------------
// MapEditor class
// ---------------------------------------------------------------------------

export class MapEditor {
  private _active = false;
  private _mapData: MapData | null = null;
  private _banner: HTMLElement | null = null;
  private _panel: HTMLElement | null = null;

  // Map dimension tracking (set from _mapData on loadMapData)
  private _mapSize: { width: number; depth: number } = { ...DEFAULT_MAP_SIZE };
  private _cellSize: number = DEFAULT_CELL_SIZE;

  // The game's active map, captured on enable() so the game terrain can be
  // restored on disable(). While the editor is active it OWNS terrain rendering:
  // the game's terrain meshes are unloaded so editor edits are visible.
  private _gameMapBackup: MapData | null = null;

  // While active, the editor drives its own render loop. enable() pauses the
  // game loop (via gameLifecycle.pause), which also stops the game's rAF render
  // pass — so without this the canvas would never repaint and edits (placement,
  // height, selection highlight, camera movement) would be invisible.
  private _editorRafId: number | null = null;

  // Terrain tool state
  private _selectedTool: TerrainType | null = null;
  // _cellHandles replaces _editorBlocks — keyed "${col},${row}"
  private _cellHandles: Map<string, SceneHandle> = new Map();
  private _ghostHandle: SceneHandle | null = null;
  private _ghostX = 0;
  private _ghostZ = 0;

  // US-302b: selection & water zones
  // _selectedBlock is a compat shim pointing at terrain data
  private _selectedBlock: EditorBlock | null = null;
  private _selectedCell: { col: number; row: number } | null = null;
  private _waterDragStart: { col: number; row: number } | null = null;
  private _waterDragGhost: SceneHandle | null = null;
  private _suppressNextClick = false;
  private _selectedWaterDepth = 1;

  // Properties section DOM refs
  private _propertiesSection: HTMLElement | null = null;
  private _propPosDisplay: HTMLElement | null = null;
  private _propTypeSelect: HTMLSelectElement | null = null;
  private _propHeightInput: HTMLInputElement | null = null;

  // Water depth config DOM refs (Finding 3)
  private _waterConfigSection: HTMLElement | null = null;
  private _waterDepthInput: HTMLInputElement | null = null;

  private readonly _toolButtons = new Map<TerrainType, HTMLElement>();

  // US-303: Entity tool state
  private _selectedEntityTool: EntityTool | null = null;
  private readonly _entityToolButtons = new Map<EntityTool, HTMLElement>();
  private _selectedResourceNodeType: ResourceType = ResourceType.Grass;
  private _selectedRespawnTime: number = RESOURCE_RESPAWN_DEFAULTS[ResourceType.Grass];
  private _selectedHiddenTerrainHeight: number = 1;
  private _selectedYarnAmount: number = DEFAULT_YARN_AMOUNT;
  private _entityConfigSection: HTMLElement | null = null;

  // Entity collections
  private _playerSpawn: EditorPlayerSpawn | null = null;
  private _catSpawns: EditorCatSpawn[] = [];
  private _resourceNodes: EditorResourceNode[] = [];
  private _yarnPickups: EditorYarnPickup[] = [];

  // Hidden terrain drag state (mirrors water zone drag) — in cell coords
  private _hiddenDragStart: { col: number; row: number } | null = null;
  private _hiddenDragGhost: SceneHandle | null = null;

  // US-304: move / delete tool mode
  private _editorToolMode: EditorToolMode | null = null;
  private _movingObject: MovingObject | null = null;
  /** Cell origin of the block being dragged (for finalising block moves). */
  private _movingBlockOrigin: { col: number; row: number } | null = null;
  private _moveToolBtn: HTMLElement | null = null;
  private _deleteToolBtn: HTMLElement | null = null;

  // US-305: save / load / play
  private _errorDisplay: HTMLElement | null = null;
  private _statusDisplay: HTMLElement | null = null;

  // DB panel state (US-17)
  private _currentMapId: number | null = null;
  private _currentMapName: string = "untitled";
  private _mapNameInput: HTMLInputElement | null = null;
  private _mapListSelect: HTMLSelectElement | null = null;
  private _mapListCache: Array<{ id: number; name: string; isDefault: boolean; createdAt: Date }> = [];
  private _setDefaultBtn: HTMLButtonElement | null = null;
  private _deleteBtn: HTMLButtonElement | null = null;

  // Event handler refs
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private _mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private _mousedownHandler: ((e: MouseEvent) => void) | null = null;
  private _mouseupHandler: ((e: MouseEvent) => void) | null = null;
  private _clickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly cameraController: CameraController,
    private readonly gameLifecycle: GameLifecycle,
    private readonly sceneManager: SceneManagerLike | null = null,
    private readonly mapManager: MapManagerLike | null = null,
    private readonly _trpcAdapter: MapTrpcAdapter | null = null,
    private readonly _user: EditorUser | null = null,
  ) {
    if (process.env.NODE_ENV === "production") return;
    this._buildBanner();
    this._buildPanel();
    this._registerKeyboard();
    this._registerMouseHandlers();
  }

  // ── Public API — lifecycle ─────────────────────────────────────────────────

  enable(): void {
    if (!this._banner) return; // production guard (banner null in prod)
    if (this._active) return;
    this._active = true;
    // Take over terrain rendering from the running game. Load the game's active
    // map so placement/selection use the real grid (size + cellSize), render the
    // FULL editable grid, then unload the game's own terrain meshes so the
    // editor's cells are what's displayed and every edit (place, retype, raise)
    // is immediately visible. Without this the editor drew on top of the game's
    // terrain, so flat/height-0 edits were hidden and nothing appeared to change.
    if (this.mapManager?.getMapData) {
      const active = this.mapManager.getMapData();
      if (active) {
        this._gameMapBackup = active;
        this.loadMapData(active); // deep-copies into _mapData, renders non-default cells
        this._renderAllCells(); // fill in the remaining (default) cells for a full floor
        this.mapManager.unloadMap?.(); // editor now owns terrain display
      }
    }
    this.gameLifecycle.pause();
    this.cameraController.setMode("free");
    this._banner.style.display = "block";
    if (this._panel) this._panel.style.display = "flex";
    this._startEditorRenderLoop();
  }

  /**
   * Drive rendering while the editor is active. The game loop is paused on
   * enable(), which also halts its render pass, so the editor must repaint the
   * scene itself for edits and camera movement to be visible. No-ops where
   * requestAnimationFrame is unavailable (e.g. the node test environment).
   */
  private _startEditorRenderLoop(): void {
    if (typeof requestAnimationFrame === "undefined") return;
    if (this._editorRafId !== null) return;
    let last = typeof performance !== "undefined" ? performance.now() : 0;
    const tick = (now: number): void => {
      if (!this._active) {
        this._editorRafId = null;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      this.cameraController.update(dt);
      this.sceneManager?.render();
      this._editorRafId = requestAnimationFrame(tick);
    };
    this._editorRafId = requestAnimationFrame(tick);
  }

  private _stopEditorRenderLoop(): void {
    if (this._editorRafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this._editorRafId);
    }
    this._editorRafId = null;
  }

  disable(): void {
    if (!this._active) return;
    this._active = false;
    this._stopEditorRenderLoop();
    this.selectBlock(null);
    this._cancelMoveDrag();
    if (this._editorToolMode !== null) {
      this._editorToolMode = null;
      this._updateEditorToolModeButtons();
    }
    this.cameraController.setMode("follow");
    this.gameLifecycle.resume();
    if (this._banner) this._banner.style.display = "none";
    if (this._panel) this._panel.style.display = "none";
    this._removeGhost();
    this._cancelWaterDrag();
    this._cancelHiddenDrag();
    // Hand terrain rendering back to the game. Restore the game's terrain from
    // the captured backup (playMap() clears the backup first so an applied map
    // is not reverted), then clear the editor's own meshes so they don't overlap
    // the restored game terrain. _clearEditorState() also resets _mapData so the
    // next enable() reloads a fresh copy of the (possibly updated) game map.
    if (this._gameMapBackup && this.mapManager) {
      this.mapManager.loadMap(this._gameMapBackup);
    }
    this._gameMapBackup = null;
    this._clearEditorState();
  }

  isActive(): boolean {
    return this._active;
  }

  getMapData(): MapData {
    // Base shape: preserve name/size/cellSize/terrain from _mapData; otherwise sensible defaults.
    const base = this._mapData;
    const name = base?.name ?? "untitled";
    const size = { ...this._mapSize };
    const cellSize = this._cellSize;
    // Return the live terrain[][] directly (shallow copy rows)
    const terrain = base?.terrain.map((row) => [...row]) ?? [];

    // Serialize spawn points from live editor collections (no handles in output).
    const spawnPoints = [];
    if (this._playerSpawn) {
      spawnPoints.push({ x: this._playerSpawn.x, z: this._playerSpawn.z, role: "player" as const });
    }
    for (const s of this._catSpawns) {
      spawnPoints.push({ x: s.x, z: s.z, role: "cat" as const });
    }

    // Serialize resource nodes and yarn pickups (now required fields on MapData).
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

  loadMapData(data: MapData): void {
    // Clear existing editor state and scene meshes before rebuilding.
    this._clearEditorState();

    // Set dimension fields from loaded data.
    this._mapSize = { ...data.size };
    this._cellSize = data.cellSize;

    // Keep base metadata in sync (deep copy terrain rows).
    this._mapData = { ...data, terrain: data.terrain.map((row) => [...row]) };

    // Rebuild cell meshes from terrain[][]
    for (let row = 0; row < data.terrain.length; row++) {
      for (let col = 0; col < (data.terrain[row]?.length ?? 0); col++) {
        const cell = data.terrain[row]![col]!;
        // Only create a mesh for non-default cells to avoid thousands of flat meshes.
        if (cell.height > 0 || cell.type !== TerrainType.Grass) {
          this._setCellMesh(col, row);
        }
      }
    }

    // Rebuild spawn points.
    for (const sp of data.spawnPoints) {
      if (sp.role === "player") {
        const handle = this._createEntityMarkerMesh(sp.x, sp.z, ENTITY_COLORS.playerSpawn);
        this._playerSpawn = { x: sp.x, z: sp.z, handle };
      } else if (sp.role === "cat") {
        const handle = this._createEntityMarkerMesh(sp.x, sp.z, ENTITY_COLORS.catSpawn);
        this._catSpawns.push({ x: sp.x, z: sp.z, handle });
      }
    }

    // Rebuild resource nodes and yarn pickups from map data.
    for (const rn of data.resourceNodes) {
      const color = RESOURCE_NODE_COLORS[rn.type];
      const handle = this._createEntityMarkerMesh(rn.x, rn.z, color);
      this._resourceNodes.push({ x: rn.x, z: rn.z, type: rn.type, respawnTime: rn.respawnTime, handle });
    }

    for (const yp of data.yarnPickups) {
      const handle = this._createEntityMarkerMesh(yp.x, yp.z, ENTITY_COLORS.yarnPickup);
      this._yarnPickups.push({ x: yp.x, z: yp.z, yarnAmount: yp.yarnAmount, handle });
    }
  }

  /**
   * Tear down all live editor collections and remove their scene meshes.
   * Used by loadMapData() before rebuilding and by dispose().
   */
  private _clearEditorState(): void {
    // Cell terrain meshes (replaces _editorBlocks + _editorWaterZones + _hiddenTerrainZones)
    for (const handle of this._cellHandles.values()) {
      if (this.sceneManager) this.sceneManager.removeMesh(handle);
    }
    this._cellHandles.clear();
    this._selectedCell = null;
    this._selectedBlock = null;
    this._mapData = null;

    // Spawns and entities
    if (this._playerSpawn?.handle && this.sceneManager) {
      this.sceneManager.removeMesh(this._playerSpawn.handle);
    }
    this._playerSpawn = null;

    for (const s of this._catSpawns) {
      if (s.handle && this.sceneManager) this.sceneManager.removeMesh(s.handle);
    }
    this._catSpawns = [];

    for (const n of this._resourceNodes) {
      if (n.handle && this.sceneManager) this.sceneManager.removeMesh(n.handle);
    }
    this._resourceNodes = [];

    for (const p of this._yarnPickups) {
      if (p.handle && this.sceneManager) this.sceneManager.removeMesh(p.handle);
    }
    this._yarnPickups = [];
  }

  // ── Public API — US-305/17: DB save / load / play ─────────────────────────

  /**
   * Save the current map to the database.
   * On first save (no _currentMapId) a new row is created; subsequent calls
   * update the existing row.  The returned id is stored and reused across saves.
   */
  async saveMapToDB(name?: string): Promise<void> {
    if (!this._trpcAdapter) {
      this._showError("No DB adapter available");
      return;
    }
    const saveName = name ?? this._mapNameInput?.value ?? this._currentMapName;
    try {
      const result = await this._trpcAdapter.mapSave({
        id: this._currentMapId ?? undefined,
        name: saveName,
        mapData: this.getMapData(),
      });
      this._currentMapId = result.id;
      this._currentMapName = result.name;
      if (this._mapNameInput) this._mapNameInput.value = result.name;
      this._showError(null);
      this._showStatus("Saved");
    } catch (err: unknown) {
      this._showError(err instanceof Error ? err.message : "Save failed");
    }
  }

  /**
   * Refresh the internal map list from the database.
   */
  async refreshMapList(): Promise<void> {
    if (!this._trpcAdapter) {
      this._showError("No DB adapter available");
      return;
    }
    try {
      const list = await this._trpcAdapter.mapList();
      this._mapListCache = list;
      this._populateMapListSelect(list);
      this._showError(null);
      this._updateDeleteButton();
    } catch (err: unknown) {
      this._showError(err instanceof Error ? err.message : "Failed to load map list");
    }
  }

  /**
   * Load a map by id from the database and apply it to the editor.
   */
  async loadMapFromDB(id: number): Promise<void> {
    if (!this._trpcAdapter) {
      this._showError("No DB adapter available");
      return;
    }
    try {
      const row = await this._trpcAdapter.mapGet({ id });
      const result = mapDataSchema.safeParse(row.mapData);
      if (!result.success) {
        const msg = result.error.issues[0]?.message ?? "schema validation failed";
        this._showError(`Invalid map data: ${msg}`);
        return;
      }
      this._showError(null);
      this.loadMapData(result.data);
      this._currentMapId = row.id;
      this._currentMapName = row.name;
      if (this._mapNameInput) this._mapNameInput.value = row.name;
      this._showStatus("Loaded");
    } catch (err: unknown) {
      this._showError(err instanceof Error ? err.message : "Load failed");
    }
  }

  /**
   * Set the currently loaded map as the default map.
   */
  async setCurrentMapAsDefault(): Promise<void> {
    if (!this._trpcAdapter || this._currentMapId === null) {
      this._showError("No map loaded");
      return;
    }
    try {
      await this._trpcAdapter.mapSetDefault({ id: this._currentMapId });
      this._showError(null);
      this._showStatus("Set as default");
      await this.refreshMapList();
    } catch (err: unknown) {
      this._showError(err instanceof Error ? err.message : "Set default failed");
    }
  }

  /**
   * Delete the currently loaded map from the database.
   * Client-side guard mirrors server-side: blocks delete for default or only map.
   */
  async deleteCurrentMap(): Promise<void> {
    if (!this._trpcAdapter || this._currentMapId === null) {
      this._showError("No map loaded");
      return;
    }
    if (this.isDeleteDisabled()) {
      this._showError("Cannot delete the default map or the only map");
      return;
    }
    try {
      await this._trpcAdapter.mapDelete({ id: this._currentMapId });
      this._currentMapId = null;
      this._showError(null);
      this._showStatus("Deleted");
      await this.refreshMapList();
    } catch (err: unknown) {
      this._showError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  /**
   * Returns true if delete should be blocked (mirrors server guard).
   * Blocked when: no map loaded, current map is default, or only one map in list.
   */
  isDeleteDisabled(): boolean {
    if (this._currentMapId === null) return true;
    const list = this._mapListCache;
    if (list.length <= 1) return true;
    const current = list.find((m) => m.id === this._currentMapId);
    if (current?.isDefault) return true;
    return false;
  }

  /** Load the current editor map into the game and exit editor mode. */
  playMap(): void {
    if (!this.mapManager) return;
    const data = this.getMapData();
    this.mapManager.loadMap(data);
    if (this.sceneManager) {
      this.sceneManager.setTerrainGrid(data.size.width, data.size.depth, data.cellSize);
    }
    // The edited map is now the game's terrain; clear the backup so disable()
    // does not revert it back to the pre-edit map.
    this._gameMapBackup = null;
    this.disable();
  }

  /**
   * Ensure every cell in the current terrain grid has a scene mesh. loadMapData()
   * renders only non-default cells (to keep JSON loads cheap); when the editor
   * owns terrain display it must also render the default cells so the full floor
   * is visible and selectable.
   */
  private _renderAllCells(): void {
    const terrain = this._mapData?.terrain;
    if (!terrain || !this.sceneManager) return;
    for (let row = 0; row < terrain.length; row++) {
      const cols = terrain[row]?.length ?? 0;
      for (let col = 0; col < cols; col++) {
        if (!this._cellHandles.has(`${col},${row}`)) this._setCellMesh(col, row);
      }
    }
  }

  // ── Public API — terrain tools ────────────────────────────────────────────

  /** Currently selected terrain tool, or null if none. */
  getSelectedTool(): TerrainType | null {
    return this._selectedTool;
  }

  /** Select a terrain tool from the palette. Pass null to deselect. Clears entity tool and editor mode. */
  selectTool(type: TerrainType | null): void {
    // Deselect entity tool when terrain tool is selected
    if (type !== null && this._selectedEntityTool !== null) {
      this._selectedEntityTool = null;
      this._updateEntityToolButtons();
      this._updateEntityConfigSection();
    }
    // Deselect editor tool mode
    if (type !== null && this._editorToolMode !== null) {
      this._editorToolMode = null;
      this._cancelMoveDrag();
      this._updateEditorToolModeButtons();
    }
    this._selectedTool = type;
    if (type === null) this._removeGhost();
    this._updateToolButtons();
    this._updateWaterConfigSection();
  }

  /**
   * Read-only view of placed editor blocks (compat shim — derived from terrain[][]).
   * Returns non-default cells (type != Grass or height != 0) as EditorBlock entries.
   */
  getEditorBlocks(): readonly EditorBlock[] {
    if (!this._mapData) return [];
    const blocks: EditorBlock[] = [];
    for (let row = 0; row < this._mapData.terrain.length; row++) {
      const terrainRow = this._mapData.terrain[row];
      if (!terrainRow) continue;
      for (let col = 0; col < terrainRow.length; col++) {
        const cell = terrainRow[col];
        if (!cell) continue;
        if (cell.type === TerrainType.Grass && cell.height === 0) continue;
        const { x, z } = this._cellCenter(col, row);
        const key = `${col},${row}`;
        blocks.push({
          x,
          z,
          type: cell.type,
          height: cell.height,
          handle: this._cellHandles.get(key) ?? null,
        });
      }
    }
    return blocks;
  }

  /**
   * Place a block at the given world position using the currently selected
   * tool. The position is snapped to the cell grid before placement.
   * If a cell already has content, its type is updated instead.
   */
  placeBlock(worldX: number, worldZ: number): void {
    if (this._selectedTool === null) return;
    const { col, row } = this._snapToCell(worldX, worldZ);
    // Ensure terrain is initialised
    this._ensureTerrain();
    const terrain = this._mapData?.terrain;
    if (!terrain?.[row]?.[col]) return;

    terrain[row]![col]! = {
      type: this._selectedTool,
      height: terrain[row]![col]!.height > 0 ? terrain[row]![col]!.height : 0,
      navigable: this._selectedTool !== TerrainType.Water && this._selectedTool !== TerrainType.Hidden,
    };

    this._setCellMesh(col, row);
  }

  /** Snap a world coordinate to the nearest integer (1u grid). Static — preserved for compat. */
  static snapToGrid(worldPos: number): number {
    return Math.round(worldPos);
  }

  // ── Public API — block selection (US-302b) ────────────────────────────────

  /** Select a placed block, applying a visual highlight. Pass null to deselect. */
  selectBlock(block: EditorBlock | null): void {
    if (this._selectedBlock?.handle && this.sceneManager) {
      this.sceneManager.setMeshEmissive(this._selectedBlock.handle, "#000000", 0);
    }
    this._selectedBlock = block;
    if (block?.handle && this.sceneManager) {
      this.sceneManager.setMeshEmissive(
        block.handle,
        SELECTION_EMISSIVE_COLOR,
        SELECTION_EMISSIVE_INTENSITY,
      );
    }
    // Sync _selectedCell from block position
    if (block) {
      this._selectedCell = this._snapToCell(block.x, block.z);
    } else {
      this._selectedCell = null;
    }
    this._updatePropertiesSection();
  }

  getSelectedBlock(): EditorBlock | null {
    return this._selectedBlock;
  }

  /** Update the terrain type of the currently selected block. */
  updateSelectedBlockType(type: TerrainType): void {
    if (!this._selectedBlock || !this._selectedCell) return;
    const { col, row } = this._selectedCell;
    const terrain = this._mapData?.terrain;
    if (!terrain?.[row]?.[col]) return;

    terrain[row]![col]!.type = type;
    this._selectedBlock.type = type;
    this._setCellMesh(col, row);
    // Update the compat block's handle reference after mesh recreation
    const key = `${col},${row}`;
    this._selectedBlock.handle = this._cellHandles.get(key) ?? null;
    this._updatePropertiesSection();
  }

  /**
   * Update the height of the currently selected block.
   * Clamped to [HEIGHT_MIN, HEIGHT_MAX]. The mesh is recreated.
   */
  updateSelectedBlockHeight(height: number): void {
    if (!this._selectedBlock || !this._selectedCell) return;
    const clamped = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, height));
    const { col, row } = this._selectedCell;
    const terrain = this._mapData?.terrain;
    if (!terrain?.[row]?.[col]) return;

    terrain[row]![col]!.height = clamped;
    this._selectedBlock.height = clamped;
    this._setCellMesh(col, row);
    // Update the compat block's handle reference after mesh recreation
    const key = `${col},${row}`;
    this._selectedBlock.handle = this._cellHandles.get(key) ?? null;
    this._updatePropertiesSection();
  }

  /** Remove the currently selected block from editor state and scene. */
  deleteSelectedBlock(): void {
    if (!this._selectedBlock || !this._selectedCell) return;
    const { col, row } = this._selectedCell;
    const key = `${col},${row}`;

    // Remove mesh
    const handle = this._cellHandles.get(key);
    if (handle && this.sceneManager) this.sceneManager.removeMesh(handle);
    this._cellHandles.delete(key);

    // Reset terrain cell to default
    const terrain = this._mapData?.terrain;
    if (terrain?.[row]?.[col]) {
      terrain[row]![col]! = { type: TerrainType.Grass, height: 0, navigable: true };
    }

    this._selectedBlock = null;
    this._selectedCell = null;
    this._updatePropertiesSection();
  }

  /**
   * Read-only view of placed water zones (compat shim — derived from terrain[][]).
   * Returns rects of contiguous Water cells as EditorWaterZone entries.
   * Note: this is a simplified scanner that returns one zone per Water cell,
   * which is sufficient for the compat API.
   */
  getEditorWaterZones(): readonly EditorWaterZone[] {
    if (!this._mapData) return [];
    const zones: EditorWaterZone[] = [];
    for (let row = 0; row < this._mapData.terrain.length; row++) {
      const terrainRow = this._mapData.terrain[row];
      if (!terrainRow) continue;
      for (let col = 0; col < terrainRow.length; col++) {
        const cell = terrainRow[col];
        if (!cell || cell.type !== TerrainType.Water) continue;
        const { x, z } = this._cellCenter(col, row);
        const key = `${col},${row}`;
        zones.push({
          x1: x,
          z1: z,
          x2: x,
          z2: z,
          depth: cell.depth ?? this._selectedWaterDepth,
          handle: this._cellHandles.get(key) ?? null,
        });
      }
    }
    return zones;
  }

  /**
   * Define a rectangular water zone from two corner world/grid coordinates.
   * Internally converts to cell coords and paints each cell in terrain[][].
   */
  createWaterZone(x1: number, z1: number, x2: number, z2: number): void {
    const c1 = this._snapToCell(x1, z1);
    const c2 = this._snapToCell(x2, z2);
    const minCol = Math.min(c1.col, c2.col);
    const maxCol = Math.max(c1.col, c2.col);
    const minRow = Math.min(c1.row, c2.row);
    const maxRow = Math.max(c1.row, c2.row);

    this._ensureTerrain();
    const terrain = this._mapData?.terrain;
    if (!terrain) return;

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!terrain[row]?.[col]) continue;
        terrain[row]![col]! = {
          type: TerrainType.Water,
          height: 0,
          navigable: false,
          depth: this._selectedWaterDepth,
        };
        this._setCellMesh(col, row);
      }
    }
  }

  /** Get the current water depth setting (used when creating water zones). */
  getSelectedWaterDepth(): number {
    return this._selectedWaterDepth;
  }

  /** Set the water depth for subsequent createWaterZone() calls. Clamped to [0.5, 10]. */
  setSelectedWaterDepth(depth: number): void {
    this._selectedWaterDepth = Math.max(0.5, Math.min(10, depth));
  }

  // ── Public API — entity tools (US-303) ────────────────────────────────────

  /** Currently selected entity tool, or null if none. */
  getSelectedEntityTool(): EntityTool | null {
    return this._selectedEntityTool;
  }

  /** Select an entity tool. Pass null to deselect. Clears terrain tool and editor mode. */
  selectEntityTool(tool: EntityTool | null): void {
    // Deselect terrain tool when entity tool is selected
    if (tool !== null && this._selectedTool !== null) {
      this._selectedTool = null;
      this._removeGhost();
      this._updateToolButtons();
    }
    // Deselect editor tool mode
    if (tool !== null && this._editorToolMode !== null) {
      this._editorToolMode = null;
      this._cancelMoveDrag();
      this._updateEditorToolModeButtons();
    }
    this._selectedEntityTool = tool;
    // Reset resource defaults when switching entity tools
    if (tool === "resourceNode") {
      this._selectedRespawnTime = RESOURCE_RESPAWN_DEFAULTS[this._selectedResourceNodeType];
    }
    this._updateEntityToolButtons();
    this._updateEntityConfigSection();
  }

  /**
   * Place an entity at the given world position using the currently selected
   * entity tool. Position is snapped to the cell center before placement.
   * Hidden terrain zones use drag-to-define and are not placed via this method.
   */
  placeEntity(worldX: number, worldZ: number): void {
    if (this._selectedEntityTool === null || this._selectedEntityTool === "hiddenTerrain") return;
    const { col, row } = this._snapToCell(worldX, worldZ);
    const { x, z } = this._cellCenter(col, row);

    switch (this._selectedEntityTool) {
      case "playerSpawn":
        this._placePlayerSpawn(x, z);
        break;
      case "catSpawn":
        this._placeCatSpawn(x, z);
        break;
      case "resourceNode":
        this._placeResourceNode(x, z);
        break;
      case "yarnPickup":
        this._placeYarnPickup(x, z);
        break;
    }
  }

  /** The single player spawn point, or null if not yet placed. */
  getPlayerSpawn(): EditorPlayerSpawn | null {
    return this._playerSpawn;
  }

  /** Read-only view of placed cat spawn points. */
  getCatSpawns(): readonly EditorCatSpawn[] {
    return this._catSpawns;
  }

  /** Read-only view of placed resource nodes. */
  getResourceNodes(): readonly EditorResourceNode[] {
    return this._resourceNodes;
  }

  /**
   * Read-only view of hidden terrain zones (compat shim — derived from terrain[][]).
   */
  getEditorHiddenTerrainZones(): readonly EditorHiddenTerrainZone[] {
    if (!this._mapData) return [];
    const zones: EditorHiddenTerrainZone[] = [];
    for (let row = 0; row < this._mapData.terrain.length; row++) {
      const terrainRow = this._mapData.terrain[row];
      if (!terrainRow) continue;
      for (let col = 0; col < terrainRow.length; col++) {
        const cell = terrainRow[col];
        if (!cell || cell.type !== TerrainType.Hidden) continue;
        const { x, z } = this._cellCenter(col, row);
        const key = `${col},${row}`;
        zones.push({
          x1: x,
          z1: z,
          x2: x,
          z2: z,
          height: cell.height,
          handle: this._cellHandles.get(key) ?? null,
        });
      }
    }
    return zones;
  }

  /** Read-only view of placed yarn pickups. */
  getYarnPickups(): readonly EditorYarnPickup[] {
    return this._yarnPickups;
  }

  /**
   * Define a rectangular hidden terrain zone from two corner world/grid coordinates.
   * Internally converts to cell coords and paints each cell in terrain[][].
   */
  createHiddenTerrainZone(x1: number, z1: number, x2: number, z2: number): void {
    const c1 = this._snapToCell(x1, z1);
    const c2 = this._snapToCell(x2, z2);
    const minCol = Math.min(c1.col, c2.col);
    const maxCol = Math.max(c1.col, c2.col);
    const minRow = Math.min(c1.row, c2.row);
    const maxRow = Math.max(c1.row, c2.row);

    this._ensureTerrain();
    const terrain = this._mapData?.terrain;
    if (!terrain) return;

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!terrain[row]?.[col]) continue;
        terrain[row]![col]! = {
          type: TerrainType.Hidden,
          height: this._selectedHiddenTerrainHeight,
          navigable: false,
        };
        this._setCellMesh(col, row);
      }
    }
  }

  // ── Public API — move / delete tools (US-304) ─────────────────────────────

  /** Current editor tool mode (move or delete), or null if neither is active. */
  getEditorToolMode(): EditorToolMode | null {
    return this._editorToolMode;
  }

  /**
   * Activate a meta-tool mode. Setting a mode clears any selected terrain or
   * entity tool. Setting null cancels the active mode and any in-progress drag.
   */
  setEditorToolMode(mode: EditorToolMode | null): void {
    if (mode !== null) {
      if (this._selectedTool !== null) {
        this._selectedTool = null;
        this._removeGhost();
        this._updateToolButtons();
      }
      if (this._selectedEntityTool !== null) {
        this._selectedEntityTool = null;
        this._updateEntityToolButtons();
        this._updateEntityConfigSection();
      }
    }
    if (mode === null) {
      this._cancelMoveDrag();
    }
    this._editorToolMode = mode;
    this._updateEditorToolModeButtons();
  }

  /**
   * Delete the first placed object (block or point entity) found at the given
   * world position. Position is snapped to the cell grid before lookup.
   */
  deleteObjectAtPosition(worldX: number, worldZ: number): void {
    const { col, row } = this._snapToCell(worldX, worldZ);
    const { x, z } = this._cellCenter(col, row);
    const found = this._findPointObjectAt(x, z, col, row);
    if (!found) return;
    this._removeFoundObject(found, col, row);
  }

  // ── dispose ────────────────────────────────────────────────────────────────

  dispose(): void {
    this._stopEditorRenderLoop();
    if (this._keydownHandler) {
      document.removeEventListener("keydown", this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this._mouseMoveHandler) {
      this.container.removeEventListener("mousemove", this._mouseMoveHandler);
      this._mouseMoveHandler = null;
    }
    if (this._mousedownHandler) {
      this.container.removeEventListener("mousedown", this._mousedownHandler);
      this._mousedownHandler = null;
    }
    if (this._mouseupHandler) {
      this.container.removeEventListener("mouseup", this._mouseupHandler);
      this._mouseupHandler = null;
    }
    if (this._clickHandler) {
      this.container.removeEventListener("click", this._clickHandler);
      this._clickHandler = null;
    }

    // Clear ALL editor collections (including cell handles) and remove their meshes.
    this._clearEditorState();
    this._cancelWaterDrag();
    this._cancelHiddenDrag();
    this._cancelMoveDrag();
    this._editorToolMode = null;
    if (this._banner) {
      this._banner.remove();
      this._banner = null;
    }
    if (this._panel) {
      this._panel.remove();
      this._panel = null;
    }
    this._errorDisplay = null;
    this._statusDisplay = null;
    this._mapNameInput = null;
    this._mapListSelect = null;
    this._setDefaultBtn = null;
    this._deleteBtn = null;
    this._removeGhost();
    this._active = false;
  }

  // ── Private — coordinate helpers ──────────────────────────────────────────

  /** Snap world (x, z) to the nearest cell (col, row). */
  private _snapToCell(worldX: number, worldZ: number): { col: number; row: number } {
    return worldToCell(worldX, worldZ, this._cellSize, this._mapSize.width, this._mapSize.depth);
  }

  /** Convert cell (col, row) to world-space center coordinates. */
  private _cellCenter(col: number, row: number): { x: number; z: number } {
    return cellToWorld(col, row, this._cellSize, this._mapSize.width, this._mapSize.depth);
  }

  // ── Private — cell mesh helpers ────────────────────────────────────────────

  /**
   * Create or replace the cell mesh for (col, row) based on terrain[][].
   * Uses cellMeshGeometry for vertical alignment and cellSize for footprint.
   */
  private _setCellMesh(col: number, row: number): void {
    const key = `${col},${row}`;
    const cell = this._mapData?.terrain[row]?.[col];
    if (!cell || !this.sceneManager) return;

    // Remove old mesh if present
    const old = this._cellHandles.get(key);
    if (old) this.sceneManager.removeMesh(old);

    const { x, z } = this._cellCenter(col, row);
    const { boxHeight, centerY } = cellMeshGeometry(cell.height);
    const color = EDITOR_TERRAIN_COLORS[cell.type];

    const handle = this.sceneManager.addMesh({
      geometry: "box",
      dims: [this._cellSize, boxHeight, this._cellSize],
      color,
    });
    this.sceneManager.updateTransform(
      handle,
      { x, y: centerY, z },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    );
    this._cellHandles.set(key, handle);
  }

  /**
   * Lazily initialise terrain[][] if _mapData is null.
   * Uses the current _mapSize and _cellSize.
   */
  private _ensureTerrain(): void {
    if (this._mapData) return;
    const rows = Math.round(this._mapSize.depth / this._cellSize);
    const cols = Math.round(this._mapSize.width / this._cellSize);
    this._mapData = {
      name: "untitled",
      size: { ...this._mapSize },
      cellSize: this._cellSize,
      terrain: Array.from({ length: rows }, () =>
        Array.from({ length: cols }, (): TerrainCell => ({
          type: TerrainType.Grass,
          height: 0,
          navigable: true,
        }))
      ),
      spawnPoints: [],
      resourceNodes: [],
      yarnPickups: [],
    };
  }

  // ── Private — DOM construction ─────────────────────────────────────────────

  private _buildBanner(): void {
    const banner = document.createElement("div");
    banner.style.cssText =
      "position:absolute;top:0;left:50%;transform:translateX(-50%);" +
      "background:rgba(255,200,0,0.92);color:#000;padding:6px 18px;" +
      "font-family:monospace;font-size:13px;font-weight:bold;letter-spacing:2px;" +
      "border-bottom-left-radius:8px;border-bottom-right-radius:8px;" +
      "z-index:9998;display:none;pointer-events:none;user-select:none;";
    banner.textContent = "EDITOR MODE";
    const parent = this.container.parentElement ?? document.body;
    parent.appendChild(banner);
    this._banner = banner;
  }

  private _buildPanel(): void {
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:absolute;left:0;top:0;height:100%;width:160px;" +
      "background:rgba(20,20,30,0.92);color:#fff;padding:12px 8px;" +
      "font-family:monospace;font-size:12px;display:none;flex-direction:column;" +
      "gap:8px;z-index:9997;box-sizing:border-box;overflow-y:auto;";

    // Terrain section
    const terrainTitle = document.createElement("div");
    terrainTitle.style.cssText =
      "font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:4px;";
    terrainTitle.textContent = "Terrain";
    panel.appendChild(terrainTitle);

    for (const type of PLACEABLE_TOOLS) {
      panel.appendChild(this._buildToolButton(type));
    }

    panel.appendChild(this._buildWaterConfigSection());
    panel.appendChild(this._buildPropertiesSection());

    // Entities section (US-303)
    const entitySeparator = document.createElement("div");
    entitySeparator.style.cssText = "border-top:1px solid #444;margin-top:4px;";
    panel.appendChild(entitySeparator);

    const entityTitle = document.createElement("div");
    entityTitle.style.cssText =
      "font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:4px;margin-top:4px;";
    entityTitle.textContent = "Entities";
    panel.appendChild(entityTitle);

    const entityTools: EntityTool[] = [
      "playerSpawn",
      "catSpawn",
      "resourceNode",
      "hiddenTerrain",
      "yarnPickup",
    ];
    for (const tool of entityTools) {
      panel.appendChild(this._buildEntityToolButton(tool));
    }

    panel.appendChild(this._buildEntityConfigSection());

    // US-304: Move / Delete tool buttons
    const toolsSep = document.createElement("div");
    toolsSep.style.cssText = "border-top:1px solid #444;margin-top:4px;";
    panel.appendChild(toolsSep);

    const toolsTitle = document.createElement("div");
    toolsTitle.style.cssText =
      "font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:4px;margin-top:4px;";
    toolsTitle.textContent = "Tools";
    panel.appendChild(toolsTitle);

    const moveBtn = document.createElement("button");
    moveBtn.style.cssText =
      "width:100%;padding:6px 8px;background:#2a2a3e;border:1px solid #444;" +
      "border-radius:4px;color:#fff;font-family:monospace;font-size:11px;" +
      "cursor:pointer;text-align:left;margin-bottom:4px;";
    moveBtn.textContent = "Move  [M]";
    moveBtn.addEventListener("click", () => {
      this.setEditorToolMode(this._editorToolMode === "move" ? null : "move");
    });
    this._moveToolBtn = moveBtn;
    panel.appendChild(moveBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.style.cssText =
      "width:100%;padding:6px 8px;background:#2a2a3e;border:1px solid #444;" +
      "border-radius:4px;color:#fff;font-family:monospace;font-size:11px;" +
      "cursor:pointer;text-align:left;";
    deleteBtn.textContent = "Delete  [D]";
    deleteBtn.addEventListener("click", () => {
      this.setEditorToolMode(this._editorToolMode === "delete" ? null : "delete");
    });
    this._deleteToolBtn = deleteBtn;
    panel.appendChild(deleteBtn);

    // US-17: Database section (replaces JSON file save/load)
    const dbSep = document.createElement("div");
    dbSep.style.cssText = "border-top:1px solid #444;margin-top:4px;";
    panel.appendChild(dbSep);

    const dbTitle = document.createElement("div");
    dbTitle.style.cssText =
      "font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:4px;margin-top:4px;";
    dbTitle.textContent = "Database";
    panel.appendChild(dbTitle);

    const isAdmin = this._user?.isAdmin ?? false;

    // Name input
    const nameLabel = document.createElement("div");
    nameLabel.style.cssText = "font-size:10px;color:#aaa;margin-bottom:2px;";
    nameLabel.textContent = "Map name:";
    panel.appendChild(nameLabel);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = this._currentMapName;
    nameInput.style.cssText =
      "width:100%;background:#2a2a3e;color:#fff;border:1px solid #444;" +
      "border-radius:3px;font-size:10px;padding:2px;margin-bottom:4px;box-sizing:border-box;";
    if (!isAdmin) nameInput.disabled = true;
    this._mapNameInput = nameInput as unknown as HTMLInputElement;
    panel.appendChild(nameInput);

    // Save button
    const dbSaveBtn = document.createElement("button");
    dbSaveBtn.style.cssText =
      "width:100%;padding:6px 8px;background:#2a4a2a;border:1px solid #4a8;" +
      "border-radius:4px;color:#fff;font-family:monospace;font-size:11px;" +
      "cursor:pointer;text-align:left;margin-bottom:4px;";
    dbSaveBtn.textContent = "Save to DB";
    if (!isAdmin) {
      dbSaveBtn.disabled = true;
      dbSaveBtn.title = "Admin only";
    }
    dbSaveBtn.addEventListener("click", () => {
      dbSaveBtn.disabled = true;
      void this.saveMapToDB().finally(() => {
        dbSaveBtn.disabled = !isAdmin;
      });
    });
    panel.appendChild(dbSaveBtn);

    // Separator
    const listSep = document.createElement("div");
    listSep.style.cssText = "border-top:1px solid #333;margin-top:4px;margin-bottom:4px;";
    panel.appendChild(listSep);

    // Refresh list button
    const refreshBtn = document.createElement("button");
    refreshBtn.style.cssText =
      "width:100%;padding:6px 8px;background:#2a2a3e;border:1px solid #444;" +
      "border-radius:4px;color:#fff;font-family:monospace;font-size:11px;" +
      "cursor:pointer;text-align:left;margin-bottom:4px;";
    refreshBtn.textContent = "Refresh List";
    refreshBtn.addEventListener("click", () => {
      refreshBtn.disabled = true;
      void this.refreshMapList().finally(() => {
        refreshBtn.disabled = false;
      });
    });
    panel.appendChild(refreshBtn);

    // Map list select
    const mapSelect = document.createElement("select");
    mapSelect.style.cssText =
      "width:100%;background:#2a2a3e;color:#fff;border:1px solid #444;" +
      "border-radius:3px;font-size:10px;padding:2px;margin-bottom:4px;";
    this._mapListSelect = mapSelect as unknown as HTMLSelectElement;
    panel.appendChild(mapSelect);

    // Load selected button
    const loadSelectedBtn = document.createElement("button");
    loadSelectedBtn.style.cssText =
      "width:100%;padding:6px 8px;background:#2a2a4a;border:1px solid #44a;" +
      "border-radius:4px;color:#fff;font-family:monospace;font-size:11px;" +
      "cursor:pointer;text-align:left;margin-bottom:4px;";
    loadSelectedBtn.textContent = "Load Selected";
    loadSelectedBtn.addEventListener("click", () => {
      const idStr = (this._mapListSelect as unknown as HTMLSelectElement | null)?.value;
      if (!idStr) return;
      const id = parseInt(idStr, 10);
      if (isNaN(id)) return;
      loadSelectedBtn.disabled = true;
      void this.loadMapFromDB(id).finally(() => {
        loadSelectedBtn.disabled = false;
        this._updateDeleteButton();
        this._updateSetDefaultButton();
      });
    });
    panel.appendChild(loadSelectedBtn);

    // Separator
    const actionSep = document.createElement("div");
    actionSep.style.cssText = "border-top:1px solid #333;margin-top:4px;margin-bottom:4px;";
    panel.appendChild(actionSep);

    // Set as default button
    const setDefaultBtn = document.createElement("button");
    setDefaultBtn.style.cssText =
      "width:100%;padding:6px 8px;background:#3a2a4a;border:1px solid #84a;" +
      "border-radius:4px;color:#fff;font-family:monospace;font-size:11px;" +
      "cursor:pointer;text-align:left;margin-bottom:4px;";
    setDefaultBtn.textContent = "Set as Default";
    setDefaultBtn.disabled = !isAdmin || this._currentMapId === null;
    if (!isAdmin) setDefaultBtn.title = "Admin only";
    setDefaultBtn.addEventListener("click", () => {
      setDefaultBtn.disabled = true;
      void this.setCurrentMapAsDefault().finally(() => {
        setDefaultBtn.disabled = !isAdmin || this._currentMapId === null;
      });
    });
    this._setDefaultBtn = setDefaultBtn as unknown as HTMLButtonElement;
    panel.appendChild(setDefaultBtn);

    // Delete button
    const deleteDbBtn = document.createElement("button");
    deleteDbBtn.style.cssText =
      "width:100%;padding:6px 8px;background:#4a2a2a;border:1px solid #a44;" +
      "border-radius:4px;color:#fff;font-family:monospace;font-size:11px;" +
      "cursor:pointer;text-align:left;margin-bottom:4px;";
    deleteDbBtn.textContent = "Delete Map";
    deleteDbBtn.disabled = !isAdmin || this.isDeleteDisabled();
    if (!isAdmin) deleteDbBtn.title = "Admin only";
    deleteDbBtn.addEventListener("click", () => {
      if (this.isDeleteDisabled()) return;
      if (!confirm("Delete this map? This cannot be undone.")) return;
      deleteDbBtn.disabled = true;
      void this.deleteCurrentMap().finally(() => {
        deleteDbBtn.disabled = !isAdmin || this.isDeleteDisabled();
      });
    });
    this._deleteBtn = deleteDbBtn as unknown as HTMLButtonElement;
    panel.appendChild(deleteDbBtn);

    // Play button (preserved)
    const playSep = document.createElement("div");
    playSep.style.cssText = "border-top:1px solid #444;margin-top:4px;";
    panel.appendChild(playSep);

    const playBtn = document.createElement("button");
    playBtn.style.cssText =
      "width:100%;padding:6px 8px;background:#4a2a2a;border:1px solid #a44;" +
      "border-radius:4px;color:#fff;font-family:monospace;font-size:11px;" +
      "cursor:pointer;text-align:left;margin-bottom:4px;";
    playBtn.textContent = "Play";
    playBtn.addEventListener("click", () => {
      this.playMap();
    });
    panel.appendChild(playBtn);

    // Status display (transient success/info, green)
    const statusDisplay = document.createElement("div");
    statusDisplay.style.cssText =
      "font-size:10px;color:#4f8;display:none;word-wrap:break-word;";
    this._statusDisplay = statusDisplay;
    panel.appendChild(statusDisplay);

    const errorDisplay = document.createElement("div");
    errorDisplay.style.cssText =
      "font-size:10px;color:#f44;display:none;word-wrap:break-word;";
    this._errorDisplay = errorDisplay;
    panel.appendChild(errorDisplay);

    const parent = this.container.parentElement ?? document.body;
    parent.appendChild(panel);
    this._panel = panel;
  }

  private _buildPropertiesSection(): HTMLElement {
    const section = document.createElement("div");
    section.style.cssText =
      "border-top:1px solid #444;margin-top:8px;padding-top:8px;display:none;";
    this._propertiesSection = section;

    const sectionTitle = document.createElement("div");
    sectionTitle.textContent = "Selection";
    sectionTitle.style.cssText =
      "font-weight:bold;font-size:11px;margin-bottom:6px;color:#aaa;";
    section.appendChild(sectionTitle);

    const posDisplay = document.createElement("div");
    posDisplay.style.cssText = "font-size:10px;color:#888;margin-bottom:6px;";
    this._propPosDisplay = posDisplay;
    section.appendChild(posDisplay);

    const typeLabel = document.createElement("div");
    typeLabel.textContent = "Type:";
    typeLabel.style.cssText = "font-size:10px;margin-bottom:2px;";
    section.appendChild(typeLabel);

    const typeSelect = document.createElement("select");
    typeSelect.style.cssText =
      "width:100%;background:#2a2a3e;color:#fff;border:1px solid #444;" +
      "border-radius:3px;font-size:10px;padding:2px;margin-bottom:6px;";
    for (const type of PLACEABLE_TOOLS) {
      const opt = document.createElement("option");
      opt.value = type;
      opt.textContent = type;
      typeSelect.appendChild(opt);
    }
    typeSelect.addEventListener("change", () => {
      this.updateSelectedBlockType(typeSelect.value as TerrainType);
    });
    this._propTypeSelect = typeSelect;
    section.appendChild(typeSelect);

    const heightLabel = document.createElement("div");
    heightLabel.textContent = "Height:";
    heightLabel.style.cssText = "font-size:10px;margin-bottom:2px;";
    section.appendChild(heightLabel);

    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.min = String(HEIGHT_MIN);
    heightInput.max = String(HEIGHT_MAX);
    heightInput.step = String(HEIGHT_STEP);
    heightInput.style.cssText =
      "width:100%;background:#2a2a3e;color:#fff;border:1px solid #444;" +
      "border-radius:3px;font-size:10px;padding:2px;";
    heightInput.addEventListener("change", () => {
      const val = parseFloat(heightInput.value);
      if (!isNaN(val)) this.updateSelectedBlockHeight(val);
    });
    this._propHeightInput = heightInput;
    section.appendChild(heightInput);

    return section;
  }

  private _buildWaterConfigSection(): HTMLElement {
    const section = document.createElement("div");
    section.style.cssText =
      "border-top:1px solid #444;margin-top:8px;padding-top:8px;display:none;";
    this._waterConfigSection = section;

    const title = document.createElement("div");
    title.textContent = "Water Settings";
    title.style.cssText =
      "font-weight:bold;font-size:11px;margin-bottom:6px;color:#aaa;";
    section.appendChild(title);

    const depthLabel = document.createElement("div");
    depthLabel.textContent = "Depth:";
    depthLabel.style.cssText = "font-size:10px;margin-bottom:2px;";
    section.appendChild(depthLabel);

    const depthInput = document.createElement("input");
    depthInput.type = "number";
    depthInput.min = "0.5";
    depthInput.max = "10";
    depthInput.step = "0.5";
    depthInput.value = String(this._selectedWaterDepth);
    depthInput.style.cssText =
      "width:100%;background:#2a2a3e;color:#fff;border:1px solid #444;" +
      "border-radius:3px;font-size:10px;padding:2px;";
    depthInput.addEventListener("change", () => {
      const val = parseFloat(depthInput.value);
      if (!isNaN(val)) this.setSelectedWaterDepth(val);
    });
    this._waterDepthInput = depthInput as unknown as HTMLInputElement;
    section.appendChild(depthInput);

    return section;
  }

  private _buildEntityConfigSection(): HTMLElement {
    const section = document.createElement("div");
    section.style.cssText =
      "border-top:1px solid #444;margin-top:8px;padding-top:8px;display:none;";
    this._entityConfigSection = section;
    return section;
  }

  private _buildToolButton(type: TerrainType): HTMLElement {
    const color = EDITOR_TERRAIN_COLORS[type];
    const btn = document.createElement("button");
    btn.style.cssText =
      "display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px;" +
      "background:#2a2a3e;border:1px solid #444;border-radius:4px;color:#fff;" +
      "font-family:monospace;font-size:11px;cursor:pointer;text-align:left;";

    const swatch = document.createElement("span");
    swatch.style.cssText =
      "display:inline-block;width:14px;height:14px;border-radius:2px;" +
      `background:${color};flex-shrink:0;`;

    const label = document.createElement("span");
    label.textContent = type;

    btn.appendChild(swatch);
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      this.selectTool(this._selectedTool === type ? null : type);
    });

    this._toolButtons.set(type, btn);
    return btn;
  }

  private _buildEntityToolButton(tool: EntityTool): HTMLElement {
    const color = ENTITY_COLORS[tool];
    const btn = document.createElement("button");
    btn.style.cssText =
      "display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px;" +
      "background:#2a2a3e;border:1px solid #444;border-radius:4px;color:#fff;" +
      "font-family:monospace;font-size:11px;cursor:pointer;text-align:left;";

    const swatch = document.createElement("span");
    swatch.style.cssText =
      "display:inline-block;width:14px;height:14px;border-radius:50%;" +
      `background:${color};flex-shrink:0;`;

    const label = document.createElement("span");
    label.textContent = ENTITY_TOOL_LABELS[tool];

    btn.appendChild(swatch);
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      this.selectEntityTool(this._selectedEntityTool === tool ? null : tool);
    });

    this._entityToolButtons.set(tool, btn);
    return btn;
  }

  private _updateToolButtons(): void {
    for (const [type, btn] of this._toolButtons) {
      if (type === this._selectedTool) {
        btn.style.background = "#4a4a6e";
        btn.style.borderColor = "#88f";
      } else {
        btn.style.background = "#2a2a3e";
        btn.style.borderColor = "#444";
      }
    }
  }

  private _updateEntityToolButtons(): void {
    for (const [tool, btn] of this._entityToolButtons) {
      if (tool === this._selectedEntityTool) {
        btn.style.background = "#4a4a6e";
        btn.style.borderColor = "#88f";
      } else {
        btn.style.background = "#2a2a3e";
        btn.style.borderColor = "#444";
      }
    }
  }

  private _updatePropertiesSection(): void {
    if (!this._propertiesSection) return;
    if (!this._selectedBlock) {
      this._propertiesSection.style.display = "none";
      return;
    }
    this._propertiesSection.style.display = "block";
    if (this._propPosDisplay) {
      this._propPosDisplay.textContent =
        `X: ${this._selectedBlock.x}  Z: ${this._selectedBlock.z}`;
    }
    if (this._propTypeSelect) {
      this._propTypeSelect.value = this._selectedBlock.type;
    }
    if (this._propHeightInput) {
      this._propHeightInput.value = String(this._selectedBlock.height);
    }
  }

  private _updateEntityConfigSection(): void {
    if (!this._entityConfigSection) return;
    // Clear existing controls
    this._entityConfigSection.textContent = "";

    if (!this._selectedEntityTool) {
      this._entityConfigSection.style.display = "none";
      return;
    }
    this._entityConfigSection.style.display = "block";

    switch (this._selectedEntityTool) {
      case "resourceNode":
        this._buildResourceNodeConfig(this._entityConfigSection);
        break;
      case "hiddenTerrain":
        this._buildHiddenTerrainConfig(this._entityConfigSection);
        break;
      case "yarnPickup":
        this._buildYarnPickupConfig(this._entityConfigSection);
        break;
      default:
        // playerSpawn and catSpawn have no extra config
        break;
    }
  }

  private _buildResourceNodeConfig(parent: HTMLElement): void {
    const typeLabel = document.createElement("div");
    typeLabel.textContent = "Resource Type:";
    typeLabel.style.cssText = "font-size:10px;margin-bottom:2px;";
    parent.appendChild(typeLabel);

    const typeSelect = document.createElement("select");
    typeSelect.style.cssText =
      "width:100%;background:#2a2a3e;color:#fff;border:1px solid #444;" +
      "border-radius:3px;font-size:10px;padding:2px;margin-bottom:6px;";
    for (const rt of [ResourceType.Grass, ResourceType.Sticks, ResourceType.Water]) {
      const opt = document.createElement("option");
      opt.value = rt;
      opt.textContent = rt;
      typeSelect.appendChild(opt);
    }
    typeSelect.value = this._selectedResourceNodeType;
    typeSelect.addEventListener("change", () => {
      this._selectedResourceNodeType = typeSelect.value as ResourceType;
      this._selectedRespawnTime = RESOURCE_RESPAWN_DEFAULTS[this._selectedResourceNodeType];
      if (respawnInput) respawnInput.value = String(this._selectedRespawnTime);
    });
    parent.appendChild(typeSelect);

    const respawnLabel = document.createElement("div");
    respawnLabel.textContent = "Respawn (s):";
    respawnLabel.style.cssText = "font-size:10px;margin-bottom:2px;";
    parent.appendChild(respawnLabel);

    const respawnInput = document.createElement("input");
    respawnInput.type = "number";
    respawnInput.min = "1";
    respawnInput.max = "300";
    respawnInput.step = "1";
    respawnInput.value = String(this._selectedRespawnTime);
    respawnInput.style.cssText =
      "width:100%;background:#2a2a3e;color:#fff;border:1px solid #444;" +
      "border-radius:3px;font-size:10px;padding:2px;";
    respawnInput.addEventListener("change", () => {
      const val = parseFloat(respawnInput.value);
      if (!isNaN(val) && val > 0) this._selectedRespawnTime = val;
    });
    parent.appendChild(respawnInput);
  }

  private _buildHiddenTerrainConfig(parent: HTMLElement): void {
    const heightLabel = document.createElement("div");
    heightLabel.textContent = "Height:";
    heightLabel.style.cssText = "font-size:10px;margin-bottom:2px;";
    parent.appendChild(heightLabel);

    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.min = String(HEIGHT_MIN);
    heightInput.max = String(HEIGHT_MAX);
    heightInput.step = String(HEIGHT_STEP);
    heightInput.value = String(this._selectedHiddenTerrainHeight);
    heightInput.style.cssText =
      "width:100%;background:#2a2a3e;color:#fff;border:1px solid #444;" +
      "border-radius:3px;font-size:10px;padding:2px;";
    heightInput.addEventListener("change", () => {
      const val = parseFloat(heightInput.value);
      if (!isNaN(val)) {
        this._selectedHiddenTerrainHeight = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, val));
      }
    });
    parent.appendChild(heightInput);

    const hint = document.createElement("div");
    hint.textContent = "Click-drag to define area";
    hint.style.cssText = "font-size:9px;color:#888;margin-top:4px;";
    parent.appendChild(hint);
  }

  private _buildYarnPickupConfig(parent: HTMLElement): void {
    const amountLabel = document.createElement("div");
    amountLabel.textContent = "Yarn Amount:";
    amountLabel.style.cssText = "font-size:10px;margin-bottom:2px;";
    parent.appendChild(amountLabel);

    const amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.min = "1";
    amountInput.max = "20";
    amountInput.step = "1";
    amountInput.value = String(this._selectedYarnAmount);
    amountInput.style.cssText =
      "width:100%;background:#2a2a3e;color:#fff;border:1px solid #444;" +
      "border-radius:3px;font-size:10px;padding:2px;";
    amountInput.addEventListener("change", () => {
      const val = parseInt(amountInput.value, 10);
      if (!isNaN(val) && val > 0) this._selectedYarnAmount = val;
    });
    parent.appendChild(amountInput);
  }

  // ── Private — keyboard & mouse handlers ───────────────────────────────────

  private _registerKeyboard(): void {
    const PALETTE_TERRAIN: TerrainType[] = [
      TerrainType.Grass,
      TerrainType.Dirt,
      TerrainType.Stone,
      TerrainType.Water,
    ];
    const PALETTE_ENTITY: EntityTool[] = [
      "playerSpawn",
      "catSpawn",
      "resourceNode",
      "hiddenTerrain",
      "yarnPickup",
    ];

    this._keydownHandler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "e" && e.ctrlKey) {
        e.preventDefault();
        if (this._active) {
          this.disable();
        } else {
          this.enable();
        }
        return;
      }

      if (!this._active) return;

      if (e.key === "Delete") {
        this.deleteSelectedBlock();
        return;
      }

      // US-304: M / D / 1-9 — only while editor is active; consume event so
      // game InputManager does not also process them.
      const key = e.key.toLowerCase();
      if (key === "m") {
        e.preventDefault();
        e.stopPropagation();
        this.setEditorToolMode(this._editorToolMode === "move" ? null : "move");
        return;
      }
      if (key === "d") {
        e.preventDefault();
        e.stopPropagation();
        this.setEditorToolMode(this._editorToolMode === "delete" ? null : "delete");
        return;
      }
      // 1-4 → terrain palette, 5-9 → entity palette
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 4) {
        e.preventDefault();
        e.stopPropagation();
        const type = PALETTE_TERRAIN[num - 1]!;
        this.selectTool(this._selectedTool === type ? null : type);
      } else if (num >= 5 && num <= 9) {
        e.preventDefault();
        e.stopPropagation();
        const tool = PALETTE_ENTITY[num - 5]!;
        this.selectEntityTool(this._selectedEntityTool === tool ? null : tool);
      }
    };
    document.addEventListener("keydown", this._keydownHandler);
  }

  private _registerMouseHandlers(): void {
    // mousemove: ghost preview + drag ghost updates + move drag
    this._mouseMoveHandler = (e: MouseEvent) => {
      if (!this._active || !this.sceneManager) return;
      const rect = this.container.getBoundingClientRect();

      // Build exclude set: ghost and any object being moved (so raycast gets ground)
      const excludeHandles = new Set<SceneHandle>();
      if (this._ghostHandle) excludeHandles.add(this._ghostHandle);
      if (this._movingObject?.obj.handle) excludeHandles.add(this._movingObject.obj.handle);

      const worldPos = this.sceneManager.screenToWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
        excludeHandles.size > 0 ? excludeHandles : undefined,
      );
      if (!worldPos) return;

      // Snap to cell center for ghost positioning
      const { col, row } = this._snapToCell(worldPos.x, worldPos.z);
      const { x: snappedX, z: snappedZ } = this._cellCenter(col, row);

      // Terrain ghost
      if (this._selectedTool) {
        this._updateGhost(snappedX, snappedZ);
      }

      // Water zone drag ghost
      if (this._selectedTool === TerrainType.Water && this._waterDragStart) {
        this._updateWaterDragGhost(
          this._waterDragStart.col,
          this._waterDragStart.row,
          col,
          row,
        );
      }

      // Hidden terrain drag ghost
      if (this._selectedEntityTool === "hiddenTerrain" && this._hiddenDragStart) {
        this._updateHiddenDragGhost(
          this._hiddenDragStart.col,
          this._hiddenDragStart.row,
          col,
          row,
        );
      }

      // Entity ghost (point entities only)
      if (
        this._selectedEntityTool &&
        this._selectedEntityTool !== "hiddenTerrain"
      ) {
        this._updateEntityGhost(snappedX, snappedZ);
      }

      // US-304: move drag — update the moving object's position in real-time
      if (this._editorToolMode === "move" && this._movingObject) {
        this._updateObjectPosition(this._movingObject, snappedX, snappedZ);
      }
    };
    this.container.addEventListener("mousemove", this._mouseMoveHandler);

    // mousedown: start drag (water zones or hidden terrain)
    this._mousedownHandler = (e: MouseEvent) => {
      if (!this._active) return;
      if (!this.sceneManager) return;
      const rect = this.container.getBoundingClientRect();
      const worldPos = this.sceneManager.screenToWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      if (!worldPos) return;
      const { col, row } = this._snapToCell(worldPos.x, worldPos.z);
      const { x: sx, z: sz } = this._cellCenter(col, row);

      if (this._selectedTool === TerrainType.Water) {
        this._waterDragStart = { col, row };
      } else if (this._selectedEntityTool === "hiddenTerrain") {
        this._hiddenDragStart = { col, row };
      } else if (this._editorToolMode === "move") {
        // US-304: start move drag — find object at click position
        const found = this._findPointObjectAt(sx, sz, col, row);
        if (found) {
          this._movingObject = found;
          if (found.kind === "block") {
            this._movingBlockOrigin = { col, row };
          }
        }
      }
    };
    this.container.addEventListener("mousedown", this._mousedownHandler);

    // mouseup: finalise drag zones
    this._mouseupHandler = (e: MouseEvent) => {
      if (!this._active) {
        this._cancelWaterDrag();
        this._cancelHiddenDrag();
        return;
      }
      if (!this.sceneManager) {
        this._cancelWaterDrag();
        this._cancelHiddenDrag();
        return;
      }

      const rect = this.container.getBoundingClientRect();

      // Water zone finalisation
      if (this._waterDragStart) {
        const worldPos = this.sceneManager.screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          this._waterDragGhost ? new Set([this._waterDragGhost]) : undefined,
        );
        const endCell = worldPos
          ? this._snapToCell(worldPos.x, worldPos.z)
          : this._waterDragStart;

        if (endCell.col !== this._waterDragStart.col || endCell.row !== this._waterDragStart.row) {
          // Convert back to world coords for createWaterZone (which re-converts internally)
          const startWorld = this._cellCenter(this._waterDragStart.col, this._waterDragStart.row);
          const endWorld = this._cellCenter(endCell.col, endCell.row);
          this.createWaterZone(
            startWorld.x,
            startWorld.z,
            endWorld.x,
            endWorld.z,
          );
          this._suppressNextClick = true;
        }
        this._cancelWaterDrag();
      }

      // Hidden terrain zone finalisation
      if (this._hiddenDragStart) {
        const worldPos = this.sceneManager.screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
          this._hiddenDragGhost ? new Set([this._hiddenDragGhost]) : undefined,
        );
        const endCell = worldPos
          ? this._snapToCell(worldPos.x, worldPos.z)
          : this._hiddenDragStart;

        if (endCell.col !== this._hiddenDragStart.col || endCell.row !== this._hiddenDragStart.row) {
          const startWorld = this._cellCenter(this._hiddenDragStart.col, this._hiddenDragStart.row);
          const endWorld = this._cellCenter(endCell.col, endCell.row);
          this.createHiddenTerrainZone(
            startWorld.x,
            startWorld.z,
            endWorld.x,
            endWorld.z,
          );
          this._suppressNextClick = true;
        }
        this._cancelHiddenDrag();
      }

      // US-304: finalize move drag
      if (this._movingObject) {
        this._suppressNextClick = true;
        // For terrain blocks: commit the move to terrain[][]
        if (this._movingObject.kind === "block" && this._movingBlockOrigin) {
          const orig = this._movingBlockOrigin;
          const newPos = this._snapToCell(this._movingObject.obj.x, this._movingObject.obj.z);
          const terrain = this._mapData?.terrain;
          if (terrain && (newPos.col !== orig.col || newPos.row !== orig.row)) {
            const srcCell = terrain[orig.row]?.[orig.col];
            if (srcCell) {
              // Clear old cell
              terrain[orig.row]![orig.col]! = { type: TerrainType.Grass, height: 0, navigable: true };
              const oldKey = `${orig.col},${orig.row}`;
              const oldHandle = this._cellHandles.get(oldKey);
              if (oldHandle && this.sceneManager) this.sceneManager.removeMesh(oldHandle);
              this._cellHandles.delete(oldKey);
              // Write to new cell
              if (terrain[newPos.row]?.[newPos.col] !== undefined) {
                terrain[newPos.row]![newPos.col]! = { ...srcCell };
                this._setCellMesh(newPos.col, newPos.row);
                // Update the block's x/z to the finalized cell center
                const { x, z } = this._cellCenter(newPos.col, newPos.row);
                this._movingObject.obj.x = x;
                this._movingObject.obj.z = z;
              }
            }
          }
        }
        this._movingObject = null;
        this._movingBlockOrigin = null;
      }
    };
    this.container.addEventListener("mouseup", this._mouseupHandler);

    // click: delete-mode removal, terrain placement, entity placement, or selection
    this._clickHandler = (e: MouseEvent) => {
      if (!this._active) return;

      if (this._suppressNextClick) {
        this._suppressNextClick = false;
        return;
      }

      // US-304: delete tool — remove object at click position
      if (this._editorToolMode === "delete") {
        if (!this.sceneManager) return;
        const rect = this.container.getBoundingClientRect();
        const worldPos = this.sceneManager.screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
        if (!worldPos) return;
        this.deleteObjectAtPosition(worldPos.x, worldPos.z);
        return;
      }

      if (this._selectedTool) {
        // Terrain tool active — place block
        if (this.sceneManager) {
          const rect = this.container.getBoundingClientRect();
          const worldPos = this.sceneManager.screenToWorld(
            e.clientX - rect.left,
            e.clientY - rect.top,
            this._ghostHandle ? new Set([this._ghostHandle]) : undefined,
          );
          if (!worldPos) return;
          this.placeBlock(worldPos.x, worldPos.z);
        } else {
          this.placeBlock(this._ghostX, this._ghostZ);
        }
      } else if (this._selectedEntityTool && this._selectedEntityTool !== "hiddenTerrain") {
        // Entity tool active — place entity
        if (this.sceneManager) {
          const rect = this.container.getBoundingClientRect();
          const worldPos = this.sceneManager.screenToWorld(
            e.clientX - rect.left,
            e.clientY - rect.top,
            this._ghostHandle ? new Set([this._ghostHandle]) : undefined,
          );
          if (!worldPos) return;
          this.placeEntity(worldPos.x, worldPos.z);
        } else {
          this.placeEntity(this._ghostX, this._ghostZ);
        }
      } else {
        // No tool selected — try to find and select a terrain block at click position.
        if (!this.sceneManager) return;
        const rect = this.container.getBoundingClientRect();
        const worldPos = this.sceneManager.screenToWorld(
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
        if (!worldPos) return;
        const { col, row } = this._snapToCell(worldPos.x, worldPos.z);
        const terrain = this._mapData?.terrain;
        const cell = terrain?.[row]?.[col];
        if (cell && (cell.type !== TerrainType.Grass || cell.height !== 0)) {
          const { x, z } = this._cellCenter(col, row);
          const key = `${col},${row}`;
          const block: EditorBlock = {
            x,
            z,
            type: cell.type,
            height: cell.height,
            handle: this._cellHandles.get(key) ?? null,
          };
          this.selectBlock(block);
        } else {
          this.selectBlock(null);
        }
      }
    };
    this.container.addEventListener("click", this._clickHandler);
  }

  // ── Private — entity placement (US-303) ──────────────────────────────────

  private _placePlayerSpawn(x: number, z: number): void {
    // Only one player spawn allowed — move existing one if present
    if (this._playerSpawn) {
      if (this._playerSpawn.handle && this.sceneManager) {
        this.sceneManager.removeMesh(this._playerSpawn.handle);
      }
      this._playerSpawn = null;
    }
    const handle = this._createEntityMarkerMesh(x, z, ENTITY_COLORS.playerSpawn);
    this._playerSpawn = { x, z, handle };
  }

  private _placeCatSpawn(x: number, z: number): void {
    const handle = this._createEntityMarkerMesh(x, z, ENTITY_COLORS.catSpawn);
    this._catSpawns.push({ x, z, handle });
  }

  private _placeResourceNode(x: number, z: number): void {
    const color = RESOURCE_NODE_COLORS[this._selectedResourceNodeType];
    const handle = this._createEntityMarkerMesh(x, z, color);
    this._resourceNodes.push({
      x,
      z,
      type: this._selectedResourceNodeType,
      respawnTime: this._selectedRespawnTime,
      handle,
    });
  }

  private _placeYarnPickup(x: number, z: number): void {
    const handle = this._createEntityMarkerMesh(x, z, ENTITY_COLORS.yarnPickup);
    this._yarnPickups.push({ x, z, yarnAmount: this._selectedYarnAmount, handle });
  }

  private _createEntityMarkerMesh(
    x: number,
    z: number,
    color: string,
  ): SceneHandle | null {
    if (!this.sceneManager) return null;
    const handle = this.sceneManager.addMesh({
      geometry: "sphere",
      dims: [0.5, 0.5, 0.5],
      color,
    });
    this.sceneManager.updateTransform(
      handle,
      { x, y: 0.5, z },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    );
    return handle;
  }

  // ── Private — drag zone helpers ────────────────────────────────────────────

  private _cancelWaterDrag(): void {
    if (this._waterDragGhost && this.sceneManager) {
      this.sceneManager.removeMesh(this._waterDragGhost);
    }
    this._waterDragGhost = null;
    this._waterDragStart = null;
  }

  private _cancelHiddenDrag(): void {
    if (this._hiddenDragGhost && this.sceneManager) {
      this.sceneManager.removeMesh(this._hiddenDragGhost);
    }
    this._hiddenDragGhost = null;
    this._hiddenDragStart = null;
  }

  private _updateWaterDragGhost(
    col1: number,
    row1: number,
    col2: number,
    row2: number,
  ): void {
    if (!this.sceneManager) return;
    const minCol = Math.min(col1, col2);
    const maxCol = Math.max(col1, col2);
    const minRow = Math.min(row1, row2);
    const maxRow = Math.max(row1, row2);

    const topLeft = this._cellCenter(minCol, minRow);
    const bottomRight = this._cellCenter(maxCol, maxRow);
    const width = (maxCol - minCol + 1) * this._cellSize;
    const depth = (maxRow - minRow + 1) * this._cellSize;
    const cx = (topLeft.x + bottomRight.x) / 2;
    const cz = (topLeft.z + bottomRight.z) / 2;

    if (!this._waterDragGhost) {
      this._waterDragGhost = this.sceneManager.addMesh({
        geometry: "box",
        dims: [1, 1, 1],
        color: EDITOR_TERRAIN_COLORS[TerrainType.Water],
        opacity: 0.3,
      });
    }
    this.sceneManager.updateTransform(
      this._waterDragGhost,
      { x: cx, y: 0.1, z: cz },
      { x: 0, y: 0, z: 0 },
      { x: width, y: 0.2, z: depth },
    );
  }

  private _updateHiddenDragGhost(
    col1: number,
    row1: number,
    col2: number,
    row2: number,
  ): void {
    if (!this.sceneManager) return;
    const minCol = Math.min(col1, col2);
    const maxCol = Math.max(col1, col2);
    const minRow = Math.min(row1, row2);
    const maxRow = Math.max(row1, row2);

    const topLeft = this._cellCenter(minCol, minRow);
    const bottomRight = this._cellCenter(maxCol, maxRow);
    const width = (maxCol - minCol + 1) * this._cellSize;
    const depth = (maxRow - minRow + 1) * this._cellSize;
    const cx = (topLeft.x + bottomRight.x) / 2;
    const cz = (topLeft.z + bottomRight.z) / 2;

    if (!this._hiddenDragGhost) {
      this._hiddenDragGhost = this.sceneManager.addMesh({
        geometry: "box",
        dims: [1, 1, 1],
        color: ENTITY_COLORS.hiddenTerrain,
        opacity: 0.3,
      });
    }
    this.sceneManager.updateTransform(
      this._hiddenDragGhost,
      { x: cx, y: 0.1, z: cz },
      { x: 0, y: 0, z: 0 },
      { x: width, y: 0.2, z: depth },
    );
  }

  // ── Private — ghost preview helpers ───────────────────────────────────────

  private _updateGhost(x: number, z: number): void {
    if (!this.sceneManager || !this._selectedTool) return;
    this._ghostX = x;
    this._ghostZ = z;
    if (!this._ghostHandle) {
      this._ghostHandle = this.sceneManager.addMesh({
        geometry: "box",
        dims: [this._cellSize, this._cellSize, this._cellSize],
        color: EDITOR_TERRAIN_COLORS[this._selectedTool],
        opacity: 0.4,
      });
    }
    this.sceneManager.updateTransform(
      this._ghostHandle,
      { x, y: this._cellSize / 2, z },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    );
  }

  private _updateEntityGhost(x: number, z: number): void {
    if (!this.sceneManager || !this._selectedEntityTool) return;
    this._ghostX = x;
    this._ghostZ = z;
    if (!this._ghostHandle) {
      const color = ENTITY_COLORS[this._selectedEntityTool];
      this._ghostHandle = this.sceneManager.addMesh({
        geometry: "sphere",
        dims: [0.5, 0.5, 0.5],
        color,
        opacity: 0.4,
      });
    }
    this.sceneManager.updateTransform(
      this._ghostHandle,
      { x, y: 0.5, z },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    );
  }

  private _removeGhost(): void {
    if (this._ghostHandle && this.sceneManager) {
      this.sceneManager.removeMesh(this._ghostHandle);
    }
    this._ghostHandle = null;
  }

  // ── Private — US-304 helpers ───────────────────────────────────────────────

  /**
   * Find the first point object at the given world position or cell (col, row).
   * Terrain cells are found via the cell grid; entities are found by proximity to cell center.
   */
  private _findPointObjectAt(worldX: number, worldZ: number, col: number, row: number): MovingObject | null {
    // Check terrain cell (non-default)
    const terrain = this._mapData?.terrain;
    const cell = terrain?.[row]?.[col];
    if (cell && (cell.type !== TerrainType.Grass || cell.height !== 0)) {
      const { x, z } = this._cellCenter(col, row);
      const key = `${col},${row}`;
      const block: EditorBlock = {
        x,
        z,
        type: cell.type,
        height: cell.height,
        handle: this._cellHandles.get(key) ?? null,
      };
      return { kind: "block", obj: block };
    }

    // Check point entities by proximity (using exact world-space coords)
    if (this._playerSpawn && Math.abs(this._playerSpawn.x - worldX) < this._cellSize / 2 && Math.abs(this._playerSpawn.z - worldZ) < this._cellSize / 2) {
      return { kind: "playerSpawn", obj: this._playerSpawn };
    }
    const cat = this._catSpawns.find((s) => Math.abs(s.x - worldX) < this._cellSize / 2 && Math.abs(s.z - worldZ) < this._cellSize / 2);
    if (cat) return { kind: "catSpawn", obj: cat };

    const node = this._resourceNodes.find((n) => Math.abs(n.x - worldX) < this._cellSize / 2 && Math.abs(n.z - worldZ) < this._cellSize / 2);
    if (node) return { kind: "resourceNode", obj: node };

    const yarn = this._yarnPickups.find((p) => Math.abs(p.x - worldX) < this._cellSize / 2 && Math.abs(p.z - worldZ) < this._cellSize / 2);
    if (yarn) return { kind: "yarnPickup", obj: yarn };

    return null;
  }

  /** Remove a found object from its collection and the scene. */
  private _removeFoundObject(found: MovingObject, col?: number, row?: number): void {
    switch (found.kind) {
      case "block": {
        // Determine col/row from the block's world position if not provided
        const c = col ?? this._snapToCell(found.obj.x, found.obj.z).col;
        const r = row ?? this._snapToCell(found.obj.x, found.obj.z).row;
        const key = `${c},${r}`;
        const handle = this._cellHandles.get(key);
        if (handle && this.sceneManager) this.sceneManager.removeMesh(handle);
        this._cellHandles.delete(key);
        // Reset terrain cell to default
        const terrain = this._mapData?.terrain;
        if (terrain?.[r]?.[c]) {
          terrain[r]![c]! = { type: TerrainType.Grass, height: 0, navigable: true };
        }
        if (this._selectedBlock === found.obj || (this._selectedCell?.col === c && this._selectedCell?.row === r)) {
          this._selectedBlock = null;
          this._selectedCell = null;
          this._updatePropertiesSection();
        }
        break;
      }
      case "playerSpawn": {
        if (found.obj.handle && this.sceneManager) {
          this.sceneManager.removeMesh(found.obj.handle);
        }
        this._playerSpawn = null;
        break;
      }
      case "catSpawn": {
        if (found.obj.handle && this.sceneManager) {
          this.sceneManager.removeMesh(found.obj.handle);
        }
        const idx = this._catSpawns.indexOf(found.obj);
        if (idx !== -1) this._catSpawns.splice(idx, 1);
        break;
      }
      case "resourceNode": {
        if (found.obj.handle && this.sceneManager) {
          this.sceneManager.removeMesh(found.obj.handle);
        }
        const idx = this._resourceNodes.indexOf(found.obj);
        if (idx !== -1) this._resourceNodes.splice(idx, 1);
        break;
      }
      case "yarnPickup": {
        if (found.obj.handle && this.sceneManager) {
          this.sceneManager.removeMesh(found.obj.handle);
        }
        const idx = this._yarnPickups.indexOf(found.obj);
        if (idx !== -1) this._yarnPickups.splice(idx, 1);
        break;
      }
    }
  }

  /** Update the world position of a moving object and its mesh. */
  private _updateObjectPosition(found: MovingObject, x: number, z: number): void {
    found.obj.x = x;
    found.obj.z = z;
    if (!found.obj.handle || !this.sceneManager) return;
    if (found.kind === "block") {
      const { boxHeight, centerY } = cellMeshGeometry(found.obj.height);
      this.sceneManager.updateTransform(
        found.obj.handle,
        { x, y: centerY, z },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
      );
      // Update dims to match (the mesh was already created with correct dims)
      // The handle retains the old dims; this only updates position
      void boxHeight; // suppress unused warning
    } else {
      this.sceneManager.updateTransform(
        found.obj.handle,
        { x, y: 0.5, z },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
      );
    }
  }

  /** Clear an in-progress move drag without restoring position. */
  private _cancelMoveDrag(): void {
    this._movingObject = null;
  }

  private _showError(msg: string | null): void {
    if (!this._errorDisplay) return;
    this._errorDisplay.textContent = msg ?? "";
    this._errorDisplay.style.display = msg ? "block" : "none";
  }

  private _statusClearTimer: ReturnType<typeof setTimeout> | null = null;

  private _showStatus(msg: string): void {
    if (!this._statusDisplay) return;
    if (this._statusClearTimer !== null) {
      clearTimeout(this._statusClearTimer);
      this._statusClearTimer = null;
    }
    this._statusDisplay.textContent = msg;
    this._statusDisplay.style.display = "block";
    this._statusClearTimer = setTimeout(() => {
      if (this._statusDisplay) {
        this._statusDisplay.style.display = "none";
        this._statusDisplay.textContent = "";
      }
      this._statusClearTimer = null;
    }, 3000);
  }

  private _populateMapListSelect(
    list: Array<{ id: number; name: string; isDefault: boolean; createdAt: Date }>,
  ): void {
    if (!this._mapListSelect) return;
    // Clear existing options
    const sel = this._mapListSelect;
    // Remove existing children via replaceChildren if available, else manual
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    for (const entry of list) {
      const opt = document.createElement("option");
      opt.value = String(entry.id);
      opt.textContent = entry.isDefault ? `${entry.name} (default)` : entry.name;
      sel.appendChild(opt);
    }
  }

  private _updateDeleteButton(): void {
    if (!this._deleteBtn) return;
    this._deleteBtn.disabled = this.isDeleteDisabled();
  }

  private _updateSetDefaultButton(): void {
    if (!this._setDefaultBtn) return;
    this._setDefaultBtn.disabled = this._currentMapId === null;
  }

  private _updateWaterConfigSection(): void {
    if (!this._waterConfigSection) return;
    this._waterConfigSection.style.display =
      this._selectedTool === TerrainType.Water ? "block" : "none";
  }

  private _updateEditorToolModeButtons(): void {
    if (this._moveToolBtn) {
      this._moveToolBtn.style.background =
        this._editorToolMode === "move" ? "#4a4a6e" : "#2a2a3e";
      this._moveToolBtn.style.borderColor =
        this._editorToolMode === "move" ? "#88f" : "#444";
    }
    if (this._deleteToolBtn) {
      this._deleteToolBtn.style.background =
        this._editorToolMode === "delete" ? "#6e2a2a" : "#2a2a3e";
      this._deleteToolBtn.style.borderColor =
        this._editorToolMode === "delete" ? "#f88" : "#444";
    }
  }
}
