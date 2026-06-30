import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { InputManager } from "~/game/engine/InputManager";
import { EventBus } from "~/game/engine/EventBus";
import type { SceneManager } from "~/game/engine/SceneManager";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const STUB_SCENE_MANAGER = {
  screenToWorld: vi.fn(() => null),
} as unknown as SceneManager;

// ---------------------------------------------------------------------------
// Mock canvas & document
// ---------------------------------------------------------------------------

type AnyHandler = (e?: unknown) => void;

function makeCanvasMock() {
  const listeners = new Map<string, AnyHandler>();
  const addEventListener = vi.fn((type: string, handler: AnyHandler) => {
    listeners.set(type, handler);
  });
  const removeEventListener = vi.fn();
  return {
    tabIndex: 0 as number,
    addEventListener,
    removeEventListener,
    getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })),
    _listeners: listeners,
    /** Fire a synthetic event on this canvas mock. */
    fire(type: string, event: Record<string, unknown> = {}) {
      listeners.get(type)?.(event);
    },
  };
}

function makeDocMock() {
  const listeners = new Map<string, AnyHandler>();
  const docMock = {
    hidden: false as boolean,
    addEventListener: vi.fn((type: string, handler: AnyHandler) => {
      listeners.set(type, handler);
    }),
    removeEventListener: vi.fn(),
    _listeners: listeners,
    fire(type: string) {
      listeners.get(type)?.();
    },
  };
  return docMock;
}

/** Mock keydown event with required properties. */
function kd(code: string, ctrlKey = false): Record<string, unknown> {
  return { code, ctrlKey, preventDefault: vi.fn() };
}

// ---------------------------------------------------------------------------
// US-310c: Rapid input — idempotent state transitions
// ---------------------------------------------------------------------------

describe("US-310c: Rapid input — idempotent state transitions", () => {
  let canvas: ReturnType<typeof makeCanvasMock>;
  let docMock: ReturnType<typeof makeDocMock>;
  let manager: InputManager;

  beforeEach(() => {
    canvas = makeCanvasMock();
    docMock = makeDocMock();
    vi.stubGlobal("document", docMock);
    manager = new InputManager(
      canvas as unknown as HTMLCanvasElement,
      STUB_SCENE_MANAGER,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("duplicate keydown for the same key does not throw", () => {
    expect(() => {
      for (let i = 0; i < 20; i++) {
        canvas.fire("keydown", kd("Space"));
      }
    }).not.toThrow();
  });

  it("held keys are deduplicated — movement intent stays normalised", () => {
    canvas.fire("keydown", kd("KeyW"));
    canvas.fire("keydown", kd("KeyW"));
    canvas.fire("keydown", kd("KeyW"));
    const intent = manager.getMovementIntent();
    // W alone = -Z direction, magnitude exactly 1 (normalised)
    expect(intent.z).toBe(-1);
    expect(intent.x).toBe(0);
  });

  it("multiple left clicks in one frame keep the flag true (not a counter)", () => {
    expect(() => {
      canvas.fire("mousedown", { button: 0 });
      canvas.fire("mousedown", { button: 0 });
      canvas.fire("mousedown", { button: 0 });
    }).not.toThrow();
    expect(manager.wasLeftClickThisFrame()).toBe(true);
    manager.poll();
    expect(manager.wasLeftClickThisFrame()).toBe(false);
  });

  it("simultaneous multi-key rapid input does not throw", () => {
    const codes = [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "Space",
      "KeyE",
      "ShiftLeft",
    ];
    expect(() => {
      for (let round = 0; round < 10; round++) {
        for (const code of codes) {
          canvas.fire("keydown", kd(code));
        }
      }
    }).not.toThrow();
  });

  it("poll() clears single-frame click flags after rapid input", () => {
    canvas.fire("mousedown", { button: 0 });
    canvas.fire("mousedown", { button: 2 });
    expect(manager.wasLeftClickThisFrame()).toBe(true);
    expect(manager.wasRightClickThisFrame()).toBe(true);

    manager.poll();

    expect(manager.wasLeftClickThisFrame()).toBe(false);
    expect(manager.wasRightClickThisFrame()).toBe(false);
  });

  it("held keys persist across frames — poll() does not clear them", () => {
    canvas.fire("keydown", kd("KeyW"));
    manager.poll();
    // Held state must survive the end-of-frame poll
    expect(manager.getMovementIntent().z).toBe(-1);
  });

  it("keyup after rapid keydowns correctly clears the key", () => {
    canvas.fire("keydown", kd("KeyW"));
    canvas.fire("keydown", kd("KeyW")); // duplicate — should not double-add
    canvas.fire("keyup", { code: "KeyW" });
    // After keyup, W is no longer held
    expect(manager.getMovementIntent().z).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// US-310c: Tab unfocus — blur clears input state
// ---------------------------------------------------------------------------

describe("US-310c: Tab unfocus — blur clears input state", () => {
  let canvas: ReturnType<typeof makeCanvasMock>;
  let docMock: ReturnType<typeof makeDocMock>;
  let manager: InputManager;

  beforeEach(() => {
    canvas = makeCanvasMock();
    docMock = makeDocMock();
    vi.stubGlobal("document", docMock);
    manager = new InputManager(
      canvas as unknown as HTMLCanvasElement,
      STUB_SCENE_MANAGER,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blur event clears held movement keys", () => {
    canvas.fire("keydown", kd("KeyW"));
    canvas.fire("keydown", kd("KeyD"));
    // Verify keys are held before blur
    const before = manager.getMovementIntent();
    expect(before.z).not.toBe(0);

    canvas.fire("blur");

    const after = manager.getMovementIntent();
    expect(after.x).toBe(0);
    expect(after.z).toBe(0);
  });

  it("blur event clears left and right click flags", () => {
    canvas.fire("mousedown", { button: 0 });
    canvas.fire("mousedown", { button: 2 });
    expect(manager.wasLeftClickThisFrame()).toBe(true);
    expect(manager.wasRightClickThisFrame()).toBe(true);

    canvas.fire("blur");

    expect(manager.wasLeftClickThisFrame()).toBe(false);
    expect(manager.wasRightClickThisFrame()).toBe(false);
  });

  it("visibilitychange to hidden clears held keys", () => {
    canvas.fire("keydown", kd("KeyW"));
    expect(manager.getMovementIntent().z).toBe(-1);

    Object.defineProperty(docMock, "hidden", {
      get: () => true,
      configurable: true,
    });
    docMock.fire("visibilitychange");

    expect(manager.getMovementIntent().z).toBe(0);
    expect(manager.getMovementIntent().x).toBe(0);
  });

  it("visibilitychange to visible does NOT clear held keys", () => {
    canvas.fire("keydown", kd("KeyW"));

    Object.defineProperty(docMock, "hidden", {
      get: () => false,
      configurable: true,
    });
    docMock.fire("visibilitychange");

    // Tab came back into focus — keys should still be held
    expect(manager.getMovementIntent().z).toBe(-1);
  });

  it("visibilitychange to hidden clears click flags", () => {
    canvas.fire("mousedown", { button: 0 });
    expect(manager.wasLeftClickThisFrame()).toBe(true);

    Object.defineProperty(docMock, "hidden", {
      get: () => true,
      configurable: true,
    });
    docMock.fire("visibilitychange");

    expect(manager.wasLeftClickThisFrame()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// US-310c: InputManager.dispose() — removes all event listeners
// ---------------------------------------------------------------------------

describe("US-310c: InputManager.dispose() — removes all listeners", () => {
  let canvas: ReturnType<typeof makeCanvasMock>;
  let docMock: ReturnType<typeof makeDocMock>;
  let manager: InputManager;

  beforeEach(() => {
    canvas = makeCanvasMock();
    docMock = makeDocMock();
    vi.stubGlobal("document", docMock);
    manager = new InputManager(
      canvas as unknown as HTMLCanvasElement,
      STUB_SCENE_MANAGER,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispose removes all 6 canvas listeners (keydown, keyup, mousemove, mousedown, contextmenu, blur)", () => {
    manager.dispose();
    const removed = (
      canvas.removeEventListener as ReturnType<typeof vi.fn>
    ).mock.calls.map((c: unknown[]) => c[0] as string);

    expect(removed).toContain("keydown");
    expect(removed).toContain("keyup");
    expect(removed).toContain("mousemove");
    expect(removed).toContain("mousedown");
    expect(removed).toContain("contextmenu");
    expect(removed).toContain("blur");
    expect(removed).toHaveLength(6);
  });

  it("dispose removes visibilitychange from document", () => {
    manager.dispose();
    const docRemoved = (
      docMock.removeEventListener as ReturnType<typeof vi.fn>
    ).mock.calls.map((c: unknown[]) => c[0] as string);

    expect(docRemoved).toContain("visibilitychange");
  });

  it("dispose does not throw when called multiple times", () => {
    expect(() => {
      manager.dispose();
      manager.dispose();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// US-310c: Game destroy — EventBus listener cleanup pattern
// ---------------------------------------------------------------------------

describe("US-310c: Game destroy — EventBus unsub + clear cleanup", () => {
  it("unsub function from on() stops handler from firing", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on("save:failed", handler);

    bus.emit({ type: "save:failed", error: "before unsub" });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub(); // simulates Game.destroy() calling stored unsubs
    bus.emit({ type: "save:failed", error: "after unsub" });
    expect(handler).toHaveBeenCalledTimes(1); // not called again
  });

  it("calling all stored unsubs then clear() does not throw", () => {
    const bus = new EventBus();
    const saveFailed = vi.fn();
    const playerDeath = vi.fn();
    const unsub1 = bus.on("save:failed", saveFailed);
    const unsub2 = bus.on(
      "player:death",
      playerDeath as Parameters<typeof bus.on<"player:death">>[1],
    );

    expect(() => {
      unsub1();
      unsub2();
      bus.clear(); // Game.destroy() calls this after unsubs
    }).not.toThrow();

    bus.emit({ type: "save:failed", error: "post-destroy" });
    expect(saveFailed).not.toHaveBeenCalled();
  });

  it("calling unsub multiple times is idempotent (no throw)", () => {
    const bus = new EventBus();
    const unsub = bus.on("save:failed", vi.fn());
    expect(() => {
      unsub();
      unsub();
      unsub();
    }).not.toThrow();
  });
});
