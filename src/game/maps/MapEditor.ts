import type { MapData } from "./MapData";
import type { CameraController } from "../engine/CameraController";
import type { MeshConfig, SceneHandle } from "../engine/SceneManager";
import { TerrainType } from "../types";

// ---------------------------------------------------------------------------
// MapEditor — developer-facing map editor, dev builds only.
//
// Gated by process.env.NODE_ENV === 'production'. Constructor returns early
// in production, leaving all element refs null and _active always false.
//
// Ctrl+E toggles editor mode. Entering pauses the game and switches camera to
// free mode. Exiting resumes the game and restores follow camera mode.
//
// US-302a adds:
//   - Left-side panel with terrain tool palette (Grass/Dirt/Stone/Water)
//   - Ghost preview block follows mouse at grid-snapped position
//   - Left-click places terrain block at snapped world position
//   - Internal EditorBlock list tracks placed blocks independent of MapManager
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
}

export interface EditorBlock {
  x: number;
  z: number;
  type: TerrainType;
  height: number;
  handle: SceneHandle | null;
}

// Colors matching MapManager TERRAIN_COLORS (kept in sync manually).
const EDITOR_TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.Grass]: "#4a7c59",
  [TerrainType.Dirt]: "#8b6355",
  [TerrainType.Stone]: "#6e7074",
  [TerrainType.Water]: "#1565c0",
  [TerrainType.Hidden]: "#1a1a2e",
};

// Only these four types are user-placeable from the palette.
const PLACEABLE_TOOLS: readonly TerrainType[] = [
  TerrainType.Grass,
  TerrainType.Dirt,
  TerrainType.Stone,
  TerrainType.Water,
];

export class MapEditor {
  private _active = false;
  private _mapData: MapData | null = null;
  private _banner: HTMLElement | null = null;
  private _panel: HTMLElement | null = null;
  private _selectedTool: TerrainType | null = null;
  private _editorBlocks: EditorBlock[] = [];
  private _ghostHandle: SceneHandle | null = null;
  private _ghostX = 0;
  private _ghostZ = 0;

  private readonly _toolButtons = new Map<TerrainType, HTMLElement>();
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private _mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
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

  // ── Public API ─────────────────────────────────────────────────────────────

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
    this.cameraController.setMode("follow");
    this.gameLifecycle.resume();
    if (this._banner) this._banner.style.display = "none";
    if (this._panel) this._panel.style.display = "none";
    this._removeGhost();
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

  /** Currently selected terrain tool, or null if none. */
  getSelectedTool(): TerrainType | null {
    return this._selectedTool;
  }

  /** Select a tool from the palette. Pass null to deselect. */
  selectTool(type: TerrainType | null): void {
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

  dispose(): void {
    if (this._keydownHandler) {
      document.removeEventListener("keydown", this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this._mouseMoveHandler) {
      this.container.removeEventListener("mousemove", this._mouseMoveHandler);
      this._mouseMoveHandler = null;
    }
    if (this._clickHandler) {
      this.container.removeEventListener("click", this._clickHandler);
      this._clickHandler = null;
    }
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

  // ── Private ─────────────────────────────────────────────────────────────────

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

    const title = document.createElement("div");
    title.style.cssText =
      "font-weight:bold;font-size:13px;letter-spacing:1px;margin-bottom:4px;";
    title.textContent = "Terrain";
    panel.appendChild(title);

    for (const type of PLACEABLE_TOOLS) {
      panel.appendChild(this._buildToolButton(type));
    }

    const parent = this.container.parentElement ?? document.body;
    parent.appendChild(panel);
    this._panel = panel;
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

  private _registerKeyboard(): void {
    this._keydownHandler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "e" && e.ctrlKey) {
        e.preventDefault();
        if (this._active) {
          this.disable();
        } else {
          this.enable();
        }
      }
    };
    document.addEventListener("keydown", this._keydownHandler);
  }

  private _registerMouseHandlers(): void {
    this._mouseMoveHandler = (e: MouseEvent) => {
      if (!this._active || !this._selectedTool || !this.sceneManager) return;
      const rect = this.container.getBoundingClientRect();
      const worldPos = this.sceneManager.screenToWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
        this._ghostHandle ? new Set([this._ghostHandle]) : undefined,
      );
      if (!worldPos) return;
      this._updateGhost(
        MapEditor.snapToGrid(worldPos.x),
        MapEditor.snapToGrid(worldPos.z),
      );
    };
    this.container.addEventListener("mousemove", this._mouseMoveHandler);

    this._clickHandler = (e: MouseEvent) => {
      if (!this._active || !this._selectedTool) return;
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
    };
    this.container.addEventListener("click", this._clickHandler);
  }

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

  private _removeGhost(): void {
    if (this._ghostHandle && this.sceneManager) {
      this.sceneManager.removeMesh(this._ghostHandle);
    }
    this._ghostHandle = null;
  }

  private _createBlockMesh(
    x: number,
    z: number,
    type: TerrainType,
    height: number,
  ): SceneHandle | null {
    if (!this.sceneManager) return null;
    const handle = this.sceneManager.addMesh({
      geometry: "box",
      dims: [1, height, 1],
      color: EDITOR_TERRAIN_COLORS[type],
    });
    this.sceneManager.updateTransform(
      handle,
      { x, y: height / 2, z },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    );
    return handle;
  }
}
