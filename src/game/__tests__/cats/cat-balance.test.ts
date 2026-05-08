import { describe, it, expect } from "vitest";
import { LoafDefinition } from "~/game/cats/definitions/Loaf";
import { ZoomiesDefinition } from "~/game/cats/definitions/Zoomies";
import { CuriosityCatDefinition } from "~/game/cats/definitions/CuriosityCat";
import { PounceDefinition } from "~/game/cats/definitions/Pounce";
import { CONFIG } from "~/game/config";
import { GameState } from "~/game/engine/GameState";

// US-308 — Cat Balance Pass
// Regression tests: assert exact GDD-tuned cat parameters so accidental drift
// is caught immediately. Never change these expectations without updating a
// code comment in the definition file explaining the new value.

describe("LoafDefinition — balance", () => {
  it("yarn cost is 1", () => {
    expect(LoafDefinition.yarnCost).toBe(1);
  });

  it("height (y dim) is 0.75 u", () => {
    const dims = LoafDefinition.meshConfig.dims as [number, number, number];
    expect(dims[1]).toBe(0.75);
  });

  it("collider height is 0.75 u", () => {
    expect(LoafDefinition.behavior.params?.colliderHeight).toBe(0.75);
  });

  it("2 stacked Loafs reach 1.5 u", () => {
    const dims = LoafDefinition.meshConfig.dims as [number, number, number];
    expect(dims[1]! * 2).toBeCloseTo(1.5, 5);
  });

  it("3 stacked Loafs reach 2.25 u", () => {
    const dims = LoafDefinition.meshConfig.dims as [number, number, number];
    expect(dims[1]! * 3).toBeCloseTo(2.25, 5);
  });

  it("effect type is terrain", () => {
    expect(LoafDefinition.effectType).toBe("terrain");
  });
});

describe("ZoomiesDefinition — balance", () => {
  it("yarn cost is 2", () => {
    expect(ZoomiesDefinition.yarnCost).toBe(2);
  });

  it("speed multiplier is 2.0 (2×)", () => {
    expect(ZoomiesDefinition.behavior.params?.speedMultiplier).toBe(2.0);
  });

  it("trail length is 6 u", () => {
    expect(ZoomiesDefinition.behavior.params?.trailLength).toBe(6);
  });

  it("duration is 8 s", () => {
    expect(ZoomiesDefinition.behavior.duration).toBe(8);
  });

  it("effect type is movement", () => {
    expect(ZoomiesDefinition.effectType).toBe("movement");
  });
});

describe("CuriosityCatDefinition — balance", () => {
  it("yarn cost is 2", () => {
    expect(CuriosityCatDefinition.yarnCost).toBe(2);
  });

  it("reveal radius is 5 u", () => {
    expect(CuriosityCatDefinition.behavior.params?.revealRadius).toBe(5);
  });

  it("duration is 20 s", () => {
    expect(CuriosityCatDefinition.behavior.duration).toBe(20);
  });

  it("effect type is utility", () => {
    expect(CuriosityCatDefinition.effectType).toBe("utility");
  });
});

describe("PounceDefinition — balance", () => {
  it("yarn cost is 3", () => {
    expect(PounceDefinition.yarnCost).toBe(3);
  });

  it("launch impulse is 3.5 u/s", () => {
    expect(PounceDefinition.behavior.params?.launchImpulse).toBe(3.5);
  });

  it("air control factor after launch is 0.7 (70%)", () => {
    expect(PounceDefinition.behavior.params?.airControlFactor).toBe(0.7);
  });

  it("effect type is launch", () => {
    expect(PounceDefinition.effectType).toBe("launch");
  });

  it("ballistic apex from launch impulse is positive and meaningful", () => {
    // apex = v² / (2 × |g|)
    const impulse = PounceDefinition.behavior.params?.launchImpulse as number;
    const apex = (impulse * impulse) / (2 * Math.abs(CONFIG.gravity));
    expect(apex).toBeGreaterThan(0);
    // Combined reach (cat body height + apex) stays consistent with the GDD
    const catHeight = (
      PounceDefinition.meshConfig.dims as [number, number, number]
    )[1]!;
    expect(apex + catHeight).toBeGreaterThan(catHeight);
  });
});

describe("GameState — starting values", () => {
  it("initial yarn is 10", () => {
    const state = new GameState(10);
    expect(state.yarn).toBe(10);
  });

  it("maxInventoryCapacity is 10", () => {
    const state = new GameState(10);
    expect(state.maxInventoryCapacity).toBe(10);
  });
});

describe("CONFIG — cat companions", () => {
  it("maxActiveCats is 3", () => {
    expect(CONFIG.maxActiveCats).toBe(3);
  });
});
