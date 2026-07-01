import { describe, it, expect } from "vitest";
import { CameraController } from "../../engine/CameraController";
import type { SceneManager } from "../../engine/SceneManager";
import type { World } from "../../ecs/World";

/**
 * Structural view of the orthographic frustum we assert on. Declared locally so
 * this test doesn't import "three" — the project restricts that import to the
 * rendering modules, and we only ever read these four numbers here.
 */
interface OrthoFrustum {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Minimal stand-ins for the collaborators CameraController touches during
 * construction and resize. SceneManager and World are type-only imports in the
 * controller, so duck-typed stubs are sufficient — and OrthographicCamera is
 * pure math, so it runs in the node test environment without a WebGL context.
 */
function makeCanvas(width: number, height: number) {
  return {
    clientWidth: width,
    clientHeight: height,
    // Wheel listener registration is a no-op for these tests.
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLCanvasElement;
}

function makeSceneManager() {
  let resizeHook: ((w: number, h: number) => void) | null = null;
  const scene = {
    camera: null as OrthoFrustum | null,
    setResizeHook(hook: ((w: number, h: number) => void) | null) {
      resizeHook = hook;
    },
    fireResize(w: number, h: number) {
      resizeHook?.(w, h);
    },
    hasResizeHook() {
      return resizeHook !== null;
    },
  };
  return scene;
}

const emptyWorld = {} as unknown as World;

describe("CameraController orthographic frustum", () => {
  it("bakes the initial canvas aspect ratio into the frustum", () => {
    const scene = makeSceneManager();
    new CameraController(
      makeCanvas(800, 600),
      scene as unknown as SceneManager,
      emptyWorld,
    );

    const cam = scene.camera as OrthoFrustum;
    // zoom defaults to 10; aspect = 800/600 = 4/3.
    expect(cam.right).toBeCloseTo((10 * 800) / 600);
    expect(cam.left).toBeCloseTo((-10 * 800) / 600);
    expect(cam.top).toBeCloseTo(10);
    expect(cam.bottom).toBeCloseTo(-10);
  });

  it("recomputes the frustum for the new aspect ratio when the resize hook fires", () => {
    const scene = makeSceneManager();
    const canvas = makeCanvas(800, 600);
    new CameraController(
      canvas,
      scene as unknown as SceneManager,
      emptyWorld,
    );

    // Widen the canvas to a 2.667:1 aspect and fire the resize signal, mirroring
    // what SceneManager.resize() does via its ResizeObserver.
    (canvas as unknown as { clientWidth: number }).clientWidth = 1600;
    scene.fireResize(1600, 600);

    const cam = scene.camera as OrthoFrustum;
    // Horizontal extent must track the wider aspect; vertical extent is fixed by zoom.
    expect(cam.right).toBeCloseTo((10 * 1600) / 600);
    expect(cam.left).toBeCloseTo((-10 * 1600) / 600);
    expect(cam.top).toBeCloseTo(10);
    expect(cam.bottom).toBeCloseTo(-10);
  });

  it("clears the resize hook on dispose to avoid a dangling reference", () => {
    const scene = makeSceneManager();
    const controller = new CameraController(
      makeCanvas(800, 600),
      scene as unknown as SceneManager,
      emptyWorld,
    );

    expect(scene.hasResizeHook()).toBe(true);
    controller.dispose();
    expect(scene.hasResizeHook()).toBe(false);
  });
});
