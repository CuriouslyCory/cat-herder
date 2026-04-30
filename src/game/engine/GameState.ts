// ---------------------------------------------------------------------------
// GameState — mutable player state shared across systems and the HUD.
//
// Intentionally thin for Phase 2: tracks yarn and provides reactive
// onChange() subscriptions so the HUD can update without polling.
//
// Future stories (US-112, US-113) will extend this with inventory and
// additional player state fields.
// ---------------------------------------------------------------------------

type Listener<T> = (value: T) => void;

export class GameState {
  private _yarn: number;
  private readonly yarnListeners = new Set<Listener<number>>();

  constructor(initialYarn = 10) {
    this._yarn = initialYarn;
  }

  // ── Yarn ────────────────────────────────────────────────────────────────────

  get yarn(): number {
    return this._yarn;
  }

  /** Add yarn and notify subscribers. */
  addYarn(amount: number): void {
    this._yarn += amount;
    this.notifyYarn();
  }

  /**
   * Deduct yarn if the balance is sufficient.
   * Returns true on success, false if there is not enough yarn.
   */
  deductYarn(amount: number): boolean {
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

  // ── Private ─────────────────────────────────────────────────────────────────

  private notifyYarn(): void {
    for (const listener of this.yarnListeners) {
      listener(this._yarn);
    }
  }
}
