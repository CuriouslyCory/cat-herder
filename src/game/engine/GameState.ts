// ---------------------------------------------------------------------------
// GameState — central game state store with path-based reactive API.
//
// Tracks all persistable game data. Existing convenience methods (addYarn,
// deductYarn, onYarnChange, addResource, hasInventorySpace, onInventoryChange)
// are preserved as wrappers over the path-based store so callers don't break.
// ---------------------------------------------------------------------------

import type { ResourceType, CatType, Vec3 } from "../types";

type Unsubscribe = () => void;
type PathCallback<T> = (newVal: T, oldVal: T) => void;

export interface InventoryStack {
  resourceType: ResourceType;
  quantity: number;
}

interface PlayerStats {
  level: number;
  health: number;
  maxHealth: number;
}

interface PlayerState {
  appearance: Record<string, unknown>;
  position: Vec3;
  stats: PlayerStats;
  yarn: number;
  oxygen: number;
  abilities: string[];
  inventory: InventoryStack[];
}

interface WorldState {
  currentMapId: string;
  activeCats: Array<{ catType: CatType; position: Vec3 }>;
  hiddenTerrain: number[];
  resourceNodes: Array<{ nodeId: string; cooldownRemaining: number }>;
}

interface SessionState {
  totalPlaytimeMs: number;
  isSwimming: boolean;
  isDiving: boolean;
}

interface InternalState {
  player: PlayerState;
  world: WorldState;
  session: SessionState;
}

// SaveData excludes transient session fields.
export interface SaveData {
  player: PlayerState;
  world: WorldState;
}

function defaultState(initialYarn: number): InternalState {
  return {
    player: {
      appearance: {},
      position: { x: 0, y: 0, z: 0 },
      stats: { level: 1, health: 10, maxHealth: 10 },
      yarn: initialYarn,
      oxygen: 100,
      abilities: [],
      inventory: [],
    },
    world: {
      currentMapId: "default",
      activeCats: [],
      hiddenTerrain: [],
      resourceNodes: [],
    },
    session: {
      totalPlaytimeMs: 0,
      isSwimming: false,
      isDiving: false,
    },
  };
}

export class GameState {
  private _state: InternalState;
  private _isDirty = false;
  private readonly _pathListeners = new Map<
    string,
    Set<PathCallback<unknown>>
  >();

  /** Maximum total items across all stacks (enforced by US-112). */
  maxInventoryCapacity = 10;

  constructor(initialYarn = 10) {
    this._state = defaultState(initialYarn);
  }

  // ── Path-based API ────────────────────────────────────────────────────────────

  get<T>(path: string): T {
    return this._getAtPath(path) as T;
  }

  set<T>(path: string, value: T): void {
    if (!this._validate(path, value)) return;
    const oldVal = this._getAtPath(path);
    this._setAtPath(path, value);
    this._isDirty = true;
    this._notifyPath(path, value, oldVal);
  }

  onChange<T>(path: string, callback: PathCallback<T>): Unsubscribe {
    if (!this._pathListeners.has(path)) {
      this._pathListeners.set(path, new Set());
    }
    const cb = callback as PathCallback<unknown>;
    this._pathListeners.get(path)!.add(cb);
    return () => this._pathListeners.get(path)?.delete(cb);
  }

  get isDirty(): boolean {
    return this._isDirty;
  }

  clearDirty(): void {
    this._isDirty = false;
  }

  // ── Serialization ─────────────────────────────────────────────────────────────

  serialize(): SaveData {
    return {
      player: structuredClone(this._state.player),
      world: structuredClone(this._state.world),
    };
  }

  restore(data: SaveData): void {
    // Snapshot old values for all registered paths before restoring.
    const oldValues = new Map<string, unknown>();
    for (const path of this._pathListeners.keys()) {
      oldValues.set(path, this._getAtPath(path));
    }

    this._state.player = structuredClone(data.player);
    this._state.world = structuredClone(data.world);

    // Notify all registered listeners with correct old/new values.
    for (const [path, listeners] of this._pathListeners) {
      const newVal = this._getAtPath(path);
      const oldVal = oldValues.get(path);
      for (const listener of listeners) {
        listener(newVal, oldVal);
      }
    }

    this._isDirty = false;
  }

  // ── Yarn (backward-compat wrappers) ──────────────────────────────────────────

  get yarn(): number {
    return this._state.player.yarn;
  }

  addYarn(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.set("player.yarn", this._state.player.yarn + amount);
  }

  deductYarn(amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const current = this._state.player.yarn;
    if (current < amount) return false;
    this.set("player.yarn", current - amount);
    return true;
  }

  onYarnChange(listener: (value: number) => void): Unsubscribe {
    listener(this._state.player.yarn); // immediate call (existing contract)
    return this.onChange<number>("player.yarn", (newVal) => listener(newVal));
  }

  // ── Inventory (backward-compat wrappers) ─────────────────────────────────────

  get inventory(): InventoryStack[] {
    return this._state.player.inventory;
  }

  get inventoryTotal(): number {
    return this._state.player.inventory.reduce((sum, s) => sum + s.quantity, 0);
  }

  hasInventorySpace(amount = 1): boolean {
    return this.inventoryTotal + amount <= this.maxInventoryCapacity;
  }

  addResource(resourceType: ResourceType, amount = 1): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    // Clone stacks so set() receives a new array reference.
    const inventory = this._state.player.inventory.map((s) => ({ ...s }));
    const stack = inventory.find((s) => s.resourceType === resourceType);
    if (stack) {
      stack.quantity += amount;
    } else {
      inventory.push({ resourceType, quantity: amount });
    }
    this.set("player.inventory", inventory);
  }

  onInventoryChange(
    listener: (inventory: readonly InventoryStack[]) => void,
  ): Unsubscribe {
    listener(this._state.player.inventory); // immediate call (existing contract)
    return this.onChange<InventoryStack[]>("player.inventory", (newVal) =>
      listener(newVal),
    );
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private _getAtPath(path: string): unknown {
    const parts = path.split(".");
    let obj: unknown = this._state;
    for (const part of parts) {
      if (obj === null || typeof obj !== "object") return undefined;
      obj = (obj as Record<string, unknown>)[part];
    }
    return obj;
  }

  private _setAtPath(path: string, value: unknown): void {
    const parts = path.split(".");
    let obj = this._state as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]!] as Record<string, unknown>;
    }
    obj[parts[parts.length - 1]!] = value;
  }

  private _notifyPath(path: string, newVal: unknown, oldVal: unknown): void {
    const listeners = this._pathListeners.get(path);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(newVal, oldVal);
    }
  }

  private _validate(path: string, value: unknown): boolean {
    switch (path) {
      case "player.yarn":
        return typeof value === "number" && value >= 0;
      case "player.stats.health":
        return (
          typeof value === "number" &&
          value >= 0 &&
          value <= this._state.player.stats.maxHealth
        );
      case "player.stats.level":
        return (
          typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 0 &&
          value <= 10
        );
      case "player.stats.maxHealth":
        return typeof value === "number" && value > 0;
      default:
        return true;
    }
  }
}
