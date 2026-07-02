import { describe, it, expect } from "vitest";
import {
  buildGradientRamp,
  darkenForOutline,
  jitterPositions,
} from "~/game/engine/toonStyle";

describe("buildGradientRamp", () => {
  it("returns `bands` ascending steps", () => {
    const { data, width } = buildGradientRamp(3);
    expect(width).toBe(3);
    expect(data.length).toBe(3);
    // Strictly ascending → distinct cel bands.
    expect(data[0]!).toBeLessThan(data[1]!);
    expect(data[1]!).toBeLessThan(data[2]!);
  });

  it("keeps the darkest band above pure black and tops out at 255", () => {
    const { data } = buildGradientRamp(4);
    expect(data[0]!).toBeGreaterThan(0);
    expect(data[data.length - 1]!).toBe(255);
  });

  it("clamps to a minimum of 2 bands", () => {
    expect(buildGradientRamp(1).width).toBe(2);
    expect(buildGradientRamp(0).width).toBe(2);
  });
});

describe("darkenForOutline", () => {
  it("scales every channel toward black by the factor", () => {
    // 0xffffff * 0.15 → round(255*0.15)=38 = 0x26 per channel.
    expect(darkenForOutline(0xffffff, 0.15)).toBe(0x262626);
  });

  it("preserves hue proportions (a red fill yields a dark red ink)", () => {
    const ink = darkenForOutline(0xff0000, 0.15);
    expect((ink >> 16) & 0xff).toBeGreaterThan(0); // red channel present
    expect((ink >> 8) & 0xff).toBe(0); // green stays 0
    expect(ink & 0xff).toBe(0); // blue stays 0
  });

  it("never brightens a channel", () => {
    const hex = 0x8040c0;
    const ink = darkenForOutline(hex, 0.15);
    expect((ink >> 16) & 0xff).toBeLessThanOrEqual((hex >> 16) & 0xff);
    expect((ink >> 8) & 0xff).toBeLessThanOrEqual((hex >> 8) & 0xff);
    expect(ink & 0xff).toBeLessThanOrEqual(hex & 0xff);
  });
});

describe("jitterPositions", () => {
  it("is deterministic for the same seed", () => {
    const a = jitterPositions(new Float32Array([1, 2, 3, -4, 5, -6]), 0.05, 7);
    const b = jitterPositions(new Float32Array([1, 2, 3, -4, 5, -6]), 0.05, 7);
    expect([...a]).toEqual([...b]);
  });

  it("welds coincident vertices — identical positions get identical offsets", () => {
    // Two vertices at the same coordinate (a shared box corner).
    const out = jitterPositions(
      new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
      0.05,
      3,
    );
    expect(out[0]!).toBe(out[3]!);
    expect(out[1]!).toBe(out[4]!);
    expect(out[2]!).toBe(out[5]!);
  });

  it("bounds each component's displacement by the amplitude", () => {
    const input = new Float32Array([1, 2, 3, 10, -20, 30]);
    const original = [...input];
    const out = jitterPositions(input, 0.05, 11);
    for (let i = 0; i < out.length; i++) {
      expect(Math.abs(out[i]! - original[i]!)).toBeLessThanOrEqual(0.05);
    }
  });

  it("preserves array length and is a no-op at amplitude 0", () => {
    const input = new Float32Array([1, 2, 3, 4, 5, 6]);
    const out = jitterPositions(input, 0, 1);
    expect(out.length).toBe(6);
    expect([...out]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
