import type { GameState } from "../engine/GameState";
import type { EventBus } from "../engine/EventBus";
import type { GameConfig } from "../config";
import { CONFIG } from "../config";
import type { World } from "../ecs/World";
import type { CatCompanionManager } from "../cats/CatCompanionManager";
import type { CatBehavior } from "../ecs/components/CatBehavior";
import { CatType } from "../types";
import type { Vec3 } from "../types";

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

  // Cats tab element refs
  private catLimitInput: HTMLInputElement | null = null;
  private _catStatusContainer: HTMLElement | null = null;

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
    // Optional: CatCompanionManager for the Cats tab.
    private readonly catCompanionManager?: CatCompanionManager,
    // Optional: returns the player's current world position for force-summon placement.
    private readonly getPlayerPosition?: () => Vec3 | null,
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

  /**
   * Refresh the Cats tab status display. Call once per render frame from Game.ts.
   * No-ops when the menu is closed or catCompanionManager is not wired.
   */
  update(): void {
    if (!this._visible || !this._catStatusContainer || !this.catCompanionManager) return;
    const active = this.catCompanionManager.getActiveCompanions();
    this._catStatusContainer.innerHTML = "";
    if (active.length === 0) {
      const msg = document.createElement("div");
      msg.style.cssText = "font-size:10px;color:rgba(255,255,255,0.3);";
      msg.textContent = "No active cats";
      this._catStatusContainer.appendChild(msg);
      return;
    }
    for (const entity of active) {
      const behavior = this.world.getComponent<CatBehavior>(entity, "CatBehavior");
      const row = document.createElement("div");
      row.style.cssText =
        "font-size:10px;color:rgba(255,255,255,0.7);display:flex;justify-content:space-between;";
      row.textContent = behavior ? `${behavior.catType} — ${behavior.state}` : `#${entity}`;
      this._catStatusContainer.appendChild(row);
    }
  }

  // ── Apply methods — Player tab ────────────────────────────────────────────

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

  // ── Apply methods — Cats tab ──────────────────────────────────────────────

  /**
   * Force-summon a cat at player position + 2 units in X, bypassing yarn cost
   * and cat limit checks. Yarn and limit are restored to their original values
   * after the summon call.
   */
  applyForceSummon(catType: CatType): void {
    if (!this.catCompanionManager) return;
    const playerPos = this.getPlayerPosition?.() ?? { x: 0, y: 0, z: 0 };
    const position: Vec3 = { x: playerPos.x + 2, y: playerPos.y, z: playerPos.z };

    const savedYarn = this.gameState.get<number>("player.yarn");
    const savedLimit = this.runtimeCfg.maxActiveCats;

    // Temporarily boost so summon()'s yarn + limit guards always pass.
    this.gameState.set("player.yarn", savedYarn + 9999);
    this.runtimeCfg.maxActiveCats = 999;

    this.catCompanionManager.summon(catType, position);

    // Restore original values regardless of summon() outcome.
    this.runtimeCfg.maxActiveCats = savedLimit;
    this.gameState.set("player.yarn", savedYarn);

    this.eventBus.emit({ type: "debug:value-changed", key: "debug.forceSummon", value: catType });
  }

  /**
   * Override yarn to any non-negative value (Cats tab allows values above the
   * normal 99 cap to test high-yarn states).
   */
  applyYarnOverride(value: number): void {
    const n = Math.max(0, Math.round(value));
    this.gameState.set<number>("player.yarn", n);
    this.eventBus.emit({ type: "debug:value-changed", key: "player.yarn", value: n });
  }

  applyCatLimitOverride(value: number): void {
    const n = Math.max(1, Math.min(10, Math.round(value)));
    this.runtimeCfg.maxActiveCats = n;
    this.eventBus.emit({
      type: "debug:value-changed",
      key: "runtimeConfig.maxActiveCats",
      value: n,
    });
  }

  applyDismissAll(): void {
    if (!this.catCompanionManager) return;
    for (const entity of this.catCompanionManager.getActiveCompanions()) {
      this.catCompanionManager.dismiss(entity);
    }
    this.eventBus.emit({ type: "debug:value-changed", key: "debug.dismissAll", value: true });
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
    this.catLimitInput = null;
    this._catStatusContainer = null;
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
    this._buildCatsTab(tabPanels.get("cats")!);
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

  private _buildCatsTab(container: HTMLElement): void {
    if (!this.catCompanionManager) {
      this._buildPlaceholderTab(container, "Cats tab — catCompanionManager not wired");
      return;
    }

    // Force-summon section header
    const summonHeader = document.createElement("div");
    summonHeader.style.cssText =
      "font-size:10px;letter-spacing:1px;color:rgba(255,255,255,0.35);margin-bottom:2px;";
    summonHeader.textContent = "FORCE SUMMON";
    container.appendChild(summonHeader);

    for (const entry of this.catCompanionManager.getCatalog()) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;";

      const label = document.createElement("span");
      label.style.cssText = "font-size:11px;color:rgba(255,255,255,0.7);flex:1;";
      label.textContent = `${entry.name} (${entry.yarnCost} yarn)`;

      const btn = document.createElement("button");
      btn.textContent = "Summon";
      btn.style.cssText =
        "padding:2px 8px;background:rgba(163,230,53,0.15);border:1px solid rgba(163,230,53,0.3);" +
        "border-radius:4px;font-family:monospace;font-size:10px;color:rgba(163,230,53,0.9);cursor:pointer;";
      btn.addEventListener("click", () => this.applyForceSummon(entry.type));

      row.appendChild(label);
      row.appendChild(btn);
      container.appendChild(row);
    }

    // Divider
    container.appendChild(this._divider());

    // Yarn override (no upper cap — allows high-yarn testing)
    container.appendChild(
      this._row(
        "Yarn",
        this._buildNumberInput({
          min: 0, max: 9999, step: 1,
          value: this.gameState.get<number>("player.yarn"),
          onChange: (v) => this.applyYarnOverride(v),
          ref: () => {},
        }),
      ),
    );

    // Cat limit override
    container.appendChild(
      this._row(
        "Cat limit",
        this._buildNumberInput({
          min: 1, max: 10, step: 1,
          value: this.runtimeCfg.maxActiveCats,
          onChange: (v) => this.applyCatLimitOverride(v),
          ref: (el) => { this.catLimitInput = el; },
        }),
      ),
    );

    // Dismiss all
    const dismissRow = document.createElement("div");
    dismissRow.style.cssText = "display:flex;justify-content:flex-end;";
    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "Dismiss All";
    dismissBtn.style.cssText =
      "padding:3px 10px;background:rgba(255,100,100,0.12);border:1px solid rgba(255,100,100,0.3);" +
      "border-radius:4px;font-family:monospace;font-size:11px;color:rgba(255,150,150,0.9);cursor:pointer;";
    dismissBtn.addEventListener("click", () => this.applyDismissAll());
    dismissRow.appendChild(dismissBtn);
    container.appendChild(dismissRow);

    // Active cats status display
    container.appendChild(this._divider());
    const statusHeader = document.createElement("div");
    statusHeader.style.cssText =
      "font-size:10px;letter-spacing:1px;color:rgba(255,255,255,0.35);margin-bottom:2px;";
    statusHeader.textContent = "ACTIVE CATS";
    container.appendChild(statusHeader);

    const statusContainer = document.createElement("div");
    statusContainer.style.cssText = "display:flex;flex-direction:column;gap:3px;min-height:18px;";
    this._catStatusContainer = statusContainer;
    container.appendChild(statusContainer);
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

  private _divider(): HTMLElement {
    const div = document.createElement("div");
    div.style.cssText = "border-top:1px solid rgba(255,255,255,0.08);margin:2px 0;";
    return div;
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
