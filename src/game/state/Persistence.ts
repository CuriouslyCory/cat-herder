import { saveDataSchema, CURRENT_VERSION } from "./SaveData";
import type { SaveData as ExternalSaveData } from "./SaveData";
import { migrateIfNeeded } from "./migrations";
import {
  encode,
  decode,
  NON_POSITION_DIRTY_PATHS,
  POSITION_DIRTY_PATH,
} from "./SaveCodec";
import type { GameState } from "../engine/GameState";
import type { EventBus } from "../engine/EventBus";
import type { GameTrpcAdapter } from "../engine/Game";

// ---------------------------------------------------------------------------
// Format converters — bridge between GameState's internal { player, world }
// shape and the versioned { character, world, session } external schema.
// The shape itself (which fields exist, how they map, key order) is owned by
// SaveCodec.SAVE_FIELDS; these are thin re-exports kept for call-site and
// test-import stability.
// ---------------------------------------------------------------------------

export const toExternalSaveData = encode;
export const fromExternalSaveData = decode;

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
    for (const path of NON_POSITION_DIRTY_PATHS) {
      this._unsubs.push(
        this.gameState.onChange(path, () => {
          this._hasNonPositionDirty = true;
        }),
      );
    }

    this._unsubs.push(
      this.gameState.onChange(POSITION_DIRTY_PATH, () => {
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
      this.eventBus.emit({ type: "save:complete" });
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

  async deleteSave(): Promise<void> {
    await this.trpcAdapter.deleteSave();
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
