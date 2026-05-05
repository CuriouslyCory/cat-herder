import { describe, it, expect, beforeEach, vi } from "vitest";
import { GameState } from "~/game/engine/GameState";
import { ResourceType } from "~/game/types";

describe("GameState", () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState(10);
  });

  describe("yarn", () => {
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

  describe("inventory", () => {
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
});
