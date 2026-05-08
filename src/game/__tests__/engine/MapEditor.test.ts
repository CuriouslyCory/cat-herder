import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MapEditor } from "~/game/maps/MapEditor";
import type { CameraController } from "~/game/engine/CameraController";
import type { MapData } from "~/game/maps/MapData";
import { TerrainType } from "~/game/types";

// ---------------------------------------------------------------------------
// Minimal DOM stubs — test env has no document/window
// ---------------------------------------------------------------------------

interface MockEl {
  style: Record<string, string>;
  textContent: string;
  parentElement: MockEl | null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  appendChild: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function makeMockEl(): MockEl {
  return {
    style: { cssText: "", display: "" },
    textContent: "",
    parentElement: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    appendChild: vi.fn(),
    remove: vi.fn(),
  };
}

function makeMockBody() {
  return {
    style: { cssText: "", display: "" } as Record<string, string>,
    textContent: "",
    appendChild: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMockCamera(): { setMode: ReturnType<typeof vi.fn> } {
  return { setMode: vi.fn() };
}

function makeGameLifecycle() {
  return { pause: vi.fn(), resume: vi.fn() };
}

function makeSampleMapData(): MapData {
  return {
    name: "test-map",
    size: { width: 10, depth: 10 },
    terrain: [[{ type: TerrainType.Grass, height: 1, navigable: true }]],
    cellSize: 1,
    spawnPoints: [{ x: 0, z: 0, role: "player" }],
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let container: ReturnType<typeof makeMockEl>;
let mockCamera: ReturnType<typeof makeMockCamera>;
let lifecycle: ReturnType<typeof makeGameLifecycle>;
let editor: MapEditor;
let mockBody: ReturnType<typeof makeMockBody>;
let mockCreatedEl: ReturnType<typeof makeMockEl>;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");

  mockCreatedEl = makeMockEl();
  mockBody = makeMockBody();

  vi.stubGlobal("document", {
    createElement: vi.fn(() => mockCreatedEl),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    body: mockBody,
  });

  container = makeMockEl();
  mockCamera = makeMockCamera();
  lifecycle = makeGameLifecycle();

  editor = new MapEditor(
    container as unknown as HTMLElement,
    mockCamera as unknown as CameraController,
    lifecycle,
  );
});

afterEach(() => {
  editor.dispose();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("initial state", () => {
  it("isActive() returns false initially", () => {
    expect(editor.isActive()).toBe(false);
  });

  it("getMapData() returns default map when no data loaded", () => {
    const data = editor.getMapData();
    expect(data.name).toBe("untitled");
    expect(data.terrain).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// enable()
// ---------------------------------------------------------------------------

describe("enable()", () => {
  it("sets isActive() to true", () => {
    editor.enable();
    expect(editor.isActive()).toBe(true);
  });

  it("calls gameLifecycle.pause()", () => {
    editor.enable();
    expect(lifecycle.pause).toHaveBeenCalledOnce();
  });

  it("calls cameraController.setMode('free')", () => {
    editor.enable();
    expect(mockCamera.setMode).toHaveBeenCalledWith("free");
  });

  it("shows the EDITOR MODE banner", () => {
    editor.enable();
    expect(mockCreatedEl.style.display).toBe("block");
  });

  it("is idempotent — double enable does not double-pause", () => {
    editor.enable();
    editor.enable();
    expect(lifecycle.pause).toHaveBeenCalledOnce();
    expect(editor.isActive()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// disable()
// ---------------------------------------------------------------------------

describe("disable()", () => {
  it("sets isActive() to false after enable()+disable()", () => {
    editor.enable();
    editor.disable();
    expect(editor.isActive()).toBe(false);
  });

  it("calls cameraController.setMode('follow')", () => {
    editor.enable();
    editor.disable();
    expect(mockCamera.setMode).toHaveBeenCalledWith("follow");
  });

  it("calls gameLifecycle.resume()", () => {
    editor.enable();
    editor.disable();
    expect(lifecycle.resume).toHaveBeenCalledOnce();
  });

  it("hides the EDITOR MODE banner", () => {
    editor.enable();
    editor.disable();
    expect(mockCreatedEl.style.display).toBe("none");
  });

  it("is a no-op when already inactive", () => {
    editor.disable(); // never enabled
    expect(lifecycle.resume).not.toHaveBeenCalled();
    expect(mockCamera.setMode).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// toggle via Ctrl+E
// ---------------------------------------------------------------------------

describe("Ctrl+E keyboard toggle", () => {
  it("registers a keydown listener on document in dev mode", () => {
    const docMock = vi.mocked(document);
    expect(docMock.addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("enable → disable cycle restores inactive state", () => {
    editor.enable();
    expect(editor.isActive()).toBe(true);
    editor.disable();
    expect(editor.isActive()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getMapData() / loadMapData()
// ---------------------------------------------------------------------------

describe("getMapData() / loadMapData()", () => {
  it("loadMapData() stores the data and getMapData() returns it", () => {
    const data = makeSampleMapData();
    editor.loadMapData(data);
    const result = editor.getMapData();
    expect(result.name).toBe("test-map");
    expect(result.size).toEqual({ width: 10, depth: 10 });
    expect(result.spawnPoints).toHaveLength(1);
  });

  it("loadMapData() performs a shallow copy — original terrain rows independent", () => {
    const data = makeSampleMapData();
    editor.loadMapData(data);
    data.name = "mutated";
    // Stored copy should not be affected
    expect(editor.getMapData().name).toBe("test-map");
  });

  it("getMapData() round-trips correctly after loadMapData()", () => {
    const data = makeSampleMapData();
    editor.loadMapData(data);
    const loaded = editor.getMapData();
    editor.loadMapData(loaded); // load the loaded data back
    expect(editor.getMapData().name).toBe("test-map");
  });

  it("getMapData() returns default map before any loadMapData call", () => {
    const data = editor.getMapData();
    expect(data.cellSize).toBe(2);
    expect(data.spawnPoints).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Production mode — constructor no-ops
// ---------------------------------------------------------------------------

describe("production mode no-op", () => {
  it("isActive() stays false in production and enable() does nothing", () => {
    vi.stubEnv("NODE_ENV", "production");
    const prodEditor = new MapEditor(
      container as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
    );
    prodEditor.enable();
    expect(prodEditor.isActive()).toBe(false);
    expect(lifecycle.pause).not.toHaveBeenCalled();
    expect(mockCamera.setMode).not.toHaveBeenCalled();
    prodEditor.dispose();
  });

  it("does not register keyboard listener in production", () => {
    const docMock = vi.mocked(document);
    const callsBefore = docMock.addEventListener.mock.calls.length;
    vi.stubEnv("NODE_ENV", "production");
    const prodEditor = new MapEditor(
      container as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
    );
    expect(docMock.addEventListener.mock.calls.length).toBe(callsBefore);
    prodEditor.dispose();
  });
});

// ---------------------------------------------------------------------------
// dispose()
// ---------------------------------------------------------------------------

describe("dispose()", () => {
  it("removes keydown event listener on dispose", () => {
    const docMock = vi.mocked(document);
    editor.dispose();
    expect(docMock.removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("removes banner element on dispose", () => {
    editor.dispose();
    expect(mockCreatedEl.remove).toHaveBeenCalled();
  });

  it("isActive() returns false after dispose", () => {
    editor.enable();
    editor.dispose();
    expect(editor.isActive()).toBe(false);
  });

  it("safe to call dispose() multiple times", () => {
    editor.dispose();
    expect(() => editor.dispose()).not.toThrow();
  });
});
