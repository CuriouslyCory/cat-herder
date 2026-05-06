import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GameState } from "~/game/engine/GameState";
import { EventBus } from "~/game/engine/EventBus";
import { Persistence, toExternalSaveData, fromExternalSaveData } from "~/game/state/Persistence";
import { CURRENT_VERSION } from "~/game/state/SaveData";
import type { SaveData as ExternalSaveData } from "~/game/state/SaveData";
import type { GameTrpcAdapter } from "~/game/engine/Game";
import { CatType, ResourceType } from "~/game/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validExternalSaveData(): ExternalSaveData {
  return {
    character: {
      appearance: {},
      stats: { level: 1, health: 10, maxHealth: 10 },
      inventory: [],
      position: { x: 0, y: 0, z: 0 },
      yarn: 10,
      oxygen: 100,
      abilities: [],
    },
    world: {
      currentMapId: "default",
      activeCats: [],
      resourceNodeCooldowns: [],
      hiddenTerrain: [],
    },
    session: { totalPlaytimeMs: 0 },
  };
}

function makeMockAdapter(overrides: Partial<GameTrpcAdapter> = {}): {
  adapter: GameTrpcAdapter;
  upsertSave: ReturnType<typeof vi.fn>;
  getSave: ReturnType<typeof vi.fn>;
  deleteSave: ReturnType<typeof vi.fn>;
} {
  const upsertSave = vi.fn().mockResolvedValue(undefined);
  const getSave = vi.fn().mockResolvedValue(null);
  const deleteSave = vi.fn().mockResolvedValue(undefined);
  const adapter: GameTrpcAdapter = {
    upsertSave,
    getSave,
    deleteSave,
    ...overrides,
  };
  return { adapter, upsertSave, getSave, deleteSave };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let gameState: GameState;
let eventBus: EventBus;
let persistence: Persistence;
let upsertSave: ReturnType<typeof vi.fn>;
let getSave: ReturnType<typeof vi.fn>;

beforeEach(() => {
  gameState = new GameState(10);
  eventBus = new EventBus();
  const mocks = makeMockAdapter();
  upsertSave = mocks.upsertSave;
  getSave = mocks.getSave;
  persistence = new Persistence(gameState, mocks.adapter, eventBus);
});

afterEach(() => {
  persistence.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// save()
// ---------------------------------------------------------------------------

describe("save()", () => {
  it("sends serialized data via trpcAdapter.upsertSave", async () => {
    await persistence.save();
    expect(upsertSave).toHaveBeenCalledWith({
      version: CURRENT_VERSION,
      saveData: expect.objectContaining({ character: expect.any(Object) }),
    });
  });

  it("clears isDirty after successful save", async () => {
    gameState.addYarn(5);
    expect(gameState.isDirty).toBe(true);
    await persistence.save();
    expect(gameState.isDirty).toBe(false);
  });

  it("sets lastSavedAt after successful save", async () => {
    expect(persistence.lastSavedAt).toBeNull();
    await persistence.save();
    expect(persistence.lastSavedAt).not.toBeNull();
  });

  it("sets isSaving true during save and false after", async () => {
    let capturedIsSaving = false;
    upsertSave.mockImplementationOnce(async () => {
      capturedIsSaving = persistence.isSaving;
    });
    await persistence.save();
    expect(capturedIsSaving).toBe(true);
    expect(persistence.isSaving).toBe(false);
  });

  it("emits save:failed on trpcAdapter error and does not throw", async () => {
    const failureHandler = vi.fn();
    eventBus.on("save:failed", failureHandler);
    upsertSave.mockRejectedValueOnce(new Error("Network error"));
    await expect(persistence.save()).resolves.toBeUndefined();
    expect(failureHandler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "save:failed", error: "Network error" }),
    );
  });

  it("resets isSaving even when save throws", async () => {
    upsertSave.mockRejectedValueOnce(new Error("fail"));
    await persistence.save();
    expect(persistence.isSaving).toBe(false);
  });

  it("does not allow concurrent saves", async () => {
    // Start first save (not resolved yet)
    upsertSave.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
    const first = persistence.save();
    // Second save while first is in flight — should be a no-op
    const second = persistence.save();
    await Promise.all([first, second]);
    expect(upsertSave).toHaveBeenCalledTimes(1);
  });

  it("maps player fields to character in external format", async () => {
    gameState.addYarn(15);
    await persistence.save();
    const call = upsertSave.mock.calls[0] as [{ version: string; saveData: ExternalSaveData }];
    expect(call[0].saveData.character.yarn).toBe(25); // 10 initial + 15
  });

  it("maps resourceNodes to resourceNodeCooldowns", async () => {
    await persistence.save();
    const call = upsertSave.mock.calls[0] as [{ version: string; saveData: ExternalSaveData }];
    expect(call[0].saveData.world).toHaveProperty("resourceNodeCooldowns");
    expect(call[0].saveData.world).not.toHaveProperty("resourceNodes");
  });
});

// ---------------------------------------------------------------------------
// load()
// ---------------------------------------------------------------------------

describe("load()", () => {
  it("returns null when no save exists", async () => {
    getSave.mockResolvedValueOnce(null);
    const result = await persistence.load();
    expect(result).toBeNull();
  });

  it("fetches and migrates save data when save exists", async () => {
    getSave.mockResolvedValueOnce({
      version: CURRENT_VERSION,
      saveData: validExternalSaveData(),
    });
    const result = await persistence.load();
    expect(result).not.toBeNull();
    expect(result?.character.yarn).toBe(10);
  });

  it("calls trpcAdapter.getSave()", async () => {
    await persistence.load();
    expect(getSave).toHaveBeenCalled();
  });

  it("propagates migration errors", async () => {
    getSave.mockResolvedValueOnce({ version: "99.0", saveData: {} });
    await expect(persistence.load()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// startAutoSave() / stopAutoSave()
// ---------------------------------------------------------------------------

describe("startAutoSave()", () => {
  it("does not save when state is clean", async () => {
    vi.useFakeTimers();
    persistence.startAutoSave(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("saves when non-position state is dirty", async () => {
    vi.useFakeTimers();
    gameState.addYarn(5);
    persistence.startAutoSave(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(upsertSave).toHaveBeenCalled();
  });

  it("does not double-register if called twice", async () => {
    vi.useFakeTimers();
    gameState.addYarn(5);
    persistence.startAutoSave(1000);
    persistence.startAutoSave(1000);
    await vi.advanceTimersByTimeAsync(1000);
    // Only one interval fires
    expect(upsertSave).toHaveBeenCalledTimes(1);
  });
});

describe("stopAutoSave()", () => {
  it("stops the interval so no further saves occur", async () => {
    vi.useFakeTimers();
    gameState.addYarn(5);
    persistence.startAutoSave(1000);
    persistence.stopAutoSave();
    await vi.advanceTimersByTimeAsync(5000);
    expect(upsertSave).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Position dirty throttle
// ---------------------------------------------------------------------------

describe("position dirty throttle", () => {
  it("skips save when only position changed within 5 seconds", async () => {
    vi.useFakeTimers();
    // Position change marks dirty
    gameState.set("player.position", { x: 5, y: 0, z: 0 });
    persistence.startAutoSave(1000);
    // Advance 4 seconds — position is only 4s old, throttle blocks save
    await vi.advanceTimersByTimeAsync(4000);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("saves when position has been dirty for 5+ seconds", async () => {
    vi.useFakeTimers();
    gameState.set("player.position", { x: 5, y: 0, z: 0 });
    persistence.startAutoSave(1000);
    // Advance 6 seconds — position change is now stale enough
    await vi.advanceTimersByTimeAsync(6000);
    expect(upsertSave).toHaveBeenCalled();
  });

  it("saves immediately when non-position state is also dirty", async () => {
    vi.useFakeTimers();
    gameState.set("player.position", { x: 5, y: 0, z: 0 });
    gameState.addYarn(3); // non-position dirty
    persistence.startAutoSave(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(upsertSave).toHaveBeenCalled();
  });

  it("resets position tracking after save", async () => {
    vi.useFakeTimers();
    gameState.set("player.position", { x: 5, y: 0, z: 0 });
    persistence.startAutoSave(1000);
    await vi.advanceTimersByTimeAsync(6000);
    expect(upsertSave).toHaveBeenCalledTimes(1);
    // After save, position flag is reset — no additional save at next tick
    await vi.advanceTimersByTimeAsync(1000);
    expect(upsertSave).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// forceSave()
// ---------------------------------------------------------------------------

describe("forceSave()", () => {
  it("saves regardless of isDirty flag", async () => {
    expect(gameState.isDirty).toBe(false);
    await persistence.forceSave();
    expect(upsertSave).toHaveBeenCalled();
  });

  it("clears dirty flag after force save", async () => {
    gameState.addYarn(5);
    await persistence.forceSave();
    expect(gameState.isDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// restoreFromSave()
// ---------------------------------------------------------------------------

describe("restoreFromSave()", () => {
  it("hydrates gameState yarn from external SaveData", () => {
    const data = validExternalSaveData();
    data.character.yarn = 42;
    persistence.restoreFromSave(data);
    expect(gameState.yarn).toBe(42);
  });

  it("hydrates gameState stats from external SaveData", () => {
    const data = validExternalSaveData();
    data.character.stats = { level: 5, health: 7, maxHealth: 10 };
    persistence.restoreFromSave(data);
    expect(gameState.get<number>("player.stats.level")).toBe(5);
    expect(gameState.get<number>("player.stats.health")).toBe(7);
  });

  it("hydrates inventory from external SaveData", () => {
    const data = validExternalSaveData();
    data.character.inventory = [{ resourceType: ResourceType.Grass, quantity: 3 }];
    persistence.restoreFromSave(data);
    expect(gameState.inventory).toHaveLength(1);
    expect(gameState.inventory[0]?.quantity).toBe(3);
  });

  it("hydrates world.resourceNodeCooldowns into internal resourceNodes", () => {
    const data = validExternalSaveData();
    data.world.resourceNodeCooldowns = [{ nodeId: "node-1", cooldownRemaining: 10 }];
    persistence.restoreFromSave(data);
    const nodes = gameState.get<Array<{ nodeId: string; cooldownRemaining: number }>>(
      "world.resourceNodes",
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.nodeId).toBe("node-1");
  });

  it("fires onChange callbacks for restored paths", () => {
    const yarnCb = vi.fn();
    gameState.onChange<number>("player.yarn", yarnCb);
    yarnCb.mockClear();
    const data = validExternalSaveData();
    data.character.yarn = 99;
    persistence.restoreFromSave(data);
    expect(yarnCb).toHaveBeenCalledWith(99, 10);
  });
});

// ---------------------------------------------------------------------------
// toExternalSaveData / fromExternalSaveData converters
// ---------------------------------------------------------------------------

describe("toExternalSaveData()", () => {
  it("renames player to character", () => {
    const internal = gameState.serialize();
    const external = toExternalSaveData(internal);
    expect(external).toHaveProperty("character");
    expect(external).not.toHaveProperty("player");
  });

  it("maps resourceNodes to resourceNodeCooldowns", () => {
    const internal = gameState.serialize();
    const external = toExternalSaveData(internal);
    expect(external.world).toHaveProperty("resourceNodeCooldowns");
    expect(external.world).not.toHaveProperty("resourceNodes");
  });

  it("includes session with totalPlaytimeMs=0", () => {
    const external = toExternalSaveData(gameState.serialize());
    expect(external.session.totalPlaytimeMs).toBe(0);
  });
});

describe("fromExternalSaveData()", () => {
  it("renames character back to player", () => {
    const external = validExternalSaveData();
    const internal = fromExternalSaveData(external);
    expect(internal).toHaveProperty("player");
    expect(internal).not.toHaveProperty("character");
  });

  it("maps resourceNodeCooldowns back to resourceNodes", () => {
    const external = validExternalSaveData();
    external.world.resourceNodeCooldowns = [{ nodeId: "n1", cooldownRemaining: 5 }];
    const internal = fromExternalSaveData(external);
    expect(internal.world).toHaveProperty("resourceNodes");
    expect(internal.world.resourceNodes).toHaveLength(1);
  });

  it("preserves activeCats", () => {
    const external = validExternalSaveData();
    external.world.activeCats = [{ catType: CatType.Loaf, position: { x: 1, y: 0, z: 2 } }];
    const internal = fromExternalSaveData(external);
    expect(internal.world.activeCats).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// setupBeforeUnload() / dispose() beforeunload cleanup
// ---------------------------------------------------------------------------

describe("setupBeforeUnload()", () => {
  it("registers a beforeunload listener on window", () => {
    const addEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener, removeEventListener: vi.fn() });
    vi.stubGlobal("navigator", { sendBeacon: vi.fn().mockReturnValue(true) });

    persistence.setupBeforeUnload();

    expect(addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("dispose() removes the beforeunload listener", () => {
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener });
    vi.stubGlobal("navigator", { sendBeacon: vi.fn().mockReturnValue(true) });

    persistence.setupBeforeUnload();
    persistence.dispose();

    expect(removeEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("calls sendBeacon with serialized state when beforeunload fires", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    let capturedHandler: (() => void) | null = null;
    vi.stubGlobal("window", {
      addEventListener: (_: string, fn: () => void) => {
        capturedHandler = fn;
      },
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("navigator", { sendBeacon });

    persistence.setupBeforeUnload();
    capturedHandler!();

    expect(sendBeacon).toHaveBeenCalledWith(
      "/api/game/beacon-save",
      expect.stringContaining('"character"'),
    );
  });

  it("falls back gracefully when navigator.sendBeacon is unavailable", () => {
    let capturedHandler: (() => void) | null = null;
    vi.stubGlobal("window", {
      addEventListener: (_: string, fn: () => void) => {
        capturedHandler = fn;
      },
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("navigator", {}); // no sendBeacon

    persistence.setupBeforeUnload();
    expect(() => capturedHandler!()).not.toThrow();
  });

  it("does not remove listener if setupBeforeUnload was never called", () => {
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener });
    vi.stubGlobal("navigator", { sendBeacon: vi.fn() });

    // dispose() without prior setupBeforeUnload — should not call removeEventListener
    persistence.dispose();
    expect(removeEventListener).not.toHaveBeenCalled();
  });
});
