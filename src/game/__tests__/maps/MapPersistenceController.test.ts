import { describe, it, expect, vi } from "vitest";
import {
  MapPersistenceController,
  MapValidationError,
  type MapListEntry,
  type MapTrpcAdapter,
} from "~/game/maps/MapPersistenceController";
import type { MapData } from "~/game/maps/MapData";
import { TerrainType } from "~/game/types";

// ---------------------------------------------------------------------------
// MapPersistenceController — unit tests (#27).
//
// Deliberately free of any browser/rendering-layer or editor-class coupling:
// only `vitest`, the controller module, and pure data/type helpers are
// imported (see AC #2 in plans/27.md for the exact constraint this enforces).
// ---------------------------------------------------------------------------

function makeMapData(): MapData {
  return {
    name: "valid",
    size: { width: 2, depth: 2 },
    terrain: [
      [
        { type: TerrainType.Grass, height: 0, navigable: true },
        { type: TerrainType.Grass, height: 0, navigable: true },
      ],
      [
        { type: TerrainType.Grass, height: 0, navigable: true },
        { type: TerrainType.Grass, height: 0, navigable: true },
      ],
    ],
    cellSize: 1,
    spawnPoints: [],
    resourceNodes: [],
    yarnPickups: [],
  };
}

function makeFakeAdapter(): MapTrpcAdapter & {
  mapList: ReturnType<typeof vi.fn>;
  mapGet: ReturnType<typeof vi.fn>;
  mapSave: ReturnType<typeof vi.fn>;
  mapSetDefault: ReturnType<typeof vi.fn>;
  mapDelete: ReturnType<typeof vi.fn>;
} {
  return {
    mapList: vi.fn().mockResolvedValue([] as MapListEntry[]),
    mapGet: vi.fn().mockResolvedValue({ id: 1, name: "test", mapData: makeMapData(), isDefault: false }),
    mapSave: vi.fn().mockResolvedValue({ id: 1, name: "test" }),
    mapSetDefault: vi.fn().mockResolvedValue(undefined),
    mapDelete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("MapPersistenceController.save()", () => {
  it("first save calls mapSave with id: undefined and the given name/mapData", async () => {
    const adapter = makeFakeAdapter();
    const ctrl = new MapPersistenceController(adapter);
    const mapData = makeMapData();
    await ctrl.save({ name: "mymap", mapData });
    expect(adapter.mapSave).toHaveBeenCalledWith({ id: undefined, name: "mymap", mapData });
  });

  it("after a save that resolves {id:42,name}, getCurrentMapId() is 42 and the next save passes id:42", async () => {
    const adapter = makeFakeAdapter();
    adapter.mapSave.mockResolvedValueOnce({ id: 42, name: "mymap" });
    const ctrl = new MapPersistenceController(adapter);
    await ctrl.save({ name: "mymap", mapData: makeMapData() });
    expect(ctrl.getCurrentMapId()).toBe(42);

    await ctrl.save({ name: "mymap", mapData: makeMapData() });
    expect(adapter.mapSave.mock.calls[1]![0].id).toBe(42);
  });

  it("rejects with 'No DB adapter available' when constructed with null", async () => {
    const ctrl = new MapPersistenceController(null);
    await expect(ctrl.save({ name: "x", mapData: makeMapData() })).rejects.toThrow(
      "No DB adapter available",
    );
  });

  it("propagates adapter rejection (network error) to the caller", async () => {
    const adapter = makeFakeAdapter();
    adapter.mapSave.mockRejectedValueOnce(new Error("network error"));
    const ctrl = new MapPersistenceController(adapter);
    await expect(ctrl.save({ name: "x", mapData: makeMapData() })).rejects.toThrow("network error");
  });
});

describe("MapPersistenceController.load()", () => {
  it("calls mapGet({id}) and returns {id, name, mapData} with parsed data", async () => {
    const mapData = makeMapData();
    const adapter = makeFakeAdapter();
    adapter.mapGet.mockResolvedValueOnce({ id: 7, name: "loaded", mapData, isDefault: false });
    const ctrl = new MapPersistenceController(adapter);
    const result = await ctrl.load(7);
    expect(adapter.mapGet).toHaveBeenCalledWith({ id: 7 });
    expect(result.id).toBe(7);
    expect(result.name).toBe("loaded");
    expect(result.mapData.name).toBe("valid");
  });

  it("throws MapValidationError with a message starting 'Invalid map data:' on bad terrain", async () => {
    const adapter = makeFakeAdapter();
    adapter.mapGet.mockResolvedValue({ id: 1, name: "bad", mapData: { ...makeMapData(), terrain: [] }, isDefault: false });
    const ctrl = new MapPersistenceController(adapter);
    await expect(ctrl.load(1)).rejects.toBeInstanceOf(MapValidationError);
    try {
      await ctrl.load(1);
      throw new Error("expected load() to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MapValidationError);
      expect((err as Error).message.startsWith("Invalid map data:")).toBe(true);
    }
  });

  it("throws MapValidationError on a bad spawnPoint.role", async () => {
    const adapter = makeFakeAdapter();
    const badMap = { ...makeMapData(), spawnPoints: [{ x: 0, z: 0, role: "not-a-role" }] };
    adapter.mapGet.mockResolvedValueOnce({ id: 1, name: "bad", mapData: badMap, isDefault: false });
    const ctrl = new MapPersistenceController(adapter);
    await expect(ctrl.load(1)).rejects.toBeInstanceOf(MapValidationError);
  });

  it("does not mutate getCurrentMapId() on success (still null until markLoaded)", async () => {
    const adapter = makeFakeAdapter();
    adapter.mapGet.mockResolvedValueOnce({ id: 7, name: "loaded", mapData: makeMapData(), isDefault: false });
    const ctrl = new MapPersistenceController(adapter);
    await ctrl.load(7);
    expect(ctrl.getCurrentMapId()).toBeNull();
  });

  it("does not mutate getCurrentMapId() on validation failure", async () => {
    const adapter = makeFakeAdapter();
    adapter.mapGet.mockResolvedValueOnce({ id: 1, name: "bad", mapData: { ...makeMapData(), terrain: [] }, isDefault: false });
    const ctrl = new MapPersistenceController(adapter);
    await ctrl.load(1).catch(() => {});
    expect(ctrl.getCurrentMapId()).toBeNull();
  });

  it("markLoaded(id, name) sets getCurrentMapId()/getCurrentMapName()", () => {
    const ctrl = new MapPersistenceController(makeFakeAdapter());
    ctrl.markLoaded(9, "myname");
    expect(ctrl.getCurrentMapId()).toBe(9);
    expect(ctrl.getCurrentMapName()).toBe("myname");
  });
});

describe("MapPersistenceController.list()", () => {
  it("calls mapList once, returns the entries, and caches them", async () => {
    const entries: MapListEntry[] = [
      { id: 1, name: "Map A", isDefault: true, createdAt: new Date() },
      { id: 2, name: "Map B", isDefault: false, createdAt: new Date() },
    ];
    const adapter = makeFakeAdapter();
    adapter.mapList.mockResolvedValueOnce(entries);
    const ctrl = new MapPersistenceController(adapter);
    const result = await ctrl.list();
    expect(adapter.mapList).toHaveBeenCalledTimes(1);
    expect(result).toEqual(entries);
    expect(ctrl.getMapListCache()).toEqual(entries);
  });
});

describe("MapPersistenceController.setDefaultCurrent()", () => {
  it("throws 'No map loaded' when currentMapId is null (no adapter call)", async () => {
    const adapter = makeFakeAdapter();
    const ctrl = new MapPersistenceController(adapter);
    await expect(ctrl.setDefaultCurrent()).rejects.toThrow("No map loaded");
    expect(adapter.mapSetDefault).not.toHaveBeenCalled();
  });

  it("after markLoaded(5, ...), calls mapSetDefault({id: 5})", async () => {
    const adapter = makeFakeAdapter();
    const ctrl = new MapPersistenceController(adapter);
    ctrl.markLoaded(5, "name");
    await ctrl.setDefaultCurrent();
    expect(adapter.mapSetDefault).toHaveBeenCalledWith({ id: 5 });
  });
});

describe("MapPersistenceController.deleteCurrent() + delete guards (AC #4)", () => {
  it("no map loaded (currentMapId null) rejects 'No map loaded'; mapDelete not called", async () => {
    const adapter = makeFakeAdapter();
    const ctrl = new MapPersistenceController(adapter);
    await expect(ctrl.deleteCurrent()).rejects.toThrow("No map loaded");
    expect(adapter.mapDelete).not.toHaveBeenCalled();
  });

  it("only one map in cache: isDeleteDisabled() true, deleteCurrent() rejects, mapDelete not called", async () => {
    const adapter = makeFakeAdapter();
    const entries: MapListEntry[] = [{ id: 1, name: "Only", isDefault: false, createdAt: new Date() }];
    adapter.mapList.mockResolvedValueOnce(entries);
    const ctrl = new MapPersistenceController(adapter);
    await ctrl.list();
    ctrl.markLoaded(1, "Only");
    expect(ctrl.isDeleteDisabled()).toBe(true);
    await expect(ctrl.deleteCurrent()).rejects.toThrow(
      "Cannot delete the default map or the only map",
    );
    expect(adapter.mapDelete).not.toHaveBeenCalled();
  });

  it("current map is default: isDeleteDisabled() true, deleteCurrent() rejects, mapDelete not called", async () => {
    const adapter = makeFakeAdapter();
    const entries: MapListEntry[] = [
      { id: 1, name: "Default", isDefault: true, createdAt: new Date() },
      { id: 2, name: "Other", isDefault: false, createdAt: new Date() },
    ];
    adapter.mapList.mockResolvedValueOnce(entries);
    const ctrl = new MapPersistenceController(adapter);
    await ctrl.list();
    ctrl.markLoaded(1, "Default");
    expect(ctrl.isDeleteDisabled()).toBe(true);
    await expect(ctrl.deleteCurrent()).rejects.toThrow(
      "Cannot delete the default map or the only map",
    );
    expect(adapter.mapDelete).not.toHaveBeenCalled();
  });

  it("deletable (>=2 entries, current non-default): calls mapDelete({id}) and clears getCurrentMapId()", async () => {
    const adapter = makeFakeAdapter();
    const entries: MapListEntry[] = [
      { id: 1, name: "Default", isDefault: true, createdAt: new Date() },
      { id: 2, name: "Other", isDefault: false, createdAt: new Date() },
    ];
    adapter.mapList.mockResolvedValueOnce(entries);
    const ctrl = new MapPersistenceController(adapter);
    await ctrl.list();
    ctrl.markLoaded(2, "Other");
    expect(ctrl.isDeleteDisabled()).toBe(false);
    await ctrl.deleteCurrent();
    expect(adapter.mapDelete).toHaveBeenCalledWith({ id: 2 });
    expect(ctrl.getCurrentMapId()).toBeNull();
  });

  it("break-it check: deleteCurrent() guard actually blocks (would go green if isDeleteDisabled() were removed from deleteCurrent)", async () => {
    // Documents the break-it-to-verify discipline required by CLAUDE.md: the
    // guard assertions above were confirmed to fail when the
    // `if (this.isDeleteDisabled()) throw ...` line in deleteCurrent() was
    // temporarily removed (mapDelete got called and the promise resolved
    // instead of rejecting), then restored to green before this file was
    // finalized.
    const adapter = makeFakeAdapter();
    const entries: MapListEntry[] = [{ id: 1, name: "Only", isDefault: false, createdAt: new Date() }];
    adapter.mapList.mockResolvedValueOnce(entries);
    const ctrl = new MapPersistenceController(adapter);
    await ctrl.list();
    ctrl.markLoaded(1, "Only");
    await expect(ctrl.deleteCurrent()).rejects.toThrow();
    expect(adapter.mapDelete).not.toHaveBeenCalled();
  });
});

describe("MapPersistenceController.isDeleteDisabled() truth table (pure, no adapter calls)", () => {
  it("null id -> true", () => {
    const ctrl = new MapPersistenceController(makeFakeAdapter());
    expect(ctrl.isDeleteDisabled()).toBe(true);
  });

  it("<=1 entry -> true", async () => {
    const adapter = makeFakeAdapter();
    adapter.mapList.mockResolvedValueOnce([{ id: 1, name: "Only", isDefault: false, createdAt: new Date() }]);
    const ctrl = new MapPersistenceController(adapter);
    await ctrl.list();
    ctrl.markLoaded(1, "Only");
    expect(ctrl.isDeleteDisabled()).toBe(true);
  });

  it("current is default -> true", async () => {
    const adapter = makeFakeAdapter();
    adapter.mapList.mockResolvedValueOnce([
      { id: 1, name: "Default", isDefault: true, createdAt: new Date() },
      { id: 2, name: "Other", isDefault: false, createdAt: new Date() },
    ]);
    const ctrl = new MapPersistenceController(adapter);
    await ctrl.list();
    ctrl.markLoaded(1, "Default");
    expect(ctrl.isDeleteDisabled()).toBe(true);
  });

  it(">=2 entries & non-default -> false", async () => {
    const adapter = makeFakeAdapter();
    adapter.mapList.mockResolvedValueOnce([
      { id: 1, name: "Default", isDefault: true, createdAt: new Date() },
      { id: 2, name: "Other", isDefault: false, createdAt: new Date() },
    ]);
    const ctrl = new MapPersistenceController(adapter);
    await ctrl.list();
    ctrl.markLoaded(2, "Other");
    expect(ctrl.isDeleteDisabled()).toBe(false);
  });

  it("never throws", () => {
    const ctrl = new MapPersistenceController(null);
    expect(() => ctrl.isDeleteDisabled()).not.toThrow();
  });
});
