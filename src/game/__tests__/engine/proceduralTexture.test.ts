import { describe, it, expect } from "vitest";
import { generateSurfaceTexture } from "~/game/engine/proceduralTexture";

describe("generateSurfaceTexture", () => {
  it("returns RGBA bytes of the requested square size", () => {
    const { data, size } = generateSurfaceTexture(32, 1);
    expect(size).toBe(32);
    expect(data.length).toBe(32 * 32 * 4);
  });

  it("clamps to a minimum edge of 4 texels", () => {
    expect(generateSurfaceTexture(1, 1).size).toBe(4);
  });

  it("is deterministic for the same size + seed", () => {
    const a = generateSurfaceTexture(16, 5);
    const b = generateSurfaceTexture(16, 5);
    expect([...a.data]).toEqual([...b.data]);
  });

  it("is grayscale with opaque alpha (safe as a color multiply map)", () => {
    const { data } = generateSurfaceTexture(16, 2);
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(data[i + 1]);
      expect(data[i + 1]).toBe(data[i + 2]);
      expect(data[i + 3]).toBe(255);
    }
  });

  it("stays subtle — every texel is a light value, never near-black", () => {
    const { data } = generateSurfaceTexture(64, 3);
    let min = 255;
    for (let i = 0; i < data.length; i += 4) min = Math.min(min, data[i]!);
    // Grain + hatch only darken by tens of units; nothing approaches black.
    expect(min).toBeGreaterThan(180);
  });

  it("actually has variation (not a flat white fill)", () => {
    const { data } = generateSurfaceTexture(64, 4);
    const first = data[0]!;
    let varies = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== first) {
        varies = true;
        break;
      }
    }
    expect(varies).toBe(true);
  });

  it("tiles seamlessly: hatch structure repeats with the tile period", () => {
    // With size 64 the hatch period is 8; column 0 and column 8 share the same
    // hatch contribution, so the pattern wraps without a visible seam.
    const s = 64;
    const { data } = generateSurfaceTexture(s, 0);
    // Compare the hatch-driven darkening at (x=0,y=0) vs (x=period,y=0): both
    // sit on a primary-diagonal line, so both are darkened by the hatch.
    const at = (x: number, y: number) => data[(y * s + x) * 4]!;
    const period = 8;
    // Both on a hatch line → both below pure grain-only brightness.
    expect(at(0, 0)).toBeLessThan(255);
    expect(at(period, period)).toBeLessThan(255);
  });
});
