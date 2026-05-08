import { describe, it, expect } from "vitest";
import { CONFIG } from "~/game/config";
import { GameState } from "~/game/engine/GameState";

// US-307 — Movement Balance Pass
// Regression tests: assert the exact GDD-tuned values so accidental config
// drift is caught immediately. Never change these expectations without also
// updating a code comment in config.ts explaining the new value.

describe("CONFIG — movement balance", () => {
  it("walkSpeed is 4.5 u/s", () => {
    expect(CONFIG.walkSpeed).toBe(4.5);
  });

  it("acceleration is 0.3 s", () => {
    expect(CONFIG.acceleration).toBe(0.3);
  });

  it("deceleration is 0.2 s", () => {
    expect(CONFIG.deceleration).toBe(0.2);
  });

  it("airControlFactor is 0.7 (70%)", () => {
    expect(CONFIG.airControlFactor).toBe(0.7);
  });
});

describe("CONFIG — jump balance", () => {
  it("jumpApex is 1.2 u", () => {
    expect(CONFIG.jumpApex).toBe(1.2);
  });

  it("gravity is -12 u/s²", () => {
    expect(CONFIG.gravity).toBe(-12);
  });

  it("jumpImpulse === sqrt(2 * |gravity| * jumpApex) ≈ 5.367", () => {
    const expected = Math.sqrt(2 * Math.abs(CONFIG.gravity) * CONFIG.jumpApex);
    expect(CONFIG.jumpImpulse).toBeCloseTo(expected, 5);
    // Sanity-check the numeric value so the formula itself cannot silently shift
    expect(CONFIG.jumpImpulse).toBeCloseTo(5.3666, 3);
  });

  it("coyoteFrames is 5", () => {
    expect(CONFIG.coyoteFrames).toBe(5);
  });

  it("jumpBufferFrames is 5", () => {
    expect(CONFIG.jumpBufferFrames).toBe(5);
  });
});

describe("CONFIG — swimming balance", () => {
  it("swimSpeedSurface is 3.2 u/s", () => {
    expect(CONFIG.swimSpeedSurface).toBe(3.2);
  });

  it("swimSpeedDive is 2.0 u/s", () => {
    expect(CONFIG.swimSpeedDive).toBe(2.0);
  });

  it("swimSpeedAscend is 2.5 u/s", () => {
    expect(CONFIG.swimSpeedAscend).toBe(2.5);
  });
});

describe("CONFIG — cat companions", () => {
  it("maxActiveCats is 3", () => {
    expect(CONFIG.maxActiveCats).toBe(3);
  });
});

describe("GameState — starting values", () => {
  it("initial yarn is 10", () => {
    const state = new GameState(10);
    expect(state.yarn).toBe(10);
  });
});
