import { HUD } from "./HUD";

/**
 * Manages mounting / unmounting DOM UI panels that overlay the Three.js canvas.
 * Add additional panel types here as the game grows.
 */
export class UIManager {
  private readonly container: HTMLElement;
  private readonly hud: HUD;

  constructor() {
    // Create a full-viewport container that sits above the canvas
    this.container = document.createElement("div");
    Object.assign(this.container.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "50",
    });
    document.body.appendChild(this.container);

    this.hud = new HUD(this.container);
  }

  /** Called once per frame — passes dt to panels that need animation. */
  update(dt: number): void {
    this.hud.update(dt);
  }

  /** Expose the HUD so callers can update game state (e.g. health). */
  getHUD(): HUD {
    return this.hud;
  }

  dispose(): void {
    this.container.remove();
  }
}
