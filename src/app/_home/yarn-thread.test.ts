import { describe, it, expect } from "vitest";

import {
  catmullRomPath,
  scrollDrawFraction,
  dashOffset,
  verticalGradientStops,
} from "./yarn-thread";

describe("catmullRomPath", () => {
  it("returns empty string for no points", () => {
    expect(catmullRomPath([])).toBe("");
  });

  it("starts with a moveto on the first point", () => {
    const d = catmullRomPath([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(d.startsWith("M 10 20")).toBe(true);
    expect(d).toContain("C");
  });

  it("emits one cubic segment per gap between points", () => {
    const d = catmullRomPath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
      { x: 30, y: 10 },
    ]);
    expect(d.match(/C/g)).toHaveLength(3);
  });
});

describe("scrollDrawFraction", () => {
  it("is at least the base fraction at the very top", () => {
    expect(scrollDrawFraction(0, 4000, 1000, { base: 0.06 })).toBeCloseTo(0.06, 5);
  });

  it("clamps to 1 once scrolled to the bottom (lead pushes past)", () => {
    expect(scrollDrawFraction(3000, 4000, 1000, { lead: 1.15 })).toBe(1);
  });

  it("leads the reader — drawn fraction exceeds raw scroll progress", () => {
    const scrollY = 1500;
    const raw = scrollY / (4000 - 1000);
    expect(scrollDrawFraction(scrollY, 4000, 1000)).toBeGreaterThan(raw);
  });

  it("never divides by zero when content fits the viewport", () => {
    expect(scrollDrawFraction(0, 800, 1000)).toBeGreaterThanOrEqual(0);
    expect(scrollDrawFraction(0, 800, 1000)).toBeLessThanOrEqual(1);
  });
});

describe("dashOffset", () => {
  it("is full length when nothing is drawn", () => {
    expect(dashOffset(500, 0)).toBe(500);
  });
  it("is zero when fully drawn", () => {
    expect(dashOffset(500, 1)).toBe(0);
  });
  it("clamps out-of-range fractions", () => {
    expect(dashOffset(500, 1.4)).toBe(0);
    expect(dashOffset(500, -0.2)).toBe(500);
  });
});

describe("verticalGradientStops", () => {
  it("bookends the run with ember and sorts middle stops by position", () => {
    const stops = verticalGradientStops(
      [
        { y: 900, color: "#pounce" },
        { y: 300, color: "#loaf" },
      ],
      1000,
      "#ember",
    );
    expect(stops[0]).toEqual({ offset: 0, color: "#ember" });
    expect(stops[stops.length - 1]).toEqual({ offset: 1, color: "#ember" });
    // middle stops ascending by offset
    expect(stops[1]!.color).toBe("#loaf");
    expect(stops[2]!.color).toBe("#pounce");
  });

  it("degrades to a single ember stop with no height", () => {
    expect(verticalGradientStops([], 0, "#ember")).toEqual([
      { offset: 0, color: "#ember" },
    ]);
  });
});
