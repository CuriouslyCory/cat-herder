import type { MapData } from "./MapData";
import type { CameraController } from "../engine/CameraController";
import type { MeshConfig, SceneHandle } from "../engine/SceneManager";
import { TerrainType, ResourceType } from "../types";

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
//
// Gated by process.env.NODE_ENV === 'production'. Constructor returns early
// in production, leaving all element refs null and _active always false.
// ---------------------------------------------------------------------------

interface GameLifecycle {
  pause(): void;
  resume(): void;
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
}

// ---------------------------------------------------------------------------
// Terrain block types
// ---------------------------------------------------------------------------

export interface EditorBlock {
  x: number;
  z: number;
  type: TerrainType;
  height: number;
  handle: SceneHandle | null;
}

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

// ---------------------------------------------------------------------------
// MapEditor class
// ---------------------------------------------------------------------------

export class MapEditor {
  private _active = false;
  private _mapData: MapData | null = null;
  private _banner: HTMLElement | null = null;
  private _panel: HTMLElement | null = null;

  // Terrain tool state
  private _selectedTool: TerrainType | null = null;
  private _editorBlocks: EditorBlock[] = [];
  private _ghostHandle: SceneHandle | null = null;
  private _ghostX = 0;
  private _ghostZ = 0;

  // US-302b: selection & water zones
  private _selectedBlock: EditorBlock | null = null;
  private _editorWaterZones: EditorWaterZone[] = [];
  private _waterDragStart: { x: number; z: number } | null = null;
  private _waterDragGhost: SceneHandle | null = null;
  private _suppressNextClick = false;

  // Properties section DOM refs
  private _propertiesSection: HTMLElement | null = null;
  private _propPosDisplay: HTMLElement | null = null;
  private _propTypeSelect: HTMLSelectElement | null = null;
  private _propHeightInput: HTMLInputElement | null = null;

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
  private _hiddenTerrainZones: EditorHiddenTerrainZone[] = [];
  private _yarnPickups: EditorYarnPickup[] = [];

  // Hidden terrain drag state (mirrors water zone drag)
  private _hiddenDragStart: { x: number; z: number } | null = null;
  private _hiddenDragGhost: SceneHandle | null = null;

  // US-304: move / delete tool mode
  private _editorToolMode: EditorToolMode | null = null;
  private _movingObject: MovingObject | null = null;
  private _moveToolBtn: HTMLElement | null = null;
  private _deleteToolBtn: HTMLElement | null = null;

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
    this.gameLifecycle.pause();
    this.cameraController.setMode("free");
    this._banner.style.display = "block";
    if (this._panel) this._panel.style.display = "flex";
  }

  disable(): void {
    if (!this._active) return;
    this._active = false;
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
  }

  isActive(): boolean {
    return this._active;
  }

  getMapData(): MapData {
    return this._mapData ?? {
      name: "untitled",
      size: { width: 30, depth: 30 },
      terrain: [],
      cellSize: 2,
      spawnPoints: [],
    };
  }

  loadMapData(data: MapData): void {
    this._mapData = { ...data, terrain: data.terrain.map((row) => [...row]) };
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
  }

  /** Read-only view of placed editor blocks. */
  getEditorBlocks(): readonly EditorBlock[] {
    return this._editorBlocks;
  }

  /**
   * Place a block at the given world position using the currently selected
   * tool. The position is snapped to the 1u grid before placement.
   * If a block already exists at that grid cell, its type is updated instead.
   */
  placeBlock(worldX: number, worldZ: number): void {
    if (this._selectedTool === null) return;
    const x = MapEditor.snapToGrid(worldX);
    const z = MapEditor.snapToGrid(worldZ);
    const existing = this._editorBlocks.find((b) => b.x === x && b.z === z);
    if (existing) {
      existing.type = this._selectedTool;
      return;
    }
    const handle = this._createBlockMesh(x, z, this._selectedTool, 1);
    this._editorBlocks.push({ x, z, type: this._selectedTool, height: 1, handle });
  }

  /** Snap a world coordinate to the nearest integer (1u grid). */
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
    this._updatePropertiesSection();
  }

  getSelectedBlock(): EditorBlock | null {
    return this._selectedBlock;
  }

  /** Update the terrain type of the currently selected block. */
  updateSelectedBlockType(type: TerrainType): void {
    if (!this._selectedBlock) return;
    this._selectedBlock.type = type;
    if (this._selectedBlock.handle && this.sceneManager) {
      this.sceneManager.setMeshColor(
        this._selectedBlock.handle,
        EDITOR_TERRAIN_COLORS[type],
      );
    }
    this._updatePropertiesSection();
  }

  /**
   * Update the height of the currently selected block.
   * Clamped to [HEIGHT_MIN, HEIGHT_MAX]. The mesh scale is updated in place
   * (no geometry recreation needed since blocks use unit cubes + scale).
   */
  updateSelectedBlockHeight(height: number): void {
    if (!this._selectedBlock) return;
    const clamped = Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, height));
    this._selectedBlock.height = clamped;
    if (this._selectedBlock.handle && this.sceneManager) {
      this.sceneManager.updateTransform(
        this._selectedBlock.handle,
        { x: this._selectedBlock.x, y: clamped / 2, z: this._selectedBlock.z },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: clamped, z: 1 },
      );
    }
    this._updatePropertiesSection();
  }

  /** Remove the currently selected block from editor state and scene. */
  deleteSelectedBlock(): void {
    if (!this._selectedBlock) return;
    if (this._selectedBlock.handle && this.sceneManager) {
      this.sceneManager.removeMesh(this._selectedBlock.handle);
    }
    const idx = this._editorBlocks.indexOf(this._selectedBlock);
    if (idx !== -1) this._editorBlocks.splice(idx, 1);
    this._selectedBlock = null;
    this._updatePropertiesSection();
  }

  /** Read-only view of placed water zones. */
  getEditorWaterZones(): readonly EditorWaterZone[] {
    return this._editorWaterZones;
  }

  /**
   * Define a rectangular water zone from two corner grid coordinates.
   * Coordinates are normalised so x1 <= x2 and z1 <= z2.
   */
  createWaterZone(x1: number, z1: number, x2: number, z2: number): void {
    const nx1 = Math.min(x1, x2);
    const nz1 = Math.min(z1, z2);
    const nx2 = Math.max(x1, x2);
    const nz2 = Math.max(z1, z2);
    const zone: EditorWaterZone = {
      x1: nx1,
      z1: nz1,
      x2: nx2,
      z2: nz2,
      depth: 1,
      handle: this._createWaterZoneMesh(nx1, nz1, nx2, nz2),
    };
    this._editorWaterZones.push(zone);
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
   * entity tool. Position is snapped to the 1u grid before placement.
   * Hidden terrain zones use drag-to-define and are not placed via this method.
   */
  placeEntity(worldX: number, worldZ: number): void {
    if (this._selectedEntityTool === null || this._selectedEntityTool === "hiddenTerrain") return;
    const x = MapEditor.snapToGrid(worldX);
    const z = MapEditor.snapToGrid(worldZ);

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

  /** Read-only view of placed hidden terrain zones. */
  getEditorHiddenTerrainZones(): readonly EditorHiddenTerrainZone[] {
    return this._hiddenTerrainZones;
  }

  /** Read-only view of placed yarn pickups. */
  getYarnPickups(): readonly EditorYarnPickup[] {
    return this._yarnPickups;
  }

  /**
   * Define a rectangular hidden terrain zone from two corner grid coordinates.
   * Coordinates are normalised so x1 <= x2 and z1 <= z2.
   */
  createHiddenTerrainZone(x1: number, z1: number, x2: number, z2: number): void {
    const nx1 = Math.min(x1, x2);
    const nz1 = Math.min(z1, z2);
    const nx2 = Math.max(x1, x2);
    const nz2 = Math.max(z1, z2);
    const zone: EditorHiddenTerrainZone = {
      x1: nx1,
      z1: nz1,
      x2: nx2,
      z2: nz2,
      height: this._selectedHiddenTerrainHeight,
      handle: this._createHiddenTerrainZoneMesh(nx1, nz1, nx2, nz2),
    };
    this._hiddenTerrainZones.push(zone);
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
   * world position. Position is snapped to the 1u grid before lookup.
   */
  deleteObjectAtPosition(worldX: number, worldZ: number): void {
    const gx = MapEditor.snapToGrid(worldX);
    const gz = MapEditor.snapToGrid(worldZ);
    const found = this._findPointObjectAt(gx, gz);
    if (!found) return;
    this._removeFoundObject(found);
  }

  // ── dispose ────────────────────────────────────────────────────────────────

  dispose(): void {
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

    // Clean up terrain meshes
    for (const zone of this._editorWaterZones) {
      if (zone.handle && this.sceneManager) {
        this.sceneManager.removeMesh(zone.handle);
      }
    }
    this._editorWaterZones = [];
    this._cancelWaterDrag();
    this._cancelHiddenDrag();
    this._cancelMoveDrag();
    this._editorToolMode = null;

    // Clean up entity meshes (US-303)
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

    for (const z of this._hiddenTerrainZones) {
      if (z.handle && this.sceneManager) this.sceneManager.removeMesh(z.handle);
    }
    this._hiddenTerrainZones = [];

    for (const p of this._yarnPickups) {
      if (p.handle && this.sceneManager) this.sceneManager.removeMesh(p.handle);
    }
    this._yarnPickups = [];

    this._selectedBlock = null;
    if (this._banner) {
      this._banner.remove();
      this._banner = null;
    }
    if (this._panel) {
      this._panel.remove();
      this._panel = null;
    }
    this._removeGhost();
    this._active = false;
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
      const snappedX = MapEditor.snapToGrid(worldPos.x);
      const snappedZ = MapEditor.snapToGrid(worldPos.z);

      // Terrain ghost
      if (this._selectedTool) {
        this._updateGhost(snappedX, snappedZ);
      }

      // Water zone drag ghost
      if (this._selectedTool === TerrainType.Water && this._waterDragStart) {
        this._updateWaterDragGhost(
          this._waterDragStart.x,
          this._waterDragStart.z,
          snappedX,
          snappedZ,
        );
      }

      // Hidden terrain drag ghost
      if (this._selectedEntityTool === "hiddenTerrain" && this._hiddenDragStart) {
        this._updateHiddenDragGhost(
          this._hiddenDragStart.x,
          this._hiddenDragStart.z,
          snappedX,
          snappedZ,
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
      const sx = MapEditor.snapToGrid(worldPos.x);
      const sz = MapEditor.snapToGrid(worldPos.z);

      if (this._selectedTool === TerrainType.Water) {
        this._waterDragStart = { x: sx, z: sz };
      } else if (this._selectedEntityTool === "hiddenTerrain") {
        this._hiddenDragStart = { x: sx, z: sz };
      } else if (this._editorToolMode === "move") {
        // US-304: start move drag — find object at click position
        const found = this._findPointObjectAt(sx, sz);
        if (found) {
          this._movingObject = found;
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
        const endX = worldPos
          ? MapEditor.snapToGrid(worldPos.x)
          : this._waterDragStart.x;
        const endZ = worldPos
          ? MapEditor.snapToGrid(worldPos.z)
          : this._waterDragStart.z;

        if (endX !== this._waterDragStart.x || endZ !== this._waterDragStart.z) {
          this.createWaterZone(
            this._waterDragStart.x,
            this._waterDragStart.z,
            endX,
            endZ,
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
        const endX = worldPos
          ? MapEditor.snapToGrid(worldPos.x)
          : this._hiddenDragStart.x;
        const endZ = worldPos
          ? MapEditor.snapToGrid(worldPos.z)
          : this._hiddenDragStart.z;

        if (endX !== this._hiddenDragStart.x || endZ !== this._hiddenDragStart.z) {
          this.createHiddenTerrainZone(
            this._hiddenDragStart.x,
            this._hiddenDragStart.z,
            endX,
            endZ,
          );
          this._suppressNextClick = true;
        }
        this._cancelHiddenDrag();
      }

      // US-304: finalize move drag
      if (this._movingObject) {
        this._suppressNextClick = true;
        this._movingObject = null;
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
        const gx = MapEditor.snapToGrid(worldPos.x);
        const gz = MapEditor.snapToGrid(worldPos.z);
        const block =
          this._editorBlocks.find((b) => b.x === gx && b.z === gz) ?? null;
        this.selectBlock(block);
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
    x1: number,
    z1: number,
    x2: number,
    z2: number,
  ): void {
    if (!this.sceneManager) return;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);
    const width = maxX - minX + 1;
    const depth = maxZ - minZ + 1;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

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
    x1: number,
    z1: number,
    x2: number,
    z2: number,
  ): void {
    if (!this.sceneManager) return;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);
    const width = maxX - minX + 1;
    const depth = maxZ - minZ + 1;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

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

  private _createWaterZoneMesh(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
  ): SceneHandle | null {
    if (!this.sceneManager) return null;
    const width = x2 - x1 + 1;
    const depth = z2 - z1 + 1;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const handle = this.sceneManager.addMesh({
      geometry: "box",
      dims: [1, 1, 1],
      color: EDITOR_TERRAIN_COLORS[TerrainType.Water],
      opacity: 0.5,
    });
    this.sceneManager.updateTransform(
      handle,
      { x: cx, y: 0.1, z: cz },
      { x: 0, y: 0, z: 0 },
      { x: width, y: 0.2, z: depth },
    );
    return handle;
  }

  private _createHiddenTerrainZoneMesh(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
  ): SceneHandle | null {
    if (!this.sceneManager) return null;
    const width = x2 - x1 + 1;
    const depth = z2 - z1 + 1;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const handle = this.sceneManager.addMesh({
      geometry: "box",
      dims: [1, 1, 1],
      color: ENTITY_COLORS.hiddenTerrain,
      opacity: 0.5,
    });
    this.sceneManager.updateTransform(
      handle,
      { x: cx, y: 0.1, z: cz },
      { x: 0, y: 0, z: 0 },
      { x: width, y: 0.2, z: depth },
    );
    return handle;
  }

  // ── Private — ghost preview helpers ───────────────────────────────────────

  private _updateGhost(x: number, z: number): void {
    if (!this.sceneManager || !this._selectedTool) return;
    this._ghostX = x;
    this._ghostZ = z;
    if (!this._ghostHandle) {
      this._ghostHandle = this.sceneManager.addMesh({
        geometry: "box",
        dims: [1, 1, 1],
        color: EDITOR_TERRAIN_COLORS[this._selectedTool],
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

  /** Find the first point object at grid position (gx, gz). Zones are excluded. */
  private _findPointObjectAt(gx: number, gz: number): MovingObject | null {
    const block = this._editorBlocks.find((b) => b.x === gx && b.z === gz);
    if (block) return { kind: "block", obj: block };

    if (this._playerSpawn && this._playerSpawn.x === gx && this._playerSpawn.z === gz) {
      return { kind: "playerSpawn", obj: this._playerSpawn };
    }
    const cat = this._catSpawns.find((s) => s.x === gx && s.z === gz);
    if (cat) return { kind: "catSpawn", obj: cat };

    const node = this._resourceNodes.find((n) => n.x === gx && n.z === gz);
    if (node) return { kind: "resourceNode", obj: node };

    const yarn = this._yarnPickups.find((p) => p.x === gx && p.z === gz);
    if (yarn) return { kind: "yarnPickup", obj: yarn };

    return null;
  }

  /** Remove a found object from its collection and the scene. */
  private _removeFoundObject(found: MovingObject): void {
    switch (found.kind) {
      case "block": {
        if (found.obj.handle && this.sceneManager) {
          this.sceneManager.removeMesh(found.obj.handle);
        }
        const idx = this._editorBlocks.indexOf(found.obj);
        if (idx !== -1) this._editorBlocks.splice(idx, 1);
        if (this._selectedBlock === found.obj) {
          this._selectedBlock = null;
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
      const h = found.obj.height;
      this.sceneManager.updateTransform(
        found.obj.handle,
        { x, y: h / 2, z },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: h, z: 1 },
      );
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

  // ── Private — block mesh helpers ──────────────────────────────────────────

  private _createBlockMesh(
    x: number,
    z: number,
    type: TerrainType,
    height: number,
  ): SceneHandle | null {
    if (!this.sceneManager) return null;
    const handle = this.sceneManager.addMesh({
      geometry: "box",
      dims: [1, 1, 1], // unit cube — height controlled via scale.y
      color: EDITOR_TERRAIN_COLORS[type],
    });
    this.sceneManager.updateTransform(
      handle,
      { x, y: height / 2, z },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: height, z: 1 },
    );
    return handle;
  }
}
