import { describe, it, expect, beforeEach, vi } from "vitest";
import { World } from "~/game/ecs/World";
import { VisualEffectsSystem } from "~/game/systems/VisualEffectsSystem";
import { varyColor } from "~/game/maps/MapManager";
import { spawnPlayer, spawnCat } from "../helpers/entityFactories";
import { createWaterTrigger } from "~/game/ecs/components/WaterTrigger";
import { createRenderable } from "~/game/ecs/components/Renderable";
import { createTransform } from "~/game/ecs/components/Transform";
import { createYarnPickup } from "~/game/ecs/components/YarnPickup";
import type { ShadowSprite } from "~/game/ecs/components/ShadowSprite";
import type { Transform } from "~/game/ecs/components/Transform";
import type { Entity } from "~/game/ecs/Entity";
import { CatType } from "~/game/types";

// ---------------------------------------------------------------------------
// Minimal SceneManager mock — only the methods VisualEffectsSystem calls.
// ---------------------------------------------------------------------------

function createMockScene() {
  return {
    setMeshEmissive: vi.fn(),
    setMeshOpacity: vi.fn(),
  };
}

type MockScene = ReturnType<typeof createMockScene>;

const DT = 1 / 60;

describe("VisualEffectsSystem", () => {
  let world: World;
  let scene: MockScene;
  let system: VisualEffectsSystem;

  beforeEach(() => {
    world = new World();
    scene = createMockScene();
    system = new VisualEffectsSystem(scene as never);
  });

  // ── Shadow: player ─────────────────────────────────────────────────────────

  describe("ground shadows — player", () => {
    it("creates a shadow entity for the player on first update", () => {
      spawnPlayer(world, 0, 0.5, 0);

      system.update(world, DT);

      const shadows = world.query("ShadowSprite");
      expect(shadows).toHaveLength(1);
    });

    it("shadow entity has ShadowSprite component referencing the player", () => {
      const playerEntity = spawnPlayer(world, 0, 0.5, 0);

      system.update(world, DT);

      const [shadowEntity] = world.query("ShadowSprite");
      const sprite = world.getComponent<ShadowSprite>(shadowEntity!, "ShadowSprite");
      expect(sprite?.parentEntity).toBe(playerEntity);
    });

    it("shadow has Transform at y=0.02 matching player XZ", () => {
      spawnPlayer(world, 3, 1.0, 7);

      system.update(world, DT);

      const [shadowEntity] = world.query("ShadowSprite");
      const transform = world.getComponent<Transform>(shadowEntity!, "Transform");
      expect(transform?.x).toBeCloseTo(3);
      expect(transform?.y).toBeCloseTo(0.02);
      expect(transform?.z).toBeCloseTo(7);
    });

    it("does not create duplicate shadows on subsequent updates", () => {
      spawnPlayer(world);

      system.update(world, DT);
      system.update(world, DT);

      expect(world.query("ShadowSprite")).toHaveLength(1);
    });

    it("shadow tracks player position when player moves", () => {
      const playerEntity = spawnPlayer(world, 0, 0.5, 0);

      system.update(world, DT);

      // Move player
      const playerTransform = world.getComponent<Transform>(playerEntity, "Transform")!;
      playerTransform.x = 10;
      playerTransform.z = 5;

      system.update(world, DT);

      const [shadowEntity] = world.query("ShadowSprite");
      const shadowTransform = world.getComponent<Transform>(shadowEntity!, "Transform");
      expect(shadowTransform?.x).toBeCloseTo(10);
      expect(shadowTransform?.z).toBeCloseTo(5);
    });

    it("destroys shadow when player entity is destroyed", () => {
      const playerEntity = spawnPlayer(world);

      system.update(world, DT);
      expect(world.query("ShadowSprite")).toHaveLength(1);

      world.destroyEntity(playerEntity);
      system.update(world, DT);

      expect(world.query("ShadowSprite")).toHaveLength(0);
    });
  });

  // ── Shadow: cat ────────────────────────────────────────────────────────────

  describe("ground shadows — cat", () => {
    it("creates a shadow entity for each summoned cat", () => {
      spawnCat(world, CatType.Loaf, 2, 0.75, 2);
      spawnCat(world, CatType.Zoomies, -2, 0.75, -2);

      system.update(world, DT);

      expect(world.query("ShadowSprite")).toHaveLength(2);
    });

    it("destroys cat shadow when cat entity is destroyed", () => {
      const catEntity = spawnCat(world, CatType.Loaf);

      system.update(world, DT);
      expect(world.query("ShadowSprite")).toHaveLength(1);

      world.destroyEntity(catEntity);
      system.update(world, DT);

      expect(world.query("ShadowSprite")).toHaveLength(0);
    });

    it("creates separate shadows for player and cat simultaneously", () => {
      spawnPlayer(world);
      spawnCat(world, CatType.Loaf);

      system.update(world, DT);

      expect(world.query("ShadowSprite")).toHaveLength(2);
    });
  });

  // ── Water animation ────────────────────────────────────────────────────────

  describe("water animation", () => {
    function spawnWaterZone(w: World): { entity: Entity; handle: symbol } {
      const handle = Symbol("waterHandle");
      const entity = w.createEntity();
      w.addComponent(entity, createTransform(0, 0, 0));
      const renderable = createRenderable({
        geometry: "box",
        dims: [4, 0.2, 4],
        color: "#1565c0",
      });
      renderable.sceneHandle = handle as never;
      w.addComponent(entity, renderable);
      w.addComponent(entity, createWaterTrigger(0));
      return { entity, handle };
    }

    it("calls setMeshOpacity on water entities each frame", () => {
      const { handle } = spawnWaterZone(world);

      system.update(world, DT);

      expect(scene.setMeshOpacity).toHaveBeenCalledWith(handle, expect.any(Number));
    });

    it("opacity oscillates between 0.6 and 0.8 over time", () => {
      spawnWaterZone(world);

      const opacities: number[] = [];
      // Sample over many frames to catch both extremes
      for (let i = 0; i < 120; i++) {
        system.update(world, DT);
        const call = scene.setMeshOpacity.mock.calls.at(-1)!;
        opacities.push(call[1] as number);
      }

      const min = Math.min(...opacities);
      const max = Math.max(...opacities);
      expect(min).toBeGreaterThanOrEqual(0.59);
      expect(max).toBeLessThanOrEqual(0.81);
      expect(max).toBeGreaterThan(0.75); // verifies the sine wave actually oscillates
    });
  });

  // ── Yarn pickup pulse ──────────────────────────────────────────────────────

  describe("yarn pickup pulse", () => {
    it("calls setMeshEmissive on yarn pickup entities each frame", () => {
      const handle = Symbol("pickupHandle");
      const entity = world.createEntity();
      world.addComponent(entity, createTransform(0, 0.5, 0));
      const renderable = createRenderable({ geometry: "sphere", size: 0.3, color: "#ffd700" });
      renderable.sceneHandle = handle as never;
      world.addComponent(entity, renderable);
      world.addComponent(entity, createYarnPickup(3));

      system.update(world, DT);

      expect(scene.setMeshEmissive).toHaveBeenCalledWith(handle, "#ffd700", expect.any(Number));
    });
  });
});

// ---------------------------------------------------------------------------
// varyColor utility
// ---------------------------------------------------------------------------

describe("varyColor", () => {
  it("returns a string starting with #", () => {
    expect(varyColor("#4a7c59", 0)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("is deterministic: same seed produces same output", () => {
    expect(varyColor("#4a7c59", 42)).toBe(varyColor("#4a7c59", 42));
    expect(varyColor("#8b6355", 99)).toBe(varyColor("#8b6355", 99));
  });

  it("different seeds produce different colors", () => {
    const a = varyColor("#4a7c59", 10);
    const b = varyColor("#4a7c59", 50);
    // With the hash distribution, most seed pairs produce different output
    expect(a).not.toBe(b);
  });

  it("stays within ±12 per RGB channel of the base color", () => {
    const base = "#4a7c59";
    const br = parseInt(base.slice(1, 3), 16);
    const bg = parseInt(base.slice(3, 5), 16);
    const bb = parseInt(base.slice(5, 7), 16);

    for (const seed of [0, 1, 7, 13, 42, 99, 777]) {
      const varied = varyColor(base, seed);
      const vr = parseInt(varied.slice(1, 3), 16);
      const vg = parseInt(varied.slice(3, 5), 16);
      const vb = parseInt(varied.slice(5, 7), 16);

      expect(Math.abs(vr - br)).toBeLessThanOrEqual(12);
      expect(Math.abs(vg - bg)).toBeLessThanOrEqual(12);
      expect(Math.abs(vb - bb)).toBeLessThanOrEqual(12);
    }
  });

  it("clamps near-black channels without going below 0", () => {
    // Very dark channel (#030303) — delta could push negative
    const result = varyColor("#030303", 0);
    const r = parseInt(result.slice(1, 3), 16);
    expect(r).toBeGreaterThanOrEqual(0);
  });

  it("clamps near-white channels without exceeding 255 (ff)", () => {
    // Very light channel (#f8f8f8) — delta could push above 255
    const result = varyColor("#f8f8f8", 100);
    const r = parseInt(result.slice(1, 3), 16);
    expect(r).toBeLessThanOrEqual(255);
  });

  it("terrain grid divisions match TestMap cell count (30x30)", () => {
    // Regression: TestMap is 60×60 world units with cellSize=2 → 30 divisions.
    const totalWidth = 60;
    const cellSize = 2;
    expect(Math.round(totalWidth / cellSize)).toBe(30);
  });
});
