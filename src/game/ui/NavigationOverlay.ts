import type { MapData } from "../maps/MapData";
import { TerrainType, ResourceType } from "../types";
import type { Component } from "../ecs/Component";
import type { Transform } from "../ecs/components/Transform";
import type { ResourceNode } from "../ecs/components/ResourceNode";

// ---------------------------------------------------------------------------
// Minimal interfaces — avoids importing concrete MapManager/World and their
// Three.js transitive dependencies, which would break tests.
// ---------------------------------------------------------------------------

interface MapManagerLike {
  getMapData(): MapData | null;
}

interface WorldLike {
  query(...componentTypes: string[]): number[];
  getComponent<T extends Component>(entity: number, type: string): T | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANVAS_SIZE = 400;

const TERRAIN_FILL: Partial<Record<TerrainType, string>> = {
  [TerrainType.Grass]: "#4a7c59",
  [TerrainType.Dirt]: "#8b6355",
  [TerrainType.Stone]: "#6e7074",
  [TerrainType.Water]: "#1565c0",
};

const RESOURCE_FILL: Record<ResourceType, string> = {
  [ResourceType.Grass]: "#7bc67e",
  [ResourceType.Sticks]: "#a0522d",
  [ResourceType.Water]: "#4fc3f7",
};

// ---------------------------------------------------------------------------
// NavigationOverlay
//
// Renders a 400×400 2D top-down minimap over the game canvas. Toggled by the
// caller via open()/close()/toggle(). While visible, all keyboard events are
// consumed (capture phase stopImmediatePropagation) so game input is blocked.
// ---------------------------------------------------------------------------

export class NavigationOverlay {
  private _container: HTMLElement | null = null;
  private _mapCanvas: HTMLCanvasElement | null = null;
  private _visible = false;

  private readonly _world: WorldLike;
  private readonly _mapManager: MapManagerLike;
  private readonly _getPlayerEntity: () => number | null;
  private readonly _onKeyDown: (e: KeyboardEvent) => void;

  constructor(
    hostCanvas: HTMLCanvasElement,
    world: WorldLike,
    mapManager: MapManagerLike,
    getPlayerEntity: () => number | null,
  ) {
    this._world = world;
    this._mapManager = mapManager;
    this._getPlayerEntity = getPlayerEntity;

    this._build(hostCanvas);

    this._onKeyDown = (e: KeyboardEvent) => {
      if (!this._visible) return;
      // Consume all keyboard input while overlay is open — blocks game movement
      // and action processing (InputManager uses bubble phase on document).
      e.stopImmediatePropagation();
      if (e.code === "KeyM" || e.code === "Escape") {
        e.preventDefault();
        this.close();
      }
    };

    document.addEventListener("keydown", this._onKeyDown, true);
  }

  // ── Private build ─────────────────────────────────────────────────────────

  private _build(hostCanvas: HTMLCanvasElement): void {
    const parent = hostCanvas.parentElement ?? document.body;

    const container = document.createElement("div");
    container.style.cssText =
      "position:absolute;inset:0;display:none;align-items:center;" +
      "justify-content:center;background:rgba(0,0,0,0.6);z-index:8888;" +
      "pointer-events:all;";

    const mapCanvas = document.createElement("canvas") as HTMLCanvasElement;
    mapCanvas.width = CANVAS_SIZE;
    mapCanvas.height = CANVAS_SIZE;
    mapCanvas.style.cssText =
      "border-radius:8px;border:1px solid rgba(255,255,255,0.2);display:block;";

    container.appendChild(mapCanvas);
    parent.appendChild(container);

    this._container = container;
    this._mapCanvas = mapCanvas;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  open(): void {
    if (!this._container) return;
    this._visible = true;
    this._container.style.display = "flex";
    this._drawMap();
  }

  close(): void {
    if (!this._container) return;
    this._visible = false;
    this._container.style.display = "none";
  }

  toggle(): void {
    if (this._visible) {
      this.close();
    } else {
      this.open();
    }
  }

  isVisible(): boolean {
    return this._visible;
  }

  /** Called once per render frame by the game loop to keep the map fresh. */
  update(_dt: number): void {
    if (this._visible) {
      this._drawMap();
    }
  }

  dispose(): void {
    document.removeEventListener("keydown", this._onKeyDown, true);
    this._container?.remove();
    this._container = null;
    this._mapCanvas = null;
    this._visible = false;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private _drawMap(): void {
    const canvas = this._mapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "rgba(10,10,20,0.95)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const mapData = this._mapManager.getMapData();
    if (!mapData) {
      ctx.fillStyle = "#666";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("No map loaded", CANVAS_SIZE / 2, CANVAS_SIZE / 2);
      return;
    }

    this._drawTerrain(ctx, mapData);
    this._drawResourceNodes(ctx, mapData);
    this._drawCats(ctx, mapData);
    this._drawPlayer(ctx, mapData);
  }

  /**
   * Convert world (x, z) coordinates to canvas pixel (px, py).
   * The map is centered at world origin; edges are at ±size/2.
   */
  worldToPixel(
    worldX: number,
    worldZ: number,
    mapData: MapData,
  ): { px: number; py: number } {
    const px = ((worldX + mapData.size.width / 2) / mapData.size.width) * CANVAS_SIZE;
    const py = ((worldZ + mapData.size.depth / 2) / mapData.size.depth) * CANVAS_SIZE;
    return { px, py };
  }

  private _drawTerrain(ctx: CanvasRenderingContext2D, mapData: MapData): void {
    const rows = mapData.terrain.length;
    const cols = rows > 0 ? (mapData.terrain[0]?.length ?? 0) : 0;
    if (rows === 0 || cols === 0) return;

    const cellW = CANVAS_SIZE / cols;
    const cellH = CANVAS_SIZE / rows;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = mapData.terrain[row]?.[col];
        if (!cell) continue;
        // Hidden terrain is not shown (unless revealed — future enhancement)
        const color = TERRAIN_FILL[cell.type];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
      }
    }
  }

  private _drawResourceNodes(ctx: CanvasRenderingContext2D, mapData: MapData): void {
    const entities = this._world.query("ResourceNode", "Transform");
    for (const entity of entities) {
      const node = this._world.getComponent<ResourceNode>(entity, "ResourceNode");
      const transform = this._world.getComponent<Transform>(entity, "Transform");
      if (!node || !transform) continue;
      if (node.cooldownRemaining > 0) continue;

      const { px, py } = this.worldToPixel(transform.x, transform.z, mapData);
      ctx.fillStyle = RESOURCE_FILL[node.resourceType] ?? "#888";
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  private _drawCats(ctx: CanvasRenderingContext2D, mapData: MapData): void {
    const entities = this._world.query("CatBehavior", "Transform");
    for (const entity of entities) {
      const transform = this._world.getComponent<Transform>(entity, "Transform");
      if (!transform) continue;

      const { px, py } = this.worldToPixel(transform.x, transform.z, mapData);
      ctx.fillStyle = "#c084fc";
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  private _drawPlayer(ctx: CanvasRenderingContext2D, mapData: MapData): void {
    const playerEntity = this._getPlayerEntity();
    if (playerEntity === null) return;
    const transform = this._world.getComponent<Transform>(playerEntity, "Transform");
    if (!transform) return;

    const { px, py } = this.worldToPixel(transform.x, transform.z, mapData);

    // Dot
    ctx.fillStyle = "#ff6b35";
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();

    // Direction triangle pointing in facing direction (rotationY = 0 → +Z)
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(transform.rotationY);
    ctx.fillStyle = "#ff6b35";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
