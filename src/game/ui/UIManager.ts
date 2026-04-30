import { HUD } from "./HUD";
import type { CatType } from "../types";
import type { CatCatalogEntry } from "../cats/CatCompanionManager";
import type { GatherState } from "../systems/GatheringSystem";
import type { InventoryStack } from "../engine/GameState";

/**
 * HUD frame state passed from the game loop each render tick.
 * All fields are optional — UIManager uses sensible defaults when absent.
 */
export interface HUDState {
  /** Current oxygen [0-100] while submerged; null hides the gauge. */
  oxygenPercent: number | null;
  /** Player current health (integer hp). */
  health: number;
  /** Player max health (integer hp). */
  maxHealth: number;
  /** Current yarn count for the yarn display in the cat selection bar. */
  yarn?: number;
  /** Currently selected cat type for placement highlighting, or null. */
  selectedCatType?: CatType | null;
  /** Active gather progress and label, or null when not gathering. */
  gatherState?: GatherState | null;
  /** Current inventory stacks for the inventory panel. */
  inventory?: InventoryStack[];
  /** Maximum inventory capacity. */
  maxInventoryCapacity?: number;
  /** True while the "Inventory Full" notification should be shown. */
  inventoryFull?: boolean;
  /** True when a cat type is selected but the player cannot afford the yarn cost. */
  insufficientYarn?: boolean;
}

/**
 * UIManager — mounts and manages plain DOM panels over the game canvas.
 *
 * Creates a single overlay div that covers the canvas (requires the canvas's
 * parent to be a positioning context), then delegates per-panel updates to
 * each mounted module (HUD, etc.). No React inside the engine.
 */
export class UIManager {
  private readonly overlay: HTMLDivElement;
  private readonly hud: HUD;

  constructor(canvas: HTMLCanvasElement) {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden;";

    // The canvas parent must be a positioning context so `inset:0` covers it.
    const parent = canvas.parentElement ?? document.body;
    if (getComputedStyle(parent).position === "static") {
      (parent as HTMLElement).style.position = "relative";
    }
    parent.appendChild(overlay);

    this.overlay = overlay;
    this.hud = new HUD(overlay);
  }

  /** Called once per render frame by the game loop. */
  update(dt: number, state?: Partial<HUDState>): void {
    this.hud.update(
      dt,
      state?.oxygenPercent ?? null,
      state?.health ?? 5,
      state?.maxHealth ?? 5,
      state?.yarn ?? 0,
      state?.selectedCatType ?? null,
      state?.gatherState ?? null,
      state?.inventory ?? [],
      state?.maxInventoryCapacity ?? 10,
      state?.inventoryFull ?? false,
      state?.insufficientYarn ?? false,
    );
  }

  /** Pass the cat catalog to the HUD so it can render the selection bar. */
  setCatCatalog(catalog: CatCatalogEntry[]): void {
    this.hud.setCatalog(catalog);
  }

  /** Remove all mounted DOM panels and listeners. */
  dispose(): void {
    this.hud.dispose();
    this.overlay.remove();
  }
}
