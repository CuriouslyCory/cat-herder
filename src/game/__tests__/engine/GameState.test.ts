import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameState } from "~/game/engine/GameState";
import type { SaveData } from "~/game/engine/GameState";
import { ResourceType } from "~/game/types";

describe("GameState", () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState(10);
  });

  // ── Existing backward-compat tests ───────────────────────────────────────────

  describe("yarn (backward-compat)", () => {
    it("starts with initial yarn value", () => {
      expect(state.yarn).toBe(10);
    });

    it("adds yarn", () => {
      state.addYarn(5);
      expect(state.yarn).toBe(15);
    });

    it("deducts yarn on sufficient balance", () => {
      const result = state.deductYarn(3);
      expect(result).toBe(true);
      expect(state.yarn).toBe(7);
    });

    it("refuses deduction on insufficient balance", () => {
      const result = state.deductYarn(11);
      expect(result).toBe(false);
      expect(state.yarn).toBe(10);
    });

    it("notifies listeners on yarn change", () => {
      const listener = vi.fn();
      state.onYarnChange(listener);
      expect(listener).toHaveBeenCalledWith(10);

      state.addYarn(5);
      expect(listener).toHaveBeenCalledWith(15);
    });

    it("unsubscribes listener", () => {
      const listener = vi.fn();
      const unsub = state.onYarnChange(listener);
      unsub();
      listener.mockClear();

      state.addYarn(5);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("inventory (backward-compat)", () => {
    it("starts empty", () => {
      expect(state.inventory).toHaveLength(0);
      expect(state.inventoryTotal).toBe(0);
    });

    it("adds resources and stacks same type", () => {
      state.addResource(ResourceType.Grass, 3);
      state.addResource(ResourceType.Grass, 2);
      expect(state.inventory).toHaveLength(1);
      expect(state.inventory[0]!.quantity).toBe(5);
    });

    it("separates different resource types", () => {
      state.addResource(ResourceType.Grass, 2);
      state.addResource(ResourceType.Sticks, 3);
      expect(state.inventory).toHaveLength(2);
      expect(state.inventoryTotal).toBe(5);
    });

    it("checks capacity correctly", () => {
      state.addResource(ResourceType.Grass, 9);
      expect(state.hasInventorySpace(1)).toBe(true);
      expect(state.hasInventorySpace(2)).toBe(false);
    });

    it("notifies inventory listeners on change", () => {
      const listener = vi.fn();
      state.onInventoryChange(listener);
      expect(listener).toHaveBeenCalledTimes(1);

      state.addResource(ResourceType.Water, 1);
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  // ── Path-based API ────────────────────────────────────────────────────────────

  describe("get/set round-trip", () => {
    it("sets and gets a top-level player field", () => {
      state.set("player.yarn", 25);
      expect(state.get<number>("player.yarn")).toBe(25);
    });

    it("sets and gets a nested stats field", () => {
      state.set("player.stats.level", 5);
      expect(state.get<number>("player.stats.level")).toBe(5);
    });

    it("sets and gets world.currentMapId", () => {
      state.set("world.currentMapId", "forest");
      expect(state.get<string>("world.currentMapId")).toBe("forest");
    });
  });

  describe("onChange", () => {
    it("fires callback with new and old values", () => {
      const callback = vi.fn();
      state.onChange<number>("player.yarn", callback);
      state.set("player.yarn", 20);
      expect(callback).toHaveBeenCalledWith(20, 10);
    });

    it("returns unsubscribe that stops future notifications", () => {
      const callback = vi.fn();
      const unsub = state.onChange<number>("player.yarn", callback);
      unsub();
      state.set("player.yarn", 20);
      expect(callback).not.toHaveBeenCalled();
    });

    it("fires callback for the correct path only", () => {
      const yarnCb = vi.fn();
      const levelCb = vi.fn();
      state.onChange<number>("player.yarn", yarnCb);
      state.onChange<number>("player.stats.level", levelCb);
      state.set("player.yarn", 20);
      expect(yarnCb).toHaveBeenCalledTimes(1);
      expect(levelCb).not.toHaveBeenCalled();
    });
  });

  // ── Validation ────────────────────────────────────────────────────────────────

  describe("validation", () => {
    it("rejects negative yarn", () => {
      state.set("player.yarn", -5);
      expect(state.yarn).toBe(10);
    });

    it("rejects health above maxHealth", () => {
      state.set("player.stats.health", 999);
      expect(state.get<number>("player.stats.health")).toBe(10); // default maxHealth is 10
    });

    it("rejects negative health", () => {
      state.set("player.stats.health", -1);
      expect(state.get<number>("player.stats.health")).toBe(10);
    });

    it("rejects level below 0", () => {
      state.set("player.stats.level", -1);
      expect(state.get<number>("player.stats.level")).toBe(1);
    });

    it("rejects level above 10", () => {
      state.set("player.stats.level", 11);
      expect(state.get<number>("player.stats.level")).toBe(1);
    });

    it("rejects non-integer level", () => {
      state.set("player.stats.level", 2.5);
      expect(state.get<number>("player.stats.level")).toBe(1);
    });

    it("rejects maxHealth of 0 or less", () => {
      state.set("player.stats.maxHealth", 0);
      expect(state.get<number>("player.stats.maxHealth")).toBe(10);
    });

    it("accepts valid health within range", () => {
      state.set("player.stats.health", 5);
      expect(state.get<number>("player.stats.health")).toBe(5);
    });
  });

  // ── isDirty ───────────────────────────────────────────────────────────────────

  describe("isDirty", () => {
    it("starts clean", () => {
      expect(state.isDirty).toBe(false);
    });

    it("marks dirty after set()", () => {
      state.set("player.yarn", 20);
      expect(state.isDirty).toBe(true);
    });

    it("marks dirty after addYarn()", () => {
      state.addYarn(5);
      expect(state.isDirty).toBe(true);
    });

    it("clearDirty resets the flag", () => {
      state.set("player.yarn", 20);
      state.clearDirty();
      expect(state.isDirty).toBe(false);
    });

    it("rejected set() does not mark dirty", () => {
      state.set("player.yarn", -1); // rejected by validation
      expect(state.isDirty).toBe(false);
    });
  });

  // ── serialize ─────────────────────────────────────────────────────────────────

  describe("serialize", () => {
    it("returns player and world", () => {
      const data = state.serialize();
      expect(data).toHaveProperty("player");
      expect(data).toHaveProperty("world");
    });

    it("excludes session data", () => {
      state.set("session.isSwimming", true);
      const data = state.serialize();
      expect(data).not.toHaveProperty("session");
    });

    it("snapshot is a deep clone (mutations don't affect state)", () => {
      const data = state.serialize();
      data.player.yarn = 999;
      expect(state.yarn).toBe(10);
    });

    it("reflects current state values", () => {
      state.addYarn(5);
      state.set("player.stats.level", 3);
      const data = state.serialize();
      expect(data.player.yarn).toBe(15);
      expect(data.player.stats.level).toBe(3);
    });
  });

  // ── restore ───────────────────────────────────────────────────────────────────

  describe("restore", () => {
    function makeSaveData(overrides: Partial<SaveData["player"]> = {}): SaveData {
      return {
        player: {
          appearance: {},
          position: { x: 5, y: 0, z: 3 },
          stats: { level: 4, health: 7, maxHealth: 10 },
          yarn: 30,
          oxygen: 80,
          abilities: [],
          inventory: [{ resourceType: ResourceType.Grass, quantity: 3 }],
          ...overrides,
        },
        world: {
          currentMapId: "forest",
          activeCats: [],
          hiddenTerrain: [],
          resourceNodes: [],
        },
      };
    }

    it("hydrates yarn from saved data", () => {
      state.restore(makeSaveData());
      expect(state.yarn).toBe(30);
    });

    it("hydrates stats from saved data", () => {
      state.restore(makeSaveData());
      expect(state.get<number>("player.stats.level")).toBe(4);
      expect(state.get<number>("player.stats.health")).toBe(7);
    });

    it("hydrates inventory from saved data", () => {
      state.restore(makeSaveData());
      expect(state.inventory).toHaveLength(1);
      expect(state.inventory[0]!.quantity).toBe(3);
    });

    it("fires onChange callbacks for registered paths", () => {
      const yarnCb = vi.fn();
      state.onChange<number>("player.yarn", yarnCb);
      state.restore(makeSaveData());
      expect(yarnCb).toHaveBeenCalled();
    });

    it("fires onChange with correct old and new values", () => {
      const yarnCb = vi.fn();
      state.onChange<number>("player.yarn", yarnCb);
      state.restore(makeSaveData({ yarn: 50 }));
      // newVal=50, oldVal=10
      expect(yarnCb).toHaveBeenCalledWith(50, 10);
    });

    it("does NOT mark state dirty after restore", () => {
      state.restore(makeSaveData());
      expect(state.isDirty).toBe(false);
    });

    it("restore snapshot is a deep clone (mutations don't corrupt state)", () => {
      const saveData = makeSaveData();
      state.restore(saveData);
      saveData.player.yarn = 999; // mutate original
      expect(state.yarn).toBe(30); // state unaffected
    });
  });
});
