/**
 * HUD — plain DOM health, oxygen, and FPS overlay.
 *
 * Renders into a container supplied by UIManager. No React — keeps
 * the game loop framework-agnostic.
 *
 * Hearts panel:  bottom-left, always visible. Updates reactively via setHealth().
 * Oxygen gauge:  top-center, visible only while submerged. Updated via setOxygen().
 * FPS counter:   top-right, only in development builds.
 */
export class HUD {
  private heartsEl: HTMLElement | null = null;
  private oxygenPanel: HTMLElement | null = null;
  private oxygenBar: HTMLElement | null = null;
  private oxygenLabel: HTMLElement | null = null;
  private fpsEl: HTMLElement | null = null;

  /** Rolling window for FPS calculation (~1 second at 60 fps). */
  private readonly frameTimes: number[] = [];
  private static readonly FPS_WINDOW = 60;

  /** Tracks the current health value to avoid unnecessary DOM updates. */
  private currentHealth = 5;
  private currentMaxHealth = 5;

  /** Tracks whether the warning pulse CSS animation is active. */
  private warningActive = false;

  constructor(container: HTMLElement) {
    this.buildHearts(container);
    this.buildOxygenGauge(container);
    if (process.env.NODE_ENV === "development") {
      this.buildFps(container);
    }
  }

  /**
   * Called once per render frame by UIManager.
   * @param oxygenPercent  Current oxygen 0-100, or null when not submerged.
   * @param health         Current player health (integer hp).
   * @param maxHealth      Maximum player health.
   */
  update(
    dt: number,
    oxygenPercent: number | null = null,
    health = 5,
    maxHealth = 5,
  ): void {
    this.updateFps(dt);
    this.setOxygen(oxygenPercent);
    this.setHealth(health, maxHealth);
  }

  dispose(): void {
    this.heartsEl = null;
    this.oxygenPanel = null;
    this.oxygenBar = null;
    this.oxygenLabel = null;
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
    this.heartsEl = panel;
    container.appendChild(panel);
    this.renderHearts();
  }

  private buildOxygenGauge(container: HTMLElement): void {
    // Outer panel — centered at top, hidden when not submerged
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:absolute;top:16px;left:50%;transform:translateX(-50%);" +
      "display:none;flex-direction:column;align-items:center;gap:4px;" +
      "pointer-events:none;user-select:none;";

    // Label
    const label = document.createElement("div");
    label.textContent = "Oxygen";
    label.style.cssText =
      "font-family:monospace;font-size:11px;color:rgba(255,255,255,0.9);" +
      "text-shadow:0 1px 2px rgba(0,0,0,0.8);letter-spacing:1px;";

    // Track (background bar)
    const track = document.createElement("div");
    track.style.cssText =
      "width:120px;height:10px;background:rgba(0,0,0,0.45);border-radius:5px;overflow:hidden;";

    // Fill bar
    const fill = document.createElement("div");
    fill.style.cssText =
      "height:100%;width:100%;background:#4fc3f7;border-radius:5px;" +
      "transition:width 0.1s linear,background 0.2s;";

    track.appendChild(fill);
    panel.appendChild(label);
    panel.appendChild(track);
    container.appendChild(panel);

    this.oxygenPanel = panel;
    this.oxygenBar = fill;
    this.oxygenLabel = label;
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

  // ---------------------------------------------------------------------------
  // Private updaters
  // ---------------------------------------------------------------------------

  /**
   * Show or hide the oxygen gauge.
   * @param percent  0-100 when submerged; null hides the gauge.
   */
  private setOxygen(percent: number | null): void {
    if (!this.oxygenPanel || !this.oxygenBar || !this.oxygenLabel) return;

    if (percent === null) {
      this.oxygenPanel.style.display = "none";
      this.warningActive = false;
      return;
    }

    this.oxygenPanel.style.display = "flex";

    const clamped = Math.max(0, Math.min(100, percent));
    this.oxygenBar.style.width = `${clamped}%`;

    // Warning pulse: turns bar red and applies a CSS keyframe pulse at ≤20%
    const isWarning = clamped <= 20;
    if (isWarning !== this.warningActive) {
      this.warningActive = isWarning;
      if (isWarning) {
        this.oxygenBar.style.background = "#e53e3e";
        this.oxygenBar.style.animation = "oxygen-pulse 0.6s ease-in-out infinite alternate";
        this.oxygenLabel.style.color = "#feb2b2";
        this.ensurePulseKeyframes();
      } else {
        this.oxygenBar.style.background = "#4fc3f7";
        this.oxygenBar.style.animation = "";
        this.oxygenLabel.style.color = "rgba(255,255,255,0.9)";
      }
    }
  }

  /** Update the hearts display when health changes. */
  private setHealth(health: number, maxHealth: number): void {
    if (health === this.currentHealth && maxHealth === this.currentMaxHealth) return;
    this.currentHealth = health;
    this.currentMaxHealth = maxHealth;
    this.renderHearts();
  }

  private renderHearts(): void {
    if (!this.heartsEl) return;
    this.heartsEl.innerHTML = "";

    for (let i = 0; i < this.currentMaxHealth; i++) {
      const heart = document.createElement("span");
      heart.textContent = "♥";
      const isFull = i < this.currentHealth;
      heart.style.cssText =
        `font-size:24px;color:${isFull ? "#e53e3e" : "rgba(229,62,62,0.25)"};` +
        "text-shadow:0 1px 3px rgba(0,0,0,0.6);line-height:1;";
      this.heartsEl.appendChild(heart);
    }
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

  /** Inject the @keyframes rule for the oxygen warning pulse (once per document). */
  private ensurePulseKeyframes(): void {
    const RULE_ID = "__oxygen-pulse-style";
    if (document.getElementById(RULE_ID)) return;
    const style = document.createElement("style");
    style.id = RULE_ID;
    style.textContent =
      "@keyframes oxygen-pulse{from{opacity:1}to{opacity:0.35}}";
    document.head.appendChild(style);
  }
}
