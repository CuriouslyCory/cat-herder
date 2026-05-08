import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MapEditor } from "~/game/maps/MapEditor";
import type { EditorBlock, EditorWaterZone } from "~/game/maps/MapEditor";
import type { CameraController } from "~/game/engine/CameraController";
import type { MapData } from "~/game/maps/MapData";
import { TerrainType } from "~/game/types";

// ---------------------------------------------------------------------------
// Minimal DOM stubs
// ---------------------------------------------------------------------------

interface MockEl {
  style: Record<string, string>;
  textContent: string;
  parentElement: MockEl | null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  appendChild: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  getBoundingClientRect: ReturnType<typeof vi.fn>;
  // value property for input/select elements (set dynamically)
  value?: string;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
}

function makeMockEl(): MockEl {
  return {
    style: {} as Record<string, string>,
    textContent: "",
    parentElement: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    appendChild: vi.fn(),
    remove: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })),
  };
}

// ---------------------------------------------------------------------------
// SceneManager mock — tracks addMesh/removeMesh/updateTransform/screenToWorld
// ---------------------------------------------------------------------------

interface MockSceneMgr {
  addMesh: ReturnType<typeof vi.fn>;
  removeMesh: ReturnType<typeof vi.fn>;
  updateTransform: ReturnType<typeof vi.fn>;
  screenToWorld: ReturnType<typeof vi.fn>;
  setMeshEmissive: ReturnType<typeof vi.fn>;
  setMeshColor: ReturnType<typeof vi.fn>;
  handles: symbol[];
}

function makeMockSceneManager(
  worldResult: { x: number; y: number; z: number } | null = null,
): MockSceneMgr {
  const handles: symbol[] = [];
  return {
    handles,
    addMesh: vi.fn(() => {
      const h = Symbol("handle");
      handles.push(h);
      return h;
    }),
    removeMesh: vi.fn(),
    updateTransform: vi.fn(),
    screenToWorld: vi.fn(() => worldResult),
    setMeshEmissive: vi.fn(),
    setMeshColor: vi.fn(),
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

// createdElements[0] = banner, createdElements[1] = panel, rest = internals
let createdElements: MockEl[];

let container: MockEl;
let mockCamera: ReturnType<typeof makeMockCamera>;
let lifecycle: ReturnType<typeof makeGameLifecycle>;
let editor: MapEditor;
let mockBody: { appendChild: ReturnType<typeof vi.fn> };

function getBanner(): MockEl {
  return createdElements[0]!;
}

function getPanel(): MockEl {
  return createdElements[1]!;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  createdElements = [];

  mockBody = { appendChild: vi.fn() };

  vi.stubGlobal("document", {
    createElement: vi.fn((): MockEl => {
      const el = makeMockEl();
      createdElements.push(el);
      return el;
    }),
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
    null, // no SceneManager for baseline tests
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

  it("getSelectedTool() returns null initially", () => {
    expect(editor.getSelectedTool()).toBeNull();
  });

  it("getEditorBlocks() returns empty array initially", () => {
    expect(editor.getEditorBlocks()).toHaveLength(0);
  });

  it("getSelectedBlock() returns null initially", () => {
    expect(editor.getSelectedBlock()).toBeNull();
  });

  it("getEditorWaterZones() returns empty array initially", () => {
    expect(editor.getEditorWaterZones()).toHaveLength(0);
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
    expect(getBanner().style.display).toBe("block");
  });

  it("shows the tool panel", () => {
    editor.enable();
    expect(getPanel().style.display).toBe("flex");
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
    expect(getBanner().style.display).toBe("none");
  });

  it("hides the tool panel", () => {
    editor.enable();
    editor.disable();
    expect(getPanel().style.display).toBe("none");
  });

  it("is a no-op when already inactive", () => {
    editor.disable(); // never enabled
    expect(lifecycle.resume).not.toHaveBeenCalled();
    expect(mockCamera.setMode).not.toHaveBeenCalled();
  });

  it("deselects the selected block on disable()", () => {
    editor.enable();
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(3, 3);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    expect(editor.getSelectedBlock()).toBe(block);
    editor.disable();
    expect(editor.getSelectedBlock()).toBeNull();
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
    expect(editor.getMapData().name).toBe("test-map");
  });

  it("getMapData() round-trips correctly after loadMapData()", () => {
    const data = makeSampleMapData();
    editor.loadMapData(data);
    const loaded = editor.getMapData();
    editor.loadMapData(loaded);
    expect(editor.getMapData().name).toBe("test-map");
  });

  it("getMapData() returns default map before any loadMapData call", () => {
    const data = editor.getMapData();
    expect(data.cellSize).toBe(2);
    expect(data.spawnPoints).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tool selection
// ---------------------------------------------------------------------------

describe("tool selection", () => {
  it("selectTool() sets the selected tool", () => {
    editor.selectTool(TerrainType.Grass);
    expect(editor.getSelectedTool()).toBe(TerrainType.Grass);
  });

  it("selectTool() can switch between tools", () => {
    editor.selectTool(TerrainType.Grass);
    editor.selectTool(TerrainType.Stone);
    expect(editor.getSelectedTool()).toBe(TerrainType.Stone);
  });

  it("selectTool(null) deselects the tool", () => {
    editor.selectTool(TerrainType.Dirt);
    editor.selectTool(null);
    expect(editor.getSelectedTool()).toBeNull();
  });

  it("all four placeable types are valid selections", () => {
    for (const type of [TerrainType.Grass, TerrainType.Dirt, TerrainType.Stone, TerrainType.Water]) {
      editor.selectTool(type);
      expect(editor.getSelectedTool()).toBe(type);
    }
  });
});

// ---------------------------------------------------------------------------
// Grid snapping
// ---------------------------------------------------------------------------

describe("MapEditor.snapToGrid()", () => {
  it("rounds integers unchanged", () => {
    expect(MapEditor.snapToGrid(3)).toBe(3);
    expect(MapEditor.snapToGrid(-5)).toBe(-5);
    expect(MapEditor.snapToGrid(0)).toBe(0);
  });

  it("rounds 0.5 to 1 (Math.round behaviour)", () => {
    expect(MapEditor.snapToGrid(0.5)).toBe(1);
    expect(MapEditor.snapToGrid(1.5)).toBe(2);
  });

  it("rounds values below 0.5 down", () => {
    expect(MapEditor.snapToGrid(1.4)).toBe(1);
    expect(MapEditor.snapToGrid(2.3)).toBe(2);
  });

  it("rounds values above 0.5 up", () => {
    expect(MapEditor.snapToGrid(1.6)).toBe(2);
    expect(MapEditor.snapToGrid(-2.6)).toBe(-3);
  });

  it("snaps fractional world positions to integer grid", () => {
    // Simulates mouse at world position 3.7 → grid cell 4
    expect(MapEditor.snapToGrid(3.7)).toBe(4);
    // World position -1.3 → grid cell -1
    expect(MapEditor.snapToGrid(-1.3)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Block placement
// ---------------------------------------------------------------------------

describe("placeBlock()", () => {
  it("does nothing when no tool is selected", () => {
    editor.placeBlock(5, 3);
    expect(editor.getEditorBlocks()).toHaveLength(0);
  });

  it("places a block at grid-snapped position", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(3.4, 7.7);
    const blocks = editor.getEditorBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.x).toBe(3);
    expect(blocks[0]!.z).toBe(8);
  });

  it("placed block has correct terrain type", () => {
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    expect(editor.getEditorBlocks()[0]!.type).toBe(TerrainType.Stone);
  });

  it("placed block has default height of 1", () => {
    editor.selectTool(TerrainType.Dirt);
    editor.placeBlock(1, 1);
    expect(editor.getEditorBlocks()[0]!.height).toBe(1);
  });

  it("placing multiple blocks at different positions creates multiple entries", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(0, 0);
    editor.placeBlock(2, 0);
    editor.placeBlock(0, 2);
    expect(editor.getEditorBlocks()).toHaveLength(3);
  });

  it("placing a block at an occupied position updates its type instead of adding", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(5, 5);
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(5, 5);
    const blocks = editor.getEditorBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe(TerrainType.Stone);
  });

  it("grid-snapping means nearby clicks register as the same cell", () => {
    editor.selectTool(TerrainType.Dirt);
    editor.placeBlock(4.4, 4.4); // snaps to (4, 4)
    editor.placeBlock(4.6, 4.6); // also snaps to (5, 5) — different cell
    expect(editor.getEditorBlocks()).toHaveLength(2);
  });

  it("positions that snap to the same cell are deduplicated", () => {
    editor.selectTool(TerrainType.Water);
    editor.placeBlock(3.1, 3.1); // snaps to (3, 3)
    editor.placeBlock(3.4, 3.4); // also snaps to (3, 3)
    expect(editor.getEditorBlocks()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Placement with SceneManager — block mesh creation
// ---------------------------------------------------------------------------

describe("placeBlock() with SceneManager", () => {
  let sceneMgr: MockSceneMgr;
  let sceneEditor: MapEditor;
  let sceneContainer: MockEl;

  beforeEach(() => {
    sceneMgr = makeMockSceneManager({ x: 5, y: 0, z: 3 });
    sceneContainer = makeMockEl();
    sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
  });

  afterEach(() => {
    sceneEditor.dispose();
  });

  it("calls addMesh when placing a block", () => {
    sceneEditor.selectTool(TerrainType.Grass);
    sceneEditor.placeBlock(5, 3);
    expect(sceneMgr.addMesh).toHaveBeenCalledOnce();
  });

  it("addMesh receives correct geometry and opacity for solid block", () => {
    sceneEditor.selectTool(TerrainType.Dirt);
    sceneEditor.placeBlock(0, 0);
    const call = sceneMgr.addMesh.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.geometry).toBe("box");
    expect(call.opacity).toBeUndefined(); // solid block — no custom opacity
  });

  it("block handle is stored on EditorBlock", () => {
    sceneEditor.selectTool(TerrainType.Grass);
    sceneEditor.placeBlock(2, 4);
    const block = sceneEditor.getEditorBlocks()[0]!;
    expect(block.handle).not.toBeNull();
    expect(typeof block.handle).toBe("symbol");
  });

  it("updateTransform is called with snapped world position", () => {
    sceneEditor.selectTool(TerrainType.Stone);
    sceneEditor.placeBlock(2.7, 4.3); // snaps to (3, 4)
    expect(sceneMgr.updateTransform).toHaveBeenCalledOnce();
    const [, pos] = sceneMgr.updateTransform.mock.calls[0] as [
      symbol,
      { x: number; y: number; z: number },
      unknown,
      unknown,
    ];
    expect(pos.x).toBe(3);
    expect(pos.z).toBe(4);
    expect(pos.y).toBe(0.5); // height/2 = 0.5 for default height 1
  });
});

// ---------------------------------------------------------------------------
// Ghost preview with SceneManager
// ---------------------------------------------------------------------------

describe("ghost preview", () => {
  let sceneMgr: MockSceneMgr;
  let sceneEditor: MapEditor;
  let sceneContainer: MockEl;

  beforeEach(() => {
    sceneMgr = makeMockSceneManager({ x: 2, y: 0, z: 2 });
    sceneContainer = makeMockEl();
    sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
  });

  afterEach(() => {
    sceneEditor.dispose();
  });

  function getMouseMoveHandler(): ((e: MouseEvent) => void) | undefined {
    return (sceneContainer.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "mousemove",
    )?.[1] as ((e: MouseEvent) => void) | undefined;
  }

  it("disable() removes the ghost mesh when ghost was created", () => {
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Grass);
    const handler = getMouseMoveHandler();
    expect(handler).toBeDefined();
    handler!({ clientX: 100, clientY: 100 } as MouseEvent);
    sceneEditor.disable();
    expect(sceneMgr.removeMesh).toHaveBeenCalled();
  });

  it("ghost mesh is created with opacity 0.4", () => {
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Grass);
    const handler = getMouseMoveHandler();
    expect(handler).toBeDefined();
    handler!({ clientX: 50, clientY: 50 } as MouseEvent);
    expect(sceneMgr.addMesh).toHaveBeenCalledOnce();
    const call = sceneMgr.addMesh.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.opacity).toBe(0.4);
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

  it("getSelectedTool() returns null in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const prodEditor = new MapEditor(
      container as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
    );
    expect(prodEditor.getSelectedTool()).toBeNull();
    prodEditor.dispose();
  });

  it("getEditorBlocks() returns empty array in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const prodEditor = new MapEditor(
      container as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
    );
    expect(prodEditor.getEditorBlocks()).toHaveLength(0);
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
    expect(getBanner().remove).toHaveBeenCalled();
  });

  it("removes panel element on dispose", () => {
    editor.dispose();
    expect(getPanel().remove).toHaveBeenCalled();
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

  it("removes mousemove, click, mousedown and mouseup listeners on dispose", () => {
    editor.dispose();
    const calls = (container.removeEventListener as ReturnType<typeof vi.fn>).mock.calls as [string, unknown][];
    const events = calls.map((c) => c[0]);
    expect(events).toContain("mousemove");
    expect(events).toContain("click");
    expect(events).toContain("mousedown");
    expect(events).toContain("mouseup");
  });
});

// ---------------------------------------------------------------------------
// Type safety: EditorBlock interface
// ---------------------------------------------------------------------------

describe("EditorBlock type", () => {
  it("getEditorBlocks() returns the correct shape", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(1, 2);
    const block: EditorBlock = editor.getEditorBlocks()[0]!;
    expect(typeof block.x).toBe("number");
    expect(typeof block.z).toBe("number");
    expect(typeof block.height).toBe("number");
    expect(block.type).toBe(TerrainType.Grass);
    expect(block.handle).toBeNull(); // no SceneManager
  });
});

// ---------------------------------------------------------------------------
// US-302b: Block selection
// ---------------------------------------------------------------------------

describe("selectBlock()", () => {
  it("selectBlock() sets the selected block", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(3, 3);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    expect(editor.getSelectedBlock()).toBe(block);
  });

  it("selectBlock(null) deselects", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(3, 3);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.selectBlock(null);
    expect(editor.getSelectedBlock()).toBeNull();
  });

  it("selecting a different block deselects the previous one", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(1, 1);
    editor.placeBlock(2, 2);
    const [blockA, blockB] = editor.getEditorBlocks() as [EditorBlock, EditorBlock];
    editor.selectBlock(blockA);
    editor.selectBlock(blockB);
    expect(editor.getSelectedBlock()).toBe(blockB);
  });

  it("selectBlock() is safe when block has no handle (no SceneManager)", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(5, 5);
    const block = editor.getEditorBlocks()[0]!;
    expect(block.handle).toBeNull();
    expect(() => editor.selectBlock(block)).not.toThrow();
    expect(editor.getSelectedBlock()).toBe(block);
  });

  it("calls setMeshEmissive on block handle when SceneManager is present", () => {
    const sceneMgr = makeMockSceneManager({ x: 3, y: 0, z: 3 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectTool(TerrainType.Grass);
    sceneEditor.placeBlock(3, 3);
    const block = sceneEditor.getEditorBlocks()[0]!;
    sceneEditor.selectBlock(block);
    expect(sceneMgr.setMeshEmissive).toHaveBeenCalledWith(
      block.handle,
      expect.any(String),
      expect.any(Number),
    );
    sceneEditor.dispose();
  });

  it("calls setMeshEmissive to remove highlight on previously selected block", () => {
    const sceneMgr = makeMockSceneManager({ x: 1, y: 0, z: 1 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectTool(TerrainType.Grass);
    sceneEditor.placeBlock(1, 1);
    sceneEditor.placeBlock(2, 2);
    const [blockA, blockB] = sceneEditor.getEditorBlocks() as [EditorBlock, EditorBlock];
    sceneEditor.selectBlock(blockA);
    sceneMgr.setMeshEmissive.mockClear();
    sceneEditor.selectBlock(blockB);
    // First call removes highlight from blockA, second applies to blockB
    expect(sceneMgr.setMeshEmissive).toHaveBeenCalledTimes(2);
    const firstCall = sceneMgr.setMeshEmissive.mock.calls[0] as [symbol, string, number];
    expect(firstCall[0]).toBe(blockA.handle);
    expect(firstCall[2]).toBe(0); // intensity 0 = remove highlight
    sceneEditor.dispose();
  });
});

// ---------------------------------------------------------------------------
// US-302b: Property editing
// ---------------------------------------------------------------------------

describe("updateSelectedBlockType()", () => {
  it("updates the type of the selected block", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(5, 5);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.updateSelectedBlockType(TerrainType.Stone);
    expect(block.type).toBe(TerrainType.Stone);
  });

  it("does nothing when no block is selected", () => {
    expect(() => editor.updateSelectedBlockType(TerrainType.Grass)).not.toThrow();
  });

  it("calls setMeshColor when SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 5, y: 0, z: 5 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectTool(TerrainType.Grass);
    sceneEditor.placeBlock(5, 5);
    const block = sceneEditor.getEditorBlocks()[0]!;
    sceneEditor.selectBlock(block);
    sceneMgr.setMeshColor.mockClear();
    sceneEditor.updateSelectedBlockType(TerrainType.Dirt);
    expect(sceneMgr.setMeshColor).toHaveBeenCalledWith(block.handle, expect.any(String));
    sceneEditor.dispose();
  });
});

describe("updateSelectedBlockHeight()", () => {
  it("updates the height of the selected block", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(5, 5);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.updateSelectedBlockHeight(2.5);
    expect(block.height).toBe(2.5);
  });

  it("clamps height to minimum (0.5)", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(5, 5);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.updateSelectedBlockHeight(0);
    expect(block.height).toBe(0.5);
  });

  it("clamps height to maximum (5)", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(5, 5);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.updateSelectedBlockHeight(10);
    expect(block.height).toBe(5);
  });

  it("does nothing when no block is selected", () => {
    expect(() => editor.updateSelectedBlockHeight(2)).not.toThrow();
  });

  it("calls updateTransform with scaled Y when SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 3, y: 0, z: 3 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectTool(TerrainType.Stone);
    sceneEditor.placeBlock(3, 3);
    const block = sceneEditor.getEditorBlocks()[0]!;
    sceneEditor.selectBlock(block);
    sceneMgr.updateTransform.mockClear();
    sceneEditor.updateSelectedBlockHeight(3);
    expect(sceneMgr.updateTransform).toHaveBeenCalledOnce();
    const [, pos, , scale] = sceneMgr.updateTransform.mock.calls[0] as [
      symbol,
      { x: number; y: number; z: number },
      unknown,
      { x: number; y: number; z: number },
    ];
    expect(pos.y).toBe(1.5); // height/2 = 3/2
    expect(scale.y).toBe(3); // scale.y = height
    sceneEditor.dispose();
  });
});

// ---------------------------------------------------------------------------
// US-302b: Delete selected block
// ---------------------------------------------------------------------------

describe("deleteSelectedBlock()", () => {
  it("removes the selected block from editor blocks", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(1, 1);
    editor.placeBlock(2, 2);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.deleteSelectedBlock();
    expect(editor.getEditorBlocks()).toHaveLength(1);
    expect(editor.getEditorBlocks()[0]!.x).toBe(2);
  });

  it("deselects after deletion", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(1, 1);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.deleteSelectedBlock();
    expect(editor.getSelectedBlock()).toBeNull();
  });

  it("does nothing when no block is selected", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(1, 1);
    expect(() => editor.deleteSelectedBlock()).not.toThrow();
    expect(editor.getEditorBlocks()).toHaveLength(1);
  });

  it("calls removeMesh when block has a handle and SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 1, y: 0, z: 1 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectTool(TerrainType.Grass);
    sceneEditor.placeBlock(1, 1);
    const block = sceneEditor.getEditorBlocks()[0]!;
    sceneEditor.selectBlock(block);
    sceneMgr.removeMesh.mockClear();
    sceneEditor.deleteSelectedBlock();
    expect(sceneMgr.removeMesh).toHaveBeenCalledWith(block.handle);
    sceneEditor.dispose();
  });

  it("Delete key invokes deleteSelectedBlock when editor is active", () => {
    const docMock = vi.mocked(document);
    const keydownHandler = (
      docMock.addEventListener as ReturnType<typeof vi.fn>
    ).mock.calls.find((c: unknown[]) => c[0] === "keydown")?.[1] as
      | ((e: KeyboardEvent) => void)
      | undefined;
    expect(keydownHandler).toBeDefined();

    editor.enable();
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(5, 5);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);

    keydownHandler!({ key: "Delete", ctrlKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);

    expect(editor.getEditorBlocks()).toHaveLength(0);
    expect(editor.getSelectedBlock()).toBeNull();
  });

  it("Delete key is no-op when editor is inactive", () => {
    const docMock = vi.mocked(document);
    const keydownHandler = (
      docMock.addEventListener as ReturnType<typeof vi.fn>
    ).mock.calls.find((c: unknown[]) => c[0] === "keydown")?.[1] as
      | ((e: KeyboardEvent) => void)
      | undefined;

    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(5, 5);
    // editor is NOT enabled

    keydownHandler!({ key: "Delete", ctrlKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);

    expect(editor.getEditorBlocks()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// US-302b: Water zone creation
// ---------------------------------------------------------------------------

describe("createWaterZone()", () => {
  it("creates a zone and appends to getEditorWaterZones()", () => {
    editor.createWaterZone(0, 0, 3, 3);
    expect(editor.getEditorWaterZones()).toHaveLength(1);
  });

  it("normalises coordinates so x1 <= x2 and z1 <= z2", () => {
    editor.createWaterZone(5, 7, 2, 3); // x1 > x2, z1 > z2
    const zone: EditorWaterZone = editor.getEditorWaterZones()[0]!;
    expect(zone.x1).toBe(2);
    expect(zone.x2).toBe(5);
    expect(zone.z1).toBe(3);
    expect(zone.z2).toBe(7);
  });

  it("already-ordered coordinates are stored as-is", () => {
    editor.createWaterZone(1, 2, 6, 8);
    const zone = editor.getEditorWaterZones()[0]!;
    expect(zone.x1).toBe(1);
    expect(zone.z1).toBe(2);
    expect(zone.x2).toBe(6);
    expect(zone.z2).toBe(8);
  });

  it("default depth is 1", () => {
    editor.createWaterZone(0, 0, 3, 3);
    expect(editor.getEditorWaterZones()[0]!.depth).toBe(1);
  });

  it("can create multiple zones", () => {
    editor.createWaterZone(0, 0, 3, 3);
    editor.createWaterZone(5, 5, 8, 8);
    expect(editor.getEditorWaterZones()).toHaveLength(2);
  });

  it("same start/end point produces a degenerate 1×1 zone", () => {
    editor.createWaterZone(4, 4, 4, 4);
    const zone = editor.getEditorWaterZones()[0]!;
    expect(zone.x1).toBe(4);
    expect(zone.x2).toBe(4);
    expect(zone.z1).toBe(4);
    expect(zone.z2).toBe(4);
  });

  it("handle is null when no SceneManager", () => {
    editor.createWaterZone(0, 0, 2, 2);
    expect(editor.getEditorWaterZones()[0]!.handle).toBeNull();
  });

  it("creates a mesh via SceneManager when present", () => {
    const sceneMgr = makeMockSceneManager({ x: 1, y: 0, z: 1 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.createWaterZone(0, 0, 4, 4);
    const zone = sceneEditor.getEditorWaterZones()[0]!;
    expect(zone.handle).not.toBeNull();
    expect(sceneMgr.addMesh).toHaveBeenCalled();
    sceneEditor.dispose();
  });
});

// ---------------------------------------------------------------------------
// US-302b: Water zone drag via mousedown/mouseup
// ---------------------------------------------------------------------------

describe("water zone drag (mousedown/mouseup)", () => {
  let sceneMgr: MockSceneMgr;
  let sceneEditor: MapEditor;
  let sceneContainer: MockEl;

  beforeEach(() => {
    sceneMgr = makeMockSceneManager({ x: 2, y: 0, z: 2 });
    sceneContainer = makeMockEl();
    sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
  });

  afterEach(() => {
    sceneEditor.dispose();
  });

  function getHandler(event: string): ((e: MouseEvent) => void) | undefined {
    return (sceneContainer.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === event,
    )?.[1] as ((e: MouseEvent) => void) | undefined;
  }

  it("mousedown and mouseup handlers are registered", () => {
    expect(getHandler("mousedown")).toBeDefined();
    expect(getHandler("mouseup")).toBeDefined();
  });

  it("drag across multiple cells creates a water zone", () => {
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Water);

    // Simulate drag: mousedown at (2,2), mouseup at different position
    sceneMgr.screenToWorld
      .mockReturnValueOnce({ x: 2, y: 0, z: 2 }) // mousedown
      .mockReturnValueOnce({ x: 5, y: 0, z: 6 }); // mouseup

    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);
    getHandler("mouseup")!({ clientX: 100, clientY: 100 } as MouseEvent);

    expect(sceneEditor.getEditorWaterZones()).toHaveLength(1);
    const zone = sceneEditor.getEditorWaterZones()[0]!;
    expect(zone.x1).toBe(2);
    expect(zone.z1).toBe(2);
    expect(zone.x2).toBe(5);
    expect(zone.z2).toBe(6);
  });

  it("same-position mousedown/mouseup does NOT create a zone", () => {
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Water);

    sceneMgr.screenToWorld
      .mockReturnValueOnce({ x: 3, y: 0, z: 3 }) // mousedown
      .mockReturnValueOnce({ x: 3, y: 0, z: 3 }); // mouseup at same position

    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);
    getHandler("mouseup")!({ clientX: 0, clientY: 0 } as MouseEvent);

    expect(sceneEditor.getEditorWaterZones()).toHaveLength(0);
  });

  it("mousedown with non-Water tool does not start a drag", () => {
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Grass); // not Water

    sceneMgr.screenToWorld.mockReturnValue({ x: 3, y: 0, z: 3 });

    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);
    getHandler("mouseup")!({ clientX: 100, clientY: 100 } as MouseEvent);

    // No zone should be created since drag only activates for Water tool
    expect(sceneEditor.getEditorWaterZones()).toHaveLength(0);
  });
});
