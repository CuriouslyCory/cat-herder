import { saveDataSchema, CURRENT_VERSION } from "./SaveData";
import type { SaveData as ExternalSaveData } from "./SaveData";
import { migrateIfNeeded } from "./migrations";
import type { GameState } from "../engine/GameState";
import type { SaveData as InternalSaveData } from "../engine/GameState";
import type { EventBus } from "../engine/EventBus";
import type { GameTrpcAdapter } from "../engine/Game";

// ---------------------------------------------------------------------------
// Format converters — bridge between GameState's internal { player, world }
// shape and the versioned { character, world, session } external schema.
// ---------------------------------------------------------------------------

export function toExternalSaveData(data: InternalSaveData): ExternalSaveData {
  return {
    character: {
      appearance: data.player.appearance,
      stats: data.player.stats,
      inventory: data.player.inventory,
      position: data.player.position,
      yarn: data.player.yarn,
      oxygen: data.player.oxygen,
      abilities: data.player.abilities,
    },
    world: {
      currentMapId: data.world.currentMapId,
      activeCats: data.world.activeCats,
      resourceNodeCooldowns: data.world.resourceNodes,
      hiddenTerrain: data.world.hiddenTerrain,
    },
    session: { totalPlaytimeMs: 0 },
  };
}

export function fromExternalSaveData(data: ExternalSaveData): InternalSaveData {
  return {
    player: {
      appearance: data.character.appearance,
      stats: data.character.stats,
      inventory: data.character.inventory,
      position: data.character.position,
      yarn: data.character.yarn,
      oxygen: data.character.oxygen,
      abilities: data.character.abilities,
    },
    world: {
      currentMapId: data.world.currentMapId,
      activeCats: data.world.activeCats,
      hiddenTerrain: data.world.hiddenTerrain,
      resourceNodes: data.world.resourceNodeCooldowns,
    },
  };
}

// ---------------------------------------------------------------------------
// Paths that contribute to non-position dirty tracking.
// Position changes are throttled separately; all others mark dirty immediately.
// ---------------------------------------------------------------------------

const NON_POSITION_PATHS = [
  "player.yarn",
  "player.stats.health",
  "player.stats.level",
  "player.stats.maxHealth",
  "player.inventory",
  "player.abilities",
  "player.appearance",
  "player.oxygen",
  "world.currentMapId",
  "world.activeCats",
  "world.hiddenTerrain",
  "world.resourceNodes",
] as const;

const POSITION_DIRTY_THROTTLE_MS = 5000;

// ---------------------------------------------------------------------------
// Persistence — save/load/auto-save orchestrator
// ---------------------------------------------------------------------------

export class Persistence {
  private _isSaving = false;
  private _lastSavedAt: number | null = null;
  private _autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private _lastPositionDirtyAt = 0;
  private _lastSaveCompletedAt = 0;
  private _hasNonPositionDirty = false;
  private _positionHasChangedSinceLastSave = false;
  private readonly _unsubs: Array<() => void> = [];
  private _beforeUnloadHandler: (() => void) | null = null;

  constructor(
    private readonly gameState: GameState,
    private readonly trpcAdapter: GameTrpcAdapter,
    private readonly eventBus: EventBus,
  ) {
    for (const path of NON_POSITION_PATHS) {
      this._unsubs.push(
        this.gameState.onChange(path, () => {
          this._hasNonPositionDirty = true;
        }),
      );
    }

    this._unsubs.push(
      this.gameState.onChange("player.position", () => {
        this._lastPositionDirtyAt = Date.now();
        this._positionHasChangedSinceLastSave = true;
      }),
    );
  }

  get isSaving(): boolean {
    return this._isSaving;
  }

  get lastSavedAt(): number | null {
    return this._lastSavedAt;
  }

  async save(): Promise<void> {
    if (this._isSaving) return;
    this._isSaving = true;
    try {
      const internal = this.gameState.serialize();
      const saveData = toExternalSaveData(internal);
      saveDataSchema.parse(saveData);
      await this.trpcAdapter.upsertSave({ version: CURRENT_VERSION, saveData });
      this.gameState.clearDirty();
      this._hasNonPositionDirty = false;
      this._positionHasChangedSinceLastSave = false;
      const now = Date.now();
      this._lastSaveCompletedAt = now;
      this._lastSavedAt = now;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.eventBus.emit({ type: "save:failed", error: message });
    } finally {
      this._isSaving = false;
    }
  }

  async load(): Promise<ExternalSaveData | null> {
    const raw = await this.trpcAdapter.getSave();
    if (!raw) return null;
    return migrateIfNeeded(raw);
  }

  startAutoSave(intervalMs: number): void {
    if (this._autoSaveTimer !== null) return;
    this._autoSaveTimer = setInterval(() => {
      if (!this.gameState.isDirty) return;

      const now = Date.now();
      const positionDirtyIsStale =
        this._positionHasChangedSinceLastSave &&
        now - this._lastPositionDirtyAt >= POSITION_DIRTY_THROTTLE_MS;

      if (this._hasNonPositionDirty || positionDirtyIsStale) {
        void this.save();
      }
    }, intervalMs);
  }

  stopAutoSave(): void {
    if (this._autoSaveTimer !== null) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }

  async forceSave(): Promise<void> {
    return this.save();
  }

  restoreFromSave(data: ExternalSaveData): void {
    this.gameState.restore(fromExternalSaveData(data));
  }

  setupBeforeUnload(): void {
    const handler = () => {
      const internal = this.gameState.serialize();
      const saveData = toExternalSaveData(internal);
      const payload = JSON.stringify({ version: CURRENT_VERSION, saveData });
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        navigator.sendBeacon("/api/game/beacon-save", payload);
      }
    };
    window.addEventListener("beforeunload", handler);
    this._beforeUnloadHandler = handler;
  }

  dispose(): void {
    this.stopAutoSave();
    if (this._beforeUnloadHandler !== null) {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
    for (const unsub of this._unsubs) unsub();
    this._unsubs.length = 0;
  }
}
