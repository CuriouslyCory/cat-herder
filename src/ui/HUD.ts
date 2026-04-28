const HEARTS = 5;

export class HUD {
  private readonly root: HTMLElement;
  private readonly heartsEl: HTMLElement;
  private readonly fpsEl: HTMLElement | null;

  private frameCount = 0;
  private fpsTimer = 0;
  private lastFps = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, styles.root);

    // ── Hearts (top-left) ────────────────────────────────────────────────────
    this.heartsEl = document.createElement("div");
    Object.assign(this.heartsEl.style, styles.hearts);
    this.setHearts(HEARTS);
    this.root.appendChild(this.heartsEl);

    // ── FPS counter (top-right, dev-only) ─────────────────────────────────
    if (import.meta.env.DEV) {
      this.fpsEl = document.createElement("div");
      Object.assign(this.fpsEl.style, styles.fps);
      this.fpsEl.textContent = "FPS: --";
      this.root.appendChild(this.fpsEl);
    } else {
      this.fpsEl = null;
    }

    container.appendChild(this.root);
  }

  /** Called once per frame with elapsed time in seconds. */
  update(dt: number): void {
    if (!this.fpsEl) return;
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.lastFps = Math.round(this.frameCount / this.fpsTimer);
      this.fpsEl.textContent = `FPS: ${this.lastFps}`;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }
  }

  setHearts(count: number): void {
    this.heartsEl.textContent = "♥ ".repeat(Math.max(0, Math.min(count, HEARTS))).trimEnd();
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.root);
  }

  unmount(): void {
    this.root.remove();
  }
}

const styles: Record<string, Partial<CSSStyleDeclaration>> = {
  root: {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "50",
    fontFamily: "system-ui, sans-serif",
    color: "#fff",
  },
  hearts: {
    position: "absolute",
    top: "12px",
    left: "16px",
    fontSize: "1.6rem",
    letterSpacing: "0.15em",
    textShadow: "0 0 4px rgba(0,0,0,0.8)",
  },
  fps: {
    position: "absolute",
    top: "12px",
    right: "16px",
    fontSize: "0.85rem",
    opacity: "0.7",
    background: "rgba(0,0,0,0.4)",
    padding: "2px 6px",
    borderRadius: "4px",
  },
};
