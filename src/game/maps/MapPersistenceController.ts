import type { MapData } from "./MapData";
import { mapDataSchema } from "./MapDataSchema";

// ---------------------------------------------------------------------------
// MapPersistenceController — owns the tRPC-backed save/load/list/set-default/
// delete cluster extracted from MapEditor (#27). DOM-free and Three.js-free:
// depends only on an injected adapter plus the pure `mapDataSchema`, so every
// persistence flow is unit-testable with a fake adapter — no jsdom required.
//
// This is a behavior-preserving extraction; see plans/27.md. It does NOT own
// terrain/entity mutation (`getMapData`/`loadMapData` stay on MapEditor for
// #29 to carve out next).
// ---------------------------------------------------------------------------

/** One row from the map list (summary; no mapData blob). */
export interface MapListEntry {
  id: number;
  name: string;
  isDefault: boolean;
  createdAt: Date;
}

/**
 * Minimal DB surface the controller needs. Mirrors GameTrpcAdapter's map
 * methods (Game.ts) structurally so the concrete adapter satisfies it without
 * a circular import.
 */
export interface MapTrpcAdapter {
  mapList(): Promise<MapListEntry[]>;
  mapGet(input: { id: number }): Promise<{ id: number; name: string; mapData: unknown; isDefault: boolean }>;
  mapSave(input: { id?: number; name: string; mapData: MapData }): Promise<{ id: number; name: string }>;
  mapSetDefault(input: { id: number }): Promise<void>;
  mapDelete(input: { id: number }): Promise<void>;
}

/** Thrown by load() when the fetched mapData fails schema validation. */
export class MapValidationError extends Error {}

export class MapPersistenceController {
  private _currentMapId: number | null = null;
  private _currentMapName = "untitled";
  private _mapListCache: MapListEntry[] = [];

  constructor(private readonly adapter: MapTrpcAdapter | null = null) {}

  // ── reads (for MapEditor DOM) ──────────────────────────────────────────
  hasAdapter(): boolean {
    return this.adapter !== null;
  }

  getCurrentMapId(): number | null {
    return this._currentMapId;
  }

  getCurrentMapName(): string {
    return this._currentMapName;
  }

  getMapListCache(): readonly MapListEntry[] {
    return this._mapListCache;
  }

  // ── operations ─────────────────────────────────────────────────────────

  /** Create-or-update. Uses the tracked id (create when null). Updates state. */
  async save(input: { name: string; mapData: MapData }): Promise<{ id: number; name: string }> {
    if (!this.adapter) throw new Error("No DB adapter available");
    const result = await this.adapter.mapSave({
      id: this._currentMapId ?? undefined,
      name: input.name,
      mapData: input.mapData,
    });
    this._currentMapId = result.id;
    this._currentMapName = result.name;
    return result;
  }

  /** Fetch + validate a map. Does NOT touch state (caller applies, then markLoaded). */
  async load(id: number): Promise<{ id: number; name: string; mapData: MapData }> {
    if (!this.adapter) throw new Error("No DB adapter available");
    const row = await this.adapter.mapGet({ id });
    const result = mapDataSchema.safeParse(row.mapData);
    if (!result.success) {
      const msg = result.error.issues[0]?.message ?? "schema validation failed";
      throw new MapValidationError(`Invalid map data: ${msg}`);
    }
    return { id: row.id, name: row.name, mapData: result.data };
  }

  /** Record a successful load after the caller applied the data. */
  markLoaded(id: number, name: string): void {
    this._currentMapId = id;
    this._currentMapName = name;
  }

  /** Refresh + cache the map list. */
  async list(): Promise<MapListEntry[]> {
    if (!this.adapter) throw new Error("No DB adapter available");
    const list = await this.adapter.mapList();
    this._mapListCache = list;
    return list;
  }

  /** Set the tracked current map as default. */
  async setDefaultCurrent(): Promise<void> {
    if (!this.adapter) throw new Error("No DB adapter available");
    if (this._currentMapId === null) throw new Error("No map loaded");
    await this.adapter.mapSetDefault({ id: this._currentMapId });
  }

  /** Delete the tracked current map. Client guard mirrors the server guard. */
  async deleteCurrent(): Promise<void> {
    if (!this.adapter) throw new Error("No DB adapter available");
    if (this._currentMapId === null) throw new Error("No map loaded");
    if (this.isDeleteDisabled()) throw new Error("Cannot delete the default map or the only map");
    await this.adapter.mapDelete({ id: this._currentMapId });
    this._currentMapId = null;
  }

  /** True when delete must be blocked. Identical logic to the old MapEditor guard. */
  isDeleteDisabled(): boolean {
    if (this._currentMapId === null) return true;
    if (this._mapListCache.length <= 1) return true;
    const current = this._mapListCache.find((m) => m.id === this._currentMapId);
    if (current?.isDefault) return true;
    return false;
  }
}
