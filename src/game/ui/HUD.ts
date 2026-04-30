import { CatType } from "../types";
import type { CatCatalogEntry } from "../cats/CatCompanionManager";
import type { InventoryStack } from "../engine/GameState";

/**
 * HUD — plain DOM health, oxygen, cat selection, and FPS overlay.
 *
 * Renders into a container supplied by UIManager. No React — keeps
 * the game loop framework-agnostic.
 *
 * Hearts panel:      bottom-left, always visible.
 * Oxygen gauge:      top-center, visible only while submerged.
 * Cat selection bar: bottom-center, always visible once catalog is set.
 * FPS counter:       top-right, only in development builds.
 */
export class HUD {
  private heartsEl: HTMLElement | null = null;
  private oxygenPanel: HTMLElement | null = null;
  private oxygenBar: HTMLElement | null = null;
  private oxygenLabel: HTMLElement | null = null;
  private fpsEl: HTMLElement | null = null;

  // Cat selection bar
  private catBarPanel: HTMLElement | null = null;
  private catSlotEls: HTMLElement[] = [];
  private yarnCountEl: HTMLElement | null = null;
  private catalog: CatCatalogEntry[] = [];

  // Gather progress bar
  private gatherPanel: HTMLElement | null = null;
  private gatherBar: HTMLElement | null = null;
  private gatherLabel: HTMLElement | null = null;

  // Inventory panel
  private inventoryPanel: HTMLElement | null = null;
  private inventoryStacksEl: HTMLElement | null = null;
  private inventoryCapacityEl: HTMLElement | null = null;
  private inventoryCapacityBar: HTMLElement | null = null;
  private inventoryFullEl: HTMLElement | null = null;

  /** Rolling window for FPS calculation (~1 second at 60 fps). */
  private readonly frameTimes: number[] = [];
  private static readonly FPS_WINDOW = 60;

  /** Tracks the current health value to avoid unnecessary DOM updates. */
  private currentHealth = 5;
  private currentMaxHealth = 5;

  /** Tracks whether the warning pulse CSS animation is active. */
  private warningActive = false;

  /** Resource type display config: icon and color. */
  private static readonly RESOURCE_ICONS: Readonly<Record<string, string>> = {
    Grass: "🌿",
    Sticks: "🪵",
    Water: "💧",
  };

  /** Colors matched to the cat definitions (warm → cool spectrum). */
  private static readonly CAT_COLORS: Readonly<Record<CatType, string>> = {
    [CatType.Loaf]: "#e07a30",
    [CatType.Zoomies]: "#30c870",
    [CatType.CuriosityCat]: "#9a55e0",
    [CatType.Pounce]: "#e03090",
  };

  constructor(container: HTMLElement) {
    this.buildHearts(container);
    this.buildOxygenGauge(container);
    this.buildGatherBar(container);
    this.buildCatBar(container);
    this.buildInventoryPanel(container);
    if (process.env.NODE_ENV === "development") {
      this.buildFps(container);
    }
  }

  /**
   * Called once per render frame by UIManager.
   * @param oxygenPercent        Current oxygen 0-100, or null when not submerged.
   * @param health               Current player health (integer hp).
   * @param maxHealth            Maximum player health.
   * @param yarn                 Current yarn count.
   * @param selectedCatType      Currently selected cat type for placement, or null.
   * @param gatherProgress       Gather progress [0-1] + label, or null when idle.
   * @param inventory            Current inventory stacks.
   * @param maxInventoryCapacity Maximum total items allowed.
   * @param inventoryFull        True while "Inventory Full" notification is active.
   */
  update(
    dt: number,
    oxygenPercent: number | null = null,
    health = 5,
    maxHealth = 5,
    yarn = 0,
    selectedCatType: CatType | null = null,
    gatherProgress: { progress: number; label: string } | null = null,
    inventory: InventoryStack[] = [],
    maxInventoryCapacity = 10,
    inventoryFull = false,
  ): void {
    this.updateFps(dt);
    this.setOxygen(oxygenPercent);
    this.setHealth(health, maxHealth);
    this.setCatBar(yarn, selectedCatType);
    this.setGatherProgress(gatherProgress);
    this.setInventory(inventory, maxInventoryCapacity, inventoryFull);
  }

  /** Set the cat catalog used by the selection bar. Call once after the catalog is available. */
  setCatalog(catalog: CatCatalogEntry[]): void {
    this.catalog = catalog;
    this.renderCatSlots();
  }

  dispose(): void {
    this.heartsEl = null;
    this.oxygenPanel = null;
    this.oxygenBar = null;
    this.oxygenLabel = null;
    this.gatherPanel = null;
    this.gatherBar = null;
    this.gatherLabel = null;
    this.catBarPanel = null;
    this.catSlotEls = [];
    this.yarnCountEl = null;
    this.inventoryPanel = null;
    this.inventoryStacksEl = null;
    this.inventoryCapacityEl = null;
    this.inventoryCapacityBar = null;
    this.inventoryFullEl = null;
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

  // ---------------------------------------------------------------------------
  // Cat selection bar
  // ---------------------------------------------------------------------------

  private buildCatBar(container: HTMLElement): void {
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:absolute;bottom:56px;left:50%;transform:translateX(-50%);" +
      "display:flex;align-items:center;gap:8px;" +
      "pointer-events:none;user-select:none;";

    // Yarn count — shown to the right of the slots
    const yarnEl = document.createElement("div");
    yarnEl.style.cssText =
      "font-family:monospace;font-size:13px;color:rgba(255,255,255,0.9);" +
      "background:rgba(0,0,0,0.5);border-radius:4px;padding:4px 8px;" +
      "text-shadow:0 1px 2px rgba(0,0,0,0.8);white-space:nowrap;";
    yarnEl.textContent = "🧶 0";

    container.appendChild(panel);

    this.catBarPanel = panel;
    this.yarnCountEl = yarnEl;
    // Slots are built lazily in renderCatSlots() once catalog is available.
  }

  private renderCatSlots(): void {
    if (!this.catBarPanel || !this.yarnCountEl) return;

    this.catBarPanel.innerHTML = "";
    this.catSlotEls = [];

    for (let i = 0; i < this.catalog.length; i++) {
      const entry = this.catalog[i]!;
      const color = HUD.CAT_COLORS[entry.type] ?? "#888888";

      const slot = document.createElement("div");
      slot.style.cssText =
        `border:2px solid ${color};border-radius:6px;` +
        "background:rgba(0,0,0,0.5);padding:4px 8px;" +
        "display:flex;flex-direction:column;align-items:center;gap:2px;" +
        "min-width:60px;";

      const keyLabel = document.createElement("div");
      keyLabel.textContent = `[${i + 1}]`;
      keyLabel.style.cssText =
        "font-family:monospace;font-size:10px;color:rgba(255,255,255,0.5);";

      const nameLabel = document.createElement("div");
      nameLabel.textContent = entry.name.replace(" Cat", "");
      nameLabel.style.cssText =
        `font-family:monospace;font-size:11px;color:${color};font-weight:bold;`;

      const costLabel = document.createElement("div");
      costLabel.textContent = `🧶${entry.yarnCost}`;
      costLabel.style.cssText =
        "font-family:monospace;font-size:11px;color:rgba(255,255,255,0.8);";

      slot.appendChild(keyLabel);
      slot.appendChild(nameLabel);
      slot.appendChild(costLabel);
      this.catBarPanel.appendChild(slot);
      this.catSlotEls.push(slot);
    }

    this.catBarPanel.appendChild(this.yarnCountEl);
  }

  // ---------------------------------------------------------------------------
  // Gather progress bar
  // ---------------------------------------------------------------------------

  private buildGatherBar(container: HTMLElement): void {
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:absolute;bottom:110px;left:50%;transform:translateX(-50%);" +
      "display:none;flex-direction:column;align-items:center;gap:4px;" +
      "pointer-events:none;user-select:none;";

    const label = document.createElement("div");
    label.style.cssText =
      "font-family:monospace;font-size:11px;color:rgba(255,255,255,0.9);" +
      "text-shadow:0 1px 2px rgba(0,0,0,0.8);letter-spacing:1px;";

    const track = document.createElement("div");
    track.style.cssText =
      "width:140px;height:10px;background:rgba(0,0,0,0.45);border-radius:5px;overflow:hidden;";

    const fill = document.createElement("div");
    fill.style.cssText =
      "height:100%;width:0%;background:#a3e635;border-radius:5px;transition:width 0.05s linear;";

    track.appendChild(fill);
    panel.appendChild(label);
    panel.appendChild(track);
    container.appendChild(panel);

    this.gatherPanel = panel;
    this.gatherBar = fill;
    this.gatherLabel = label;
  }

  private setGatherProgress(
    state: { progress: number; label: string } | null,
  ): void {
    if (!this.gatherPanel || !this.gatherBar || !this.gatherLabel) return;

    if (state === null) {
      this.gatherPanel.style.display = "none";
      return;
    }

    this.gatherPanel.style.display = "flex";
    this.gatherLabel.textContent = state.label;
    this.gatherBar.style.width = `${Math.max(0, Math.min(100, state.progress * 100))}%`;
  }

  // ---------------------------------------------------------------------------
  // Inventory panel
  // ---------------------------------------------------------------------------

  private buildInventoryPanel(container: HTMLElement): void {
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:absolute;top:16px;left:16px;" +
      "display:flex;flex-direction:column;gap:4px;" +
      "pointer-events:none;user-select:none;" +
      "min-width:110px;";

    // Header: "INV" label + capacity bar
    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;flex-direction:column;gap:3px;" +
      "background:rgba(0,0,0,0.5);border-radius:5px;padding:4px 7px;";

    const capacityLabel = document.createElement("div");
    capacityLabel.style.cssText =
      "font-family:monospace;font-size:10px;color:rgba(255,255,255,0.7);" +
      "letter-spacing:1px;";
    capacityLabel.textContent = "INV 0/10";

    const capacityTrack = document.createElement("div");
    capacityTrack.style.cssText =
      "width:96px;height:5px;background:rgba(255,255,255,0.15);border-radius:3px;overflow:hidden;";

    const capacityFill = document.createElement("div");
    capacityFill.style.cssText =
      "height:100%;width:0%;background:#a3e635;border-radius:3px;transition:width 0.15s linear;";

    capacityTrack.appendChild(capacityFill);
    header.appendChild(capacityLabel);
    header.appendChild(capacityTrack);
    panel.appendChild(header);

    // Stacks list
    const stacksList = document.createElement("div");
    stacksList.style.cssText =
      "display:flex;flex-direction:column;gap:2px;";
    panel.appendChild(stacksList);

    // Inventory Full notification
    const fullEl = document.createElement("div");
    fullEl.style.cssText =
      "display:none;font-family:monospace;font-size:11px;" +
      "color:#fc8181;background:rgba(0,0,0,0.65);border-radius:4px;" +
      "padding:3px 7px;text-shadow:0 1px 2px rgba(0,0,0,0.8);white-space:nowrap;";
    fullEl.textContent = "Inventory Full!";
    panel.appendChild(fullEl);

    container.appendChild(panel);

    this.inventoryPanel = panel;
    this.inventoryStacksEl = stacksList;
    this.inventoryCapacityEl = capacityLabel;
    this.inventoryCapacityBar = capacityFill;
    this.inventoryFullEl = fullEl;
  }

  private setInventory(
    inventory: InventoryStack[],
    maxCapacity: number,
    inventoryFull: boolean,
  ): void {
    if (
      !this.inventoryPanel ||
      !this.inventoryStacksEl ||
      !this.inventoryCapacityEl ||
      !this.inventoryCapacityBar ||
      !this.inventoryFullEl
    ) return;

    const total = inventory.reduce((sum, s) => sum + s.quantity, 0);
    const pct = maxCapacity > 0 ? (total / maxCapacity) * 100 : 0;

    this.inventoryCapacityEl.textContent = `INV ${total}/${maxCapacity}`;
    this.inventoryCapacityBar.style.width = `${Math.min(100, pct)}%`;

    // Color the capacity bar: green → yellow → red as it fills
    const barColor =
      pct >= 100 ? "#fc8181" : pct >= 70 ? "#f6e05e" : "#a3e635";
    this.inventoryCapacityBar.style.background = barColor;

    // Rebuild stack rows (only when content changes would be expensive; DOM diff
    // kept simple — inventory rarely has >3 entries in MVP)
    this.inventoryStacksEl.innerHTML = "";
    for (const stack of inventory) {
      const icon =
        HUD.RESOURCE_ICONS[stack.resourceType] ?? "?";

      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:5px;" +
        "background:rgba(0,0,0,0.5);border-radius:4px;padding:2px 7px;";

      const iconEl = document.createElement("span");
      iconEl.textContent = icon;
      iconEl.style.fontSize = "13px";

      const nameEl = document.createElement("span");
      nameEl.style.cssText =
        "font-family:monospace;font-size:11px;color:rgba(255,255,255,0.85);flex:1;";
      nameEl.textContent = stack.resourceType;

      const qtyEl = document.createElement("span");
      qtyEl.style.cssText =
        "font-family:monospace;font-size:11px;color:#a3e635;font-weight:bold;";
      qtyEl.textContent = `×${stack.quantity}`;

      row.appendChild(iconEl);
      row.appendChild(nameEl);
      row.appendChild(qtyEl);
      this.inventoryStacksEl.appendChild(row);
    }

    // "Inventory Full" notification
    this.inventoryFullEl.style.display = inventoryFull ? "block" : "none";
  }

  private setCatBar(yarn: number, selectedCatType: CatType | null): void {
    if (this.yarnCountEl) {
      this.yarnCountEl.textContent = `🧶 ${yarn}`;
    }

    for (let i = 0; i < this.catSlotEls.length; i++) {
      const slot = this.catSlotEls[i];
      const entry = this.catalog[i];
      if (!slot || !entry) continue;

      const isSelected = entry.type === selectedCatType;
      const color = HUD.CAT_COLORS[entry.type] ?? "#888888";

      slot.style.borderColor = isSelected ? "#ffffff" : color;
      slot.style.background = isSelected
        ? `${color}55`
        : "rgba(0,0,0,0.5)";
      slot.style.boxShadow = isSelected
        ? `0 0 8px ${color}88`
        : "none";
    }
  }
}
