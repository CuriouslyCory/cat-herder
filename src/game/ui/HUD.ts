/**
 * HUD — plain DOM health and FPS overlay.
 *
 * Renders into a container supplied by UIManager. No React — keeps
 * the game loop framework-agnostic.
 *
 * Hearts panel: bottom-left, always visible.
 * FPS counter: top-right, only in development builds.
 */
export class HUD {
  private heartsEl: HTMLElement | null = null;
  private fpsEl: HTMLElement | null = null;

  /** Rolling window for FPS calculation (~1 second at 60 fps). */
  private readonly frameTimes: number[] = [];
  private static readonly FPS_WINDOW = 60;

  constructor(container: HTMLElement) {
    this.buildHearts(container);
    if (process.env.NODE_ENV === "development") {
      this.buildFps(container);
    }
  }

  update(dt: number): void {
    this.updateFps(dt);
  }

  dispose(): void {
    this.heartsEl = null;
    this.fpsEl = null;
    this.frameTimes.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Private builders
  // ---------------------------------------------------------------------------

  private buildHearts(container: HTMLElement): void {
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:absolute;bottom:16px;left:16px;" +
      "display:flex;gap:6px;pointer-events:none;user-select:none;";

    for (let i = 0; i < 3; i++) {
      const heart = document.createElement("span");
      heart.textContent = "♥";
      heart.style.cssText =
        "font-size:24px;color:#e53e3e;" +
        "text-shadow:0 1px 3px rgba(0,0,0,0.6);line-height:1;";
      panel.appendChild(heart);
    }

    this.heartsEl = panel;
    container.appendChild(panel);
  }

  private buildFps(container: HTMLElement): void {
    const el = document.createElement("div");
    el.style.cssText =
      "position:absolute;top:8px;right:8px;" +
      "font-family:monospace;font-size:12px;" +
      "color:rgba(255,255,255,0.8);background:rgba(0,0,0,0.4);" +
      "padding:2px 6px;border-radius:3px;" +
      "pointer-events:none;user-select:none;";
    el.textContent = "FPS: --";
    this.fpsEl = el;
    container.appendChild(el);
  }

  private updateFps(dt: number): void {
    if (!this.fpsEl) return;

    this.frameTimes.push(dt);
    if (this.frameTimes.length > HUD.FPS_WINDOW) {
      this.frameTimes.shift();
    }

    if (this.frameTimes.length > 0) {
      const avg =
        this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      const fps = avg > 0 ? Math.round(1 / avg) : 0;
      this.fpsEl.textContent = `FPS: ${fps}`;
    }
  }
}
