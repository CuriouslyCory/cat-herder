// ---------------------------------------------------------------------------
// GameState — mutable player state shared across systems and the HUD.
//
// Tracks yarn and inventory; provides reactive onChange() subscriptions so
// the HUD can update without polling.
// ---------------------------------------------------------------------------

import type { ResourceType } from "../types";

type Listener<T> = (value: T) => void;

export interface InventoryStack {
  resourceType: ResourceType;
  quantity: number;
}

export class GameState {
  private _yarn: number;
  private readonly yarnListeners = new Set<Listener<number>>();
  private readonly inventoryListeners = new Set<Listener<readonly InventoryStack[]>>();

  /** Resource stacks — same-type resources share one stack. */
  readonly inventory: InventoryStack[] = [];
  /** Maximum total items across all stacks (enforced by US-112). */
  maxInventoryCapacity = 10;

  constructor(initialYarn = 10) {
    this._yarn = initialYarn;
  }

  // ── Yarn ────────────────────────────────────────────────────────────────────

  get yarn(): number {
    return this._yarn;
  }

  /** Add yarn and notify subscribers. */
  addYarn(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this._yarn += amount;
    this.notifyYarn();
  }

  /**
   * Deduct yarn if the balance is sufficient.
   * Returns true on success, false if there is not enough yarn.
   */
  deductYarn(amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    if (this._yarn < amount) return false;
    this._yarn -= amount;
    this.notifyYarn();
    return true;
  }

  /**
   * Subscribe to yarn changes.
   * The listener is called immediately with the current value, then on every change.
   * Returns an unsubscribe function.
   */
  onYarnChange(listener: Listener<number>): () => void {
    this.yarnListeners.add(listener);
    listener(this._yarn); // emit current value immediately
    return () => this.yarnListeners.delete(listener);
  }

  // ── Inventory ────────────────────────────────────────────────────────────────

  /** Total items held across all stacks. */
  get inventoryTotal(): number {
    return this.inventory.reduce((sum, s) => sum + s.quantity, 0);
  }

  /** True if adding `amount` items would not exceed maxInventoryCapacity. */
  hasInventorySpace(amount = 1): boolean {
    return this.inventoryTotal + amount <= this.maxInventoryCapacity;
  }

  /**
   * Add `amount` units of the given resource type to inventory.
   * Stacks with the same type accumulate. Does NOT enforce capacity — callers
   * should check hasInventorySpace() before calling.
   */
  addResource(resourceType: ResourceType, amount = 1): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const stack = this.inventory.find((s) => s.resourceType === resourceType);
    if (stack) {
      stack.quantity += amount;
    } else {
      this.inventory.push({ resourceType, quantity: amount });
    }
    this.notifyInventory();
  }

  /**
   * Subscribe to inventory changes.
   * The listener is called immediately with the current inventory, then on every change.
   * Returns an unsubscribe function.
   */
  onInventoryChange(listener: Listener<readonly InventoryStack[]>): () => void {
    this.inventoryListeners.add(listener);
    listener(this.inventory);
    return () => this.inventoryListeners.delete(listener);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private notifyYarn(): void {
    for (const listener of this.yarnListeners) {
      listener(this._yarn);
    }
  }

  private notifyInventory(): void {
    for (const listener of this.inventoryListeners) {
      listener(this.inventory);
    }
  }
}
