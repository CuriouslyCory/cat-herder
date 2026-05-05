import type { GameState } from "../engine/GameState";
import type { EventBus } from "../engine/EventBus";
import type { GameConfig } from "../config";
import { CONFIG } from "../config";
import type { World } from "../ecs/World";

// ---------------------------------------------------------------------------
// DebugMenu — tabbed dev overlay, dev builds only.
//
// Gated by process.env.NODE_ENV === 'development'. Constructor returns early
// in production, leaving all element refs null.
//
// Ctrl+D toggles open/closed. Does NOT pause the game loop.
// ---------------------------------------------------------------------------

type TabId = "player" | "cats" | "world" | "session";

export class DebugMenu {
  private panel: HTMLElement | null = null;
  private _visible = false;

  // Player tab element refs (null until panel is built)
  private levelInput: HTMLInputElement | null = null;
  private healthSlider: HTMLInputElement | null = null;
  private yarnInput: HTMLInputElement | null = null;
  private teleportXInput: HTMLInputElement | null = null;
  private teleportZInput: HTMLInputElement | null = null;
  private speedSlider: HTMLInputElement | null = null;
  private godModeCheckbox: HTMLInputElement | null = null;

  // Transient debug state — NEVER included in GameState.serialize()
  readonly debugState: { godMode: boolean; speedMultiplier: number } = {
    godMode: false,
    speedMultiplier: 1.0,
  };

  private readonly _baseWalkSpeed: number;
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly gameState: GameState,
    private readonly eventBus: EventBus,
    private readonly runtimeCfg: GameConfig,
    private readonly world: World,
    // Optional: if provided, performs a real physics teleport on the player entity.
    private readonly teleportPlayer?: (x: number, z: number) => void,
  ) {
    this._baseWalkSpeed = CONFIG.walkSpeed;
    if (process.env.NODE_ENV !== "development") return;
    this._build();
    this._registerKeyboard();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  get isOpen(): boolean {
    return this._visible;
  }

  toggle(): void {
    if (!this.panel) return;
    this._visible = !this._visible;
    this.panel.style.display = this._visible ? "flex" : "none";
    this.eventBus.emit({ type: "debug:toggled", visible: this._visible });
  }

  // ── Apply methods (called by DOM handlers and directly in tests) ──────────

  applyLevel(value: number): void {
    const n = Math.max(0, Math.min(10, Math.round(value)));
    this.gameState.set<number>("player.stats.level", n);
    this.eventBus.emit({ type: "debug:value-changed", key: "player.stats.level", value: n });
  }

  applyHealth(value: number): void {
    const maxHealth = this.gameState.get<number>("player.stats.maxHealth");
    const n = Math.max(0, Math.min(maxHealth, Math.round(value)));
    this.gameState.set<number>("player.stats.health", n);
    this.eventBus.emit({ type: "debug:value-changed", key: "player.stats.health", value: n });
  }

  applyYarn(value: number): void {
    const n = Math.max(0, Math.min(99, Math.round(value)));
    this.gameState.set<number>("player.yarn", n);
    this.eventBus.emit({ type: "debug:value-changed", key: "player.yarn", value: n });
  }

  applyTeleport(x: number, z: number): void {
    const pos = { x, y: 1, z };
    this.gameState.set("player.position", pos);
    this.teleportPlayer?.(x, z);
    this.eventBus.emit({ type: "debug:value-changed", key: "player.position", value: pos });
  }

  applySpeedMultiplier(multiplier: number): void {
    const m = Math.max(0.5, Math.min(3.0, multiplier));
    this.debugState.speedMultiplier = m;
    this.runtimeCfg.walkSpeed = this._baseWalkSpeed * m;
    this.eventBus.emit({
      type: "debug:value-changed",
      key: "runtimeConfig.walkSpeed",
      value: this.runtimeCfg.walkSpeed,
    });
  }

  applyGodMode(enabled: boolean): void {
    this.debugState.godMode = enabled;
    this.eventBus.emit({ type: "debug:value-changed", key: "debug.godMode", value: enabled });
  }

  dispose(): void {
    if (this._keydownHandler) {
      document.removeEventListener("keydown", this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    this.levelInput = null;
    this.healthSlider = null;
    this.yarnInput = null;
    this.teleportXInput = null;
    this.teleportZInput = null;
    this.speedSlider = null;
    this.godModeCheckbox = null;
  }

  // ── Private — panel construction ─────────────────────────────────────────

  private _build(): void {
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);" +
      "width:380px;max-height:520px;overflow-y:auto;" +
      "background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.15);" +
      "border-radius:8px;display:none;flex-direction:column;" +
      "font-family:monospace;color:rgba(255,255,255,0.9);" +
      "z-index:9999;user-select:none;pointer-events:all;";

    const header = document.createElement("div");
    header.style.cssText =
      "padding:10px 14px 6px;border-bottom:1px solid rgba(255,255,255,0.1);" +
      "font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.5);";
    header.textContent = "DEBUG MENU  [Ctrl+D to close]";
    panel.appendChild(header);

    const tabBar = document.createElement("div");
    tabBar.style.cssText =
      "display:flex;border-bottom:1px solid rgba(255,255,255,0.1);";
    panel.appendChild(tabBar);

    const contentArea = document.createElement("div");
    contentArea.style.cssText = "flex:1;overflow-y:auto;";
    panel.appendChild(contentArea);

    const tabs: TabId[] = ["player", "cats", "world", "session"];
    const tabBtns: HTMLElement[] = [];
    const tabPanels = new Map<TabId, HTMLElement>();

    for (const tab of tabs) {
      const btn = document.createElement("button");
      btn.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
      btn.style.cssText =
        "flex:1;padding:7px 4px;background:transparent;border:none;" +
        "font-family:monospace;font-size:11px;cursor:pointer;letter-spacing:1px;" +
        "color:rgba(255,255,255,0.45);transition:color 0.15s,border-bottom 0.15s;" +
        "border-bottom:2px solid transparent;";
      btn.addEventListener("click", () => this._activateTab(tab, tabBtns, tabPanels));
      tabBar.appendChild(btn);
      tabBtns.push(btn);

      const pane = document.createElement("div");
      pane.style.cssText = "display:none;flex-direction:column;gap:10px;padding:14px;";
      contentArea.appendChild(pane);
      tabPanels.set(tab, pane);
    }

    this._buildPlayerTab(tabPanels.get("player")!);
    this._buildPlaceholderTab(tabPanels.get("cats")!, "Cats tab — coming in US-207");
    this._buildPlaceholderTab(tabPanels.get("world")!, "World tab — coming in US-208");
    this._buildPlaceholderTab(tabPanels.get("session")!, "Session tab — coming in US-209");

    this.container.appendChild(panel);
    this.panel = panel;

    // Activate the Player tab by default
    this._activateTab("player", tabBtns, tabPanels);
  }

  private _activateTab(
    id: TabId,
    btns: HTMLElement[],
    panels: Map<TabId, HTMLElement>,
  ): void {
    const tabs: TabId[] = ["player", "cats", "world", "session"];
    for (let i = 0; i < tabs.length; i++) {
      const isActive = tabs[i] === id;
      const btn = btns[i];
      const pane = panels.get(tabs[i]!);
      if (btn) {
        btn.style.color = isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)";
        btn.style.borderBottom = isActive
          ? "2px solid rgba(255,255,255,0.7)"
          : "2px solid transparent";
      }
      if (pane) {
        pane.style.display = isActive ? "flex" : "none";
      }
    }
  }

  private _buildPlayerTab(container: HTMLElement): void {
    // Level
    container.appendChild(
      this._row("Level", this._buildNumberInput({
        min: 0, max: 10, step: 1,
        value: this.gameState.get<number>("player.stats.level"),
        onChange: (v) => this.applyLevel(v),
        ref: (el) => { this.levelInput = el; },
      })),
    );

    // Health
    container.appendChild(
      this._row("Health", this._buildRangeSlider({
        min: 0,
        max: this.gameState.get<number>("player.stats.maxHealth"),
        step: 1,
        value: this.gameState.get<number>("player.stats.health"),
        onChange: (v) => this.applyHealth(v),
        ref: (el) => { this.healthSlider = el; },
      })),
    );

    // Yarn
    container.appendChild(
      this._row("Yarn", this._buildNumberInput({
        min: 0, max: 99, step: 1,
        value: this.gameState.get<number>("player.yarn"),
        onChange: (v) => this.applyYarn(v),
        ref: (el) => { this.yarnInput = el; },
      })),
    );

    // Teleport
    const teleportRow = document.createElement("div");
    teleportRow.style.cssText =
      "display:flex;align-items:center;gap:6px;flex-wrap:wrap;";

    const teleportLabel = document.createElement("span");
    teleportLabel.style.cssText =
      "font-size:11px;color:rgba(255,255,255,0.55);min-width:72px;";
    teleportLabel.textContent = "Teleport";

    const xInput = document.createElement("input") as HTMLInputElement;
    xInput.type = "number";
    xInput.placeholder = "X";
    xInput.style.cssText = this._inputCss("55px");
    this.teleportXInput = xInput;

    const zInput = document.createElement("input") as HTMLInputElement;
    zInput.type = "number";
    zInput.placeholder = "Z";
    zInput.style.cssText = this._inputCss("55px");
    this.teleportZInput = zInput;

    const teleportBtn = document.createElement("button");
    teleportBtn.textContent = "Go";
    teleportBtn.style.cssText =
      "padding:3px 10px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);" +
      "border-radius:4px;font-family:monospace;font-size:11px;color:rgba(255,255,255,0.85);" +
      "cursor:pointer;";
    teleportBtn.addEventListener("click", () => {
      const x = parseFloat(xInput.value);
      const z = parseFloat(zInput.value);
      if (!isNaN(x) && !isNaN(z)) this.applyTeleport(x, z);
    });

    teleportRow.appendChild(teleportLabel);
    teleportRow.appendChild(xInput);
    teleportRow.appendChild(zInput);
    teleportRow.appendChild(teleportBtn);
    container.appendChild(teleportRow);

    // Speed multiplier
    container.appendChild(
      this._row("Speed ×", this._buildRangeSlider({
        min: 0.5, max: 3.0, step: 0.1,
        value: 1.0,
        onChange: (v) => this.applySpeedMultiplier(v),
        ref: (el) => { this.speedSlider = el; },
        showValue: true,
      })),
    );

    // God mode
    const godRow = document.createElement("div");
    godRow.style.cssText = "display:flex;align-items:center;gap:8px;";

    const godLabel = document.createElement("span");
    godLabel.style.cssText =
      "font-size:11px;color:rgba(255,255,255,0.55);min-width:72px;";
    godLabel.textContent = "God mode";

    const godCheckbox = document.createElement("input") as HTMLInputElement;
    godCheckbox.type = "checkbox";
    godCheckbox.checked = false;
    godCheckbox.style.cssText = "width:16px;height:16px;cursor:pointer;accent-color:#a3e635;";
    godCheckbox.addEventListener("change", () => this.applyGodMode(godCheckbox.checked));
    this.godModeCheckbox = godCheckbox;

    godRow.appendChild(godLabel);
    godRow.appendChild(godCheckbox);
    container.appendChild(godRow);
  }

  private _buildPlaceholderTab(container: HTMLElement, message: string): void {
    const msg = document.createElement("div");
    msg.style.cssText =
      "font-size:11px;color:rgba(255,255,255,0.3);text-align:center;padding:20px 0;";
    msg.textContent = message;
    container.appendChild(msg);
  }

  // ── Private — input helpers ───────────────────────────────────────────────

  private _row(label: string, control: HTMLElement): HTMLElement {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;";

    const lbl = document.createElement("span");
    lbl.style.cssText =
      "font-size:11px;color:rgba(255,255,255,0.55);min-width:72px;";
    lbl.textContent = label;

    row.appendChild(lbl);
    row.appendChild(control);
    return row;
  }

  private _buildNumberInput(opts: {
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (v: number) => void;
    ref: (el: HTMLInputElement) => void;
  }): HTMLInputElement {
    const input = document.createElement("input") as HTMLInputElement;
    input.type = "number";
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = String(opts.step);
    input.value = String(opts.value);
    input.style.cssText = this._inputCss("80px");
    input.addEventListener("change", () => {
      const v = parseFloat(input.value);
      if (!isNaN(v)) opts.onChange(v);
    });
    opts.ref(input);
    return input;
  }

  private _buildRangeSlider(opts: {
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (v: number) => void;
    ref: (el: HTMLInputElement) => void;
    showValue?: boolean;
  }): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;align-items:center;gap:6px;";

    const slider = document.createElement("input") as HTMLInputElement;
    slider.type = "range";
    slider.min = String(opts.min);
    slider.max = String(opts.max);
    slider.step = String(opts.step);
    slider.value = String(opts.value);
    slider.style.cssText = "width:140px;accent-color:#a3e635;cursor:pointer;";

    let valueDisplay: HTMLElement | null = null;
    if (opts.showValue) {
      valueDisplay = document.createElement("span");
      valueDisplay.style.cssText =
        "font-size:11px;color:rgba(255,255,255,0.6);min-width:36px;text-align:right;";
      valueDisplay.textContent = `${opts.value.toFixed(1)}×`;
    }

    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      if (!isNaN(v)) {
        opts.onChange(v);
        if (valueDisplay) valueDisplay.textContent = `${v.toFixed(1)}×`;
      }
    });

    opts.ref(slider);
    wrapper.appendChild(slider);
    if (valueDisplay) wrapper.appendChild(valueDisplay);
    return wrapper;
  }

  private _inputCss(width: string): string {
    return (
      `width:${width};padding:3px 6px;` +
      "background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);" +
      "border-radius:4px;font-family:monospace;font-size:11px;" +
      "color:rgba(255,255,255,0.9);outline:none;"
    );
  }

  private _registerKeyboard(): void {
    this._keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "d" && e.ctrlKey) {
        e.preventDefault();
        this.toggle();
      }
    };
    document.addEventListener("keydown", this._keydownHandler);
  }
}
