import type { MapData } from "./MapData";
import type { CameraController } from "../engine/CameraController";

// ---------------------------------------------------------------------------
// MapEditor — developer-facing map editor, dev builds only.
//
// Gated by process.env.NODE_ENV === 'production'. Constructor returns early
// in production, leaving all element refs null and _active always false.
//
// Ctrl+E toggles editor mode. Entering pauses the game and switches camera to
// free mode. Exiting resumes the game and restores follow camera mode.
// ---------------------------------------------------------------------------

interface GameLifecycle {
  pause(): void;
  resume(): void;
}

export class MapEditor {
  private _active = false;
  private _mapData: MapData | null = null;
  private _banner: HTMLElement | null = null;
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly cameraController: CameraController,
    private readonly gameLifecycle: GameLifecycle,
  ) {
    if (process.env.NODE_ENV === "production") return;
    this._buildBanner();
    this._registerKeyboard();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  enable(): void {
    if (!this._banner) return; // production guard (banner null in prod)
    if (this._active) return;
    this._active = true;
    this.gameLifecycle.pause();
    this.cameraController.setMode("free");
    this._banner.style.display = "block";
  }

  disable(): void {
    if (!this._active) return;
    this._active = false;
    this.cameraController.setMode("follow");
    this.gameLifecycle.resume();
    if (this._banner) this._banner.style.display = "none";
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

  dispose(): void {
    if (this._keydownHandler) {
      document.removeEventListener("keydown", this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this._banner) {
      this._banner.remove();
      this._banner = null;
    }
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
}
