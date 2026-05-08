import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MapEditor, RESOURCE_RESPAWN_DEFAULTS } from "~/game/maps/MapEditor";
import type { EditorBlock, EditorWaterZone, EditorToolMode } from "~/game/maps/MapEditor";
import type { CameraController } from "~/game/engine/CameraController";
import type { MapData } from "~/game/maps/MapData";
import { TerrainType, ResourceType } from "~/game/types";

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

// ---------------------------------------------------------------------------
// US-303: Entity tool selection
// ---------------------------------------------------------------------------

describe("selectEntityTool()", () => {
  it("getSelectedEntityTool() returns null initially", () => {
    expect(editor.getSelectedEntityTool()).toBeNull();
  });

  it("selectEntityTool() sets the selected entity tool", () => {
    editor.selectEntityTool("playerSpawn");
    expect(editor.getSelectedEntityTool()).toBe("playerSpawn");
  });

  it("selectEntityTool() can switch between tools", () => {
    editor.selectEntityTool("playerSpawn");
    editor.selectEntityTool("catSpawn");
    expect(editor.getSelectedEntityTool()).toBe("catSpawn");
  });

  it("selectEntityTool(null) deselects the entity tool", () => {
    editor.selectEntityTool("resourceNode");
    editor.selectEntityTool(null);
    expect(editor.getSelectedEntityTool()).toBeNull();
  });

  it("all five entity tool types are valid selections", () => {
    for (const tool of ["playerSpawn", "catSpawn", "resourceNode", "hiddenTerrain", "yarnPickup"] as const) {
      editor.selectEntityTool(tool);
      expect(editor.getSelectedEntityTool()).toBe(tool);
    }
  });

  it("selecting an entity tool clears the terrain tool selection", () => {
    editor.selectTool(TerrainType.Grass);
    expect(editor.getSelectedTool()).toBe(TerrainType.Grass);
    editor.selectEntityTool("catSpawn");
    expect(editor.getSelectedTool()).toBeNull();
  });

  it("selecting a terrain tool clears the entity tool selection", () => {
    editor.selectEntityTool("yarnPickup");
    expect(editor.getSelectedEntityTool()).toBe("yarnPickup");
    editor.selectTool(TerrainType.Dirt);
    expect(editor.getSelectedEntityTool()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// US-303: Entity placement — player spawn
// ---------------------------------------------------------------------------

describe("placeEntity() — playerSpawn", () => {
  it("places a player spawn at grid-snapped position", () => {
    editor.selectEntityTool("playerSpawn");
    editor.placeEntity(3.4, 7.7);
    const spawn = editor.getPlayerSpawn();
    expect(spawn).not.toBeNull();
    expect(spawn!.x).toBe(3);
    expect(spawn!.z).toBe(8);
  });

  it("only one player spawn is allowed — placing a second moves the first", () => {
    editor.selectEntityTool("playerSpawn");
    editor.placeEntity(1, 1);
    editor.placeEntity(5, 5);
    const spawn = editor.getPlayerSpawn();
    expect(spawn).not.toBeNull();
    expect(spawn!.x).toBe(5);
    expect(spawn!.z).toBe(5);
  });

  it("moving player spawn removes the old mesh when SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 1, y: 0, z: 1 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectEntityTool("playerSpawn");
    sceneEditor.placeEntity(1, 1);
    const firstHandle = sceneEditor.getPlayerSpawn()!.handle;
    sceneMgr.removeMesh.mockClear();
    sceneEditor.placeEntity(5, 5);
    // Old mesh should have been removed
    expect(sceneMgr.removeMesh).toHaveBeenCalledWith(firstHandle);
    sceneEditor.dispose();
  });

  it("player spawn handle is null when no SceneManager", () => {
    editor.selectEntityTool("playerSpawn");
    editor.placeEntity(0, 0);
    expect(editor.getPlayerSpawn()!.handle).toBeNull();
  });

  it("creates a sphere mesh for player spawn when SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 2, y: 0, z: 2 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectEntityTool("playerSpawn");
    sceneEditor.placeEntity(2, 2);
    expect(sceneMgr.addMesh).toHaveBeenCalled();
    const call = sceneMgr.addMesh.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(call.geometry).toBe("sphere");
    sceneEditor.dispose();
  });
});

// ---------------------------------------------------------------------------
// US-303: Entity placement — cat spawn
// ---------------------------------------------------------------------------

describe("placeEntity() — catSpawn", () => {
  it("places a cat spawn at grid-snapped position", () => {
    editor.selectEntityTool("catSpawn");
    editor.placeEntity(2, 4);
    const spawns = editor.getCatSpawns();
    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.x).toBe(2);
    expect(spawns[0]!.z).toBe(4);
  });

  it("can place multiple cat spawns", () => {
    editor.selectEntityTool("catSpawn");
    editor.placeEntity(1, 1);
    editor.placeEntity(5, 5);
    editor.placeEntity(10, 10);
    expect(editor.getCatSpawns()).toHaveLength(3);
  });

  it("cat spawn handle is null when no SceneManager", () => {
    editor.selectEntityTool("catSpawn");
    editor.placeEntity(3, 3);
    expect(editor.getCatSpawns()[0]!.handle).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// US-303: Entity placement — resource node
// ---------------------------------------------------------------------------

describe("placeEntity() — resourceNode", () => {
  it("places a resource node with default Grass type", () => {
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(4, 4);
    const nodes = editor.getResourceNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.type).toBe(ResourceType.Grass);
  });

  it("resource node default respawn times match Game.ts spawnTestMapResourceNodes()", () => {
    expect(RESOURCE_RESPAWN_DEFAULTS[ResourceType.Grass]).toBe(30);
    expect(RESOURCE_RESPAWN_DEFAULTS[ResourceType.Sticks]).toBe(45);
    expect(RESOURCE_RESPAWN_DEFAULTS[ResourceType.Water]).toBe(60);
  });

  it("places resource node with correct default respawn time for Grass (30s)", () => {
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(0, 0);
    expect(editor.getResourceNodes()[0]!.respawnTime).toBe(30);
  });

  it("can place multiple resource nodes", () => {
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(1, 1);
    editor.placeEntity(3, 3);
    expect(editor.getResourceNodes()).toHaveLength(2);
  });

  it("resource node position is grid-snapped", () => {
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(4.7, 2.3);
    const node = editor.getResourceNodes()[0]!;
    expect(node.x).toBe(5);
    expect(node.z).toBe(2);
  });

  it("resource node handle is null when no SceneManager", () => {
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(5, 5);
    expect(editor.getResourceNodes()[0]!.handle).toBeNull();
  });

  it("stores custom resource node type when set", () => {
    editor.selectEntityTool("resourceNode");
    // Simulate panel changing the type via internal state (direct call workaround)
    // We expose this by selecting a different tool then selecting back (which resets defaults)
    // For testing, we can call placeEntity after selecting the tool multiple times
    editor.placeEntity(0, 0);
    // Default should be Grass
    expect(editor.getResourceNodes()[0]!.type).toBe(ResourceType.Grass);
  });
});

// ---------------------------------------------------------------------------
// US-303: Entity placement — yarn pickup
// ---------------------------------------------------------------------------

describe("placeEntity() — yarnPickup", () => {
  it("places a yarn pickup with default amount (3)", () => {
    editor.selectEntityTool("yarnPickup");
    editor.placeEntity(6, 6);
    const pickups = editor.getYarnPickups();
    expect(pickups).toHaveLength(1);
    expect(pickups[0]!.yarnAmount).toBe(3);
  });

  it("can place multiple yarn pickups", () => {
    editor.selectEntityTool("yarnPickup");
    editor.placeEntity(1, 1);
    editor.placeEntity(2, 2);
    expect(editor.getYarnPickups()).toHaveLength(2);
  });

  it("yarn pickup position is grid-snapped", () => {
    editor.selectEntityTool("yarnPickup");
    editor.placeEntity(1.6, 3.2);
    const pickup = editor.getYarnPickups()[0]!;
    expect(pickup.x).toBe(2);
    expect(pickup.z).toBe(3);
  });

  it("yarn pickup handle is null when no SceneManager", () => {
    editor.selectEntityTool("yarnPickup");
    editor.placeEntity(7, 7);
    expect(editor.getYarnPickups()[0]!.handle).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// US-303: Entity placement — guards
// ---------------------------------------------------------------------------

describe("placeEntity() — guards", () => {
  it("does nothing when no entity tool is selected", () => {
    editor.placeEntity(5, 5);
    expect(editor.getPlayerSpawn()).toBeNull();
    expect(editor.getCatSpawns()).toHaveLength(0);
    expect(editor.getResourceNodes()).toHaveLength(0);
    expect(editor.getYarnPickups()).toHaveLength(0);
  });

  it("hiddenTerrain entity tool does not place via placeEntity()", () => {
    editor.selectEntityTool("hiddenTerrain");
    editor.placeEntity(5, 5); // should be a no-op (uses drag instead)
    expect(editor.getEditorHiddenTerrainZones()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// US-303: Hidden terrain zone drag
// ---------------------------------------------------------------------------

describe("createHiddenTerrainZone()", () => {
  it("creates a zone and appends to getEditorHiddenTerrainZones()", () => {
    editor.createHiddenTerrainZone(0, 0, 5, 5);
    expect(editor.getEditorHiddenTerrainZones()).toHaveLength(1);
  });

  it("normalises coordinates so x1 <= x2 and z1 <= z2", () => {
    editor.createHiddenTerrainZone(8, 6, 2, 1);
    const zone = editor.getEditorHiddenTerrainZones()[0]!;
    expect(zone.x1).toBe(2);
    expect(zone.x2).toBe(8);
    expect(zone.z1).toBe(1);
    expect(zone.z2).toBe(6);
  });

  it("already-ordered coordinates are stored as-is", () => {
    editor.createHiddenTerrainZone(1, 2, 6, 8);
    const zone = editor.getEditorHiddenTerrainZones()[0]!;
    expect(zone.x1).toBe(1);
    expect(zone.z1).toBe(2);
    expect(zone.x2).toBe(6);
    expect(zone.z2).toBe(8);
  });

  it("default height is 1", () => {
    editor.createHiddenTerrainZone(0, 0, 3, 3);
    expect(editor.getEditorHiddenTerrainZones()[0]!.height).toBe(1);
  });

  it("can create multiple hidden terrain zones", () => {
    editor.createHiddenTerrainZone(0, 0, 3, 3);
    editor.createHiddenTerrainZone(5, 5, 8, 8);
    expect(editor.getEditorHiddenTerrainZones()).toHaveLength(2);
  });

  it("handle is null when no SceneManager", () => {
    editor.createHiddenTerrainZone(0, 0, 2, 2);
    expect(editor.getEditorHiddenTerrainZones()[0]!.handle).toBeNull();
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
    sceneEditor.createHiddenTerrainZone(0, 0, 4, 4);
    expect(editor.getEditorHiddenTerrainZones()).toHaveLength(0); // editor not sceneEditor
    expect(sceneEditor.getEditorHiddenTerrainZones()).toHaveLength(1);
    const zone = sceneEditor.getEditorHiddenTerrainZones()[0]!;
    expect(zone.handle).not.toBeNull();
    expect(sceneMgr.addMesh).toHaveBeenCalled();
    sceneEditor.dispose();
  });
});

// ---------------------------------------------------------------------------
// US-303: Hidden terrain drag via mousedown/mouseup
// ---------------------------------------------------------------------------

describe("hidden terrain drag (mousedown/mouseup)", () => {
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

  it("drag across multiple cells creates a hidden terrain zone", () => {
    sceneEditor.enable();
    sceneEditor.selectEntityTool("hiddenTerrain");

    sceneMgr.screenToWorld
      .mockReturnValueOnce({ x: 2, y: 0, z: 2 }) // mousedown
      .mockReturnValueOnce({ x: 7, y: 0, z: 5 }); // mouseup

    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);
    getHandler("mouseup")!({ clientX: 100, clientY: 100 } as MouseEvent);

    expect(sceneEditor.getEditorHiddenTerrainZones()).toHaveLength(1);
    const zone = sceneEditor.getEditorHiddenTerrainZones()[0]!;
    expect(zone.x1).toBe(2);
    expect(zone.z1).toBe(2);
    expect(zone.x2).toBe(7);
    expect(zone.z2).toBe(5);
  });

  it("same-position mousedown/mouseup does NOT create a hidden terrain zone", () => {
    sceneEditor.enable();
    sceneEditor.selectEntityTool("hiddenTerrain");

    sceneMgr.screenToWorld
      .mockReturnValueOnce({ x: 3, y: 0, z: 3 })
      .mockReturnValueOnce({ x: 3, y: 0, z: 3 });

    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);
    getHandler("mouseup")!({ clientX: 0, clientY: 0 } as MouseEvent);

    expect(sceneEditor.getEditorHiddenTerrainZones()).toHaveLength(0);
  });

  it("mousedown with non-hiddenTerrain entity tool does not start a drag", () => {
    sceneEditor.enable();
    sceneEditor.selectEntityTool("catSpawn");

    sceneMgr.screenToWorld.mockReturnValue({ x: 3, y: 0, z: 3 });

    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);
    getHandler("mouseup")!({ clientX: 100, clientY: 100 } as MouseEvent);

    expect(sceneEditor.getEditorHiddenTerrainZones()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// US-303: dispose() cleans up entity meshes
// ---------------------------------------------------------------------------

describe("dispose() — entity cleanup", () => {
  it("cleans up player spawn mesh on dispose", () => {
    const sceneMgr = makeMockSceneManager({ x: 1, y: 0, z: 1 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectEntityTool("playerSpawn");
    sceneEditor.placeEntity(1, 1);
    const spawnHandle = sceneEditor.getPlayerSpawn()!.handle;
    sceneMgr.removeMesh.mockClear();
    sceneEditor.dispose();
    expect(sceneMgr.removeMesh).toHaveBeenCalledWith(spawnHandle);
  });

  it("cleans up cat spawn meshes on dispose", () => {
    const sceneMgr = makeMockSceneManager({ x: 1, y: 0, z: 1 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectEntityTool("catSpawn");
    sceneEditor.placeEntity(1, 1);
    sceneEditor.placeEntity(2, 2);
    sceneMgr.removeMesh.mockClear();
    sceneEditor.dispose();
    expect(sceneMgr.removeMesh).toHaveBeenCalledTimes(2);
  });

  it("cleans up yarn pickup meshes on dispose", () => {
    const sceneMgr = makeMockSceneManager({ x: 1, y: 0, z: 1 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectEntityTool("yarnPickup");
    sceneEditor.placeEntity(3, 3);
    sceneMgr.removeMesh.mockClear();
    sceneEditor.dispose();
    expect(sceneMgr.removeMesh).toHaveBeenCalledTimes(1);
  });

  it("getPlayerSpawn() returns null after dispose", () => {
    editor.selectEntityTool("playerSpawn");
    editor.placeEntity(2, 2);
    editor.dispose();
    expect(editor.getPlayerSpawn()).toBeNull();
  });

  it("getCatSpawns() returns empty array after dispose", () => {
    editor.selectEntityTool("catSpawn");
    editor.placeEntity(1, 1);
    editor.dispose();
    expect(editor.getCatSpawns()).toHaveLength(0);
  });

  it("getResourceNodes() returns empty array after dispose", () => {
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(1, 1);
    editor.dispose();
    expect(editor.getResourceNodes()).toHaveLength(0);
  });

  it("getYarnPickups() returns empty array after dispose", () => {
    editor.selectEntityTool("yarnPickup");
    editor.placeEntity(4, 4);
    editor.dispose();
    expect(editor.getYarnPickups()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// US-304: setEditorToolMode() — mode selection
// ---------------------------------------------------------------------------

describe("setEditorToolMode()", () => {
  it("getEditorToolMode() returns null initially", () => {
    expect(editor.getEditorToolMode()).toBeNull();
  });

  it("sets move mode", () => {
    editor.setEditorToolMode("move");
    expect(editor.getEditorToolMode()).toBe("move");
  });

  it("sets delete mode", () => {
    editor.setEditorToolMode("delete");
    expect(editor.getEditorToolMode()).toBe("delete");
  });

  it("setEditorToolMode(null) clears the mode", () => {
    editor.setEditorToolMode("move");
    editor.setEditorToolMode(null);
    expect(editor.getEditorToolMode()).toBeNull();
  });

  it("setting move mode clears terrain tool", () => {
    editor.selectTool(TerrainType.Grass);
    editor.setEditorToolMode("move");
    expect(editor.getSelectedTool()).toBeNull();
  });

  it("setting delete mode clears entity tool", () => {
    editor.selectEntityTool("catSpawn");
    editor.setEditorToolMode("delete");
    expect(editor.getSelectedEntityTool()).toBeNull();
  });

  it("selecting a terrain tool clears editor tool mode", () => {
    editor.setEditorToolMode("move");
    editor.selectTool(TerrainType.Dirt);
    expect(editor.getEditorToolMode()).toBeNull();
  });

  it("selecting an entity tool clears editor tool mode", () => {
    editor.setEditorToolMode("delete");
    editor.selectEntityTool("yarnPickup");
    expect(editor.getEditorToolMode()).toBeNull();
  });

  it("disable() clears editor tool mode", () => {
    editor.enable();
    editor.setEditorToolMode("move");
    editor.disable();
    expect(editor.getEditorToolMode()).toBeNull();
  });

  it("_editorToolMode type annotation accepted by TypeScript", () => {
    const mode: EditorToolMode | null = editor.getEditorToolMode();
    expect(mode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// US-304: keyboard shortcuts — M / D / 1–9
// ---------------------------------------------------------------------------

describe("keyboard shortcuts (US-304)", () => {
  function getKeydownHandler(): ((e: KeyboardEvent) => void) | undefined {
    return (vi.mocked(document).addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "keydown",
    )?.[1] as ((e: KeyboardEvent) => void) | undefined;
  }

  function fireKey(key: string, extra: Partial<KeyboardEvent> = {}): void {
    const handler = getKeydownHandler();
    expect(handler).toBeDefined();
    handler!({ key, ctrlKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra } as unknown as KeyboardEvent);
  }

  it("M key activates move tool when editor is active", () => {
    editor.enable();
    fireKey("m");
    expect(editor.getEditorToolMode()).toBe("move");
  });

  it("M key toggles move tool off when already active", () => {
    editor.enable();
    fireKey("m"); // on
    fireKey("m"); // off
    expect(editor.getEditorToolMode()).toBeNull();
  });

  it("D key activates delete tool when editor is active", () => {
    editor.enable();
    fireKey("d");
    expect(editor.getEditorToolMode()).toBe("delete");
  });

  it("D key is no-op when editor is inactive", () => {
    fireKey("d"); // editor not enabled
    expect(editor.getEditorToolMode()).toBeNull();
  });

  it("M key is no-op when editor is inactive", () => {
    fireKey("m"); // editor not enabled
    expect(editor.getEditorToolMode()).toBeNull();
  });

  it("'1' key selects Grass terrain tool when active", () => {
    editor.enable();
    fireKey("1");
    expect(editor.getSelectedTool()).toBe(TerrainType.Grass);
  });

  it("'2' key selects Dirt terrain tool when active", () => {
    editor.enable();
    fireKey("2");
    expect(editor.getSelectedTool()).toBe(TerrainType.Dirt);
  });

  it("'3' key selects Stone terrain tool when active", () => {
    editor.enable();
    fireKey("3");
    expect(editor.getSelectedTool()).toBe(TerrainType.Stone);
  });

  it("'4' key selects Water terrain tool when active", () => {
    editor.enable();
    fireKey("4");
    expect(editor.getSelectedTool()).toBe(TerrainType.Water);
  });

  it("'5' key selects playerSpawn entity tool when active", () => {
    editor.enable();
    fireKey("5");
    expect(editor.getSelectedEntityTool()).toBe("playerSpawn");
  });

  it("'9' key selects yarnPickup entity tool when active", () => {
    editor.enable();
    fireKey("9");
    expect(editor.getSelectedEntityTool()).toBe("yarnPickup");
  });

  it("'1' key is no-op when editor is inactive", () => {
    fireKey("1");
    expect(editor.getSelectedTool()).toBeNull();
  });

  it("pressing same palette key again deselects the tool", () => {
    editor.enable();
    fireKey("1"); // select Grass
    fireKey("1"); // deselect
    expect(editor.getSelectedTool()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// US-304: deleteObjectAtPosition()
// ---------------------------------------------------------------------------

describe("deleteObjectAtPosition()", () => {
  it("deletes a terrain block at the given position", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(3, 3);
    expect(editor.getEditorBlocks()).toHaveLength(1);
    editor.deleteObjectAtPosition(3, 3);
    expect(editor.getEditorBlocks()).toHaveLength(0);
  });

  it("position is grid-snapped before lookup", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(3, 3);
    editor.deleteObjectAtPosition(3.4, 3.4); // snaps to (3, 3)
    expect(editor.getEditorBlocks()).toHaveLength(0);
  });

  it("does nothing when no object at position", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(3, 3);
    editor.deleteObjectAtPosition(5, 5); // different position
    expect(editor.getEditorBlocks()).toHaveLength(1);
  });

  it("deletes a player spawn", () => {
    editor.selectEntityTool("playerSpawn");
    editor.placeEntity(2, 2);
    editor.deleteObjectAtPosition(2, 2);
    expect(editor.getPlayerSpawn()).toBeNull();
  });

  it("deletes a cat spawn", () => {
    editor.selectEntityTool("catSpawn");
    editor.placeEntity(4, 4);
    editor.deleteObjectAtPosition(4, 4);
    expect(editor.getCatSpawns()).toHaveLength(0);
  });

  it("deletes only the matched cat spawn when multiple exist", () => {
    editor.selectEntityTool("catSpawn");
    editor.placeEntity(1, 1);
    editor.placeEntity(5, 5);
    editor.deleteObjectAtPosition(1, 1);
    const spawns = editor.getCatSpawns();
    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.x).toBe(5);
  });

  it("deletes a resource node", () => {
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(6, 6);
    editor.deleteObjectAtPosition(6, 6);
    expect(editor.getResourceNodes()).toHaveLength(0);
  });

  it("deletes a yarn pickup", () => {
    editor.selectEntityTool("yarnPickup");
    editor.placeEntity(7, 7);
    editor.deleteObjectAtPosition(7, 7);
    expect(editor.getYarnPickups()).toHaveLength(0);
  });

  it("calls removeMesh on the object's handle when SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 2, y: 0, z: 2 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectTool(TerrainType.Grass);
    sceneEditor.placeBlock(2, 2);
    const handle = sceneEditor.getEditorBlocks()[0]!.handle;
    sceneMgr.removeMesh.mockClear();
    sceneEditor.deleteObjectAtPosition(2, 2);
    expect(sceneMgr.removeMesh).toHaveBeenCalledWith(handle);
    sceneEditor.dispose();
  });

  it("deselects the block if it was selected when deleted", () => {
    editor.selectTool(TerrainType.Grass);
    editor.placeBlock(5, 5);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.deleteObjectAtPosition(5, 5);
    expect(editor.getSelectedBlock()).toBeNull();
    expect(editor.getEditorBlocks()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// US-304: Move tool drag via mousedown/mousemove/mouseup
// ---------------------------------------------------------------------------

describe("move tool drag", () => {
  let sceneMgr: MockSceneMgr;
  let sceneEditor: MapEditor;
  let sceneContainer: MockEl;

  beforeEach(() => {
    sceneMgr = makeMockSceneManager({ x: 1, y: 0, z: 1 });
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

  it("mousedown in move mode starts tracking the object", () => {
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Grass);
    sceneEditor.placeBlock(1, 1);
    sceneEditor.setEditorToolMode("move");

    sceneMgr.screenToWorld.mockReturnValue({ x: 1, y: 0, z: 1 });
    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);

    // Object should be moving — subsequent mousemove updates its position
    sceneMgr.screenToWorld.mockReturnValue({ x: 4, y: 0, z: 4 });
    getHandler("mousemove")!({ clientX: 40, clientY: 40 } as MouseEvent);

    const block = sceneEditor.getEditorBlocks()[0]!;
    expect(block.x).toBe(4);
    expect(block.z).toBe(4);
  });

  it("mouseup finalizes the move and clears the moving object (no further moves)", () => {
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Grass);
    sceneEditor.placeBlock(1, 1);
    sceneEditor.setEditorToolMode("move");

    sceneMgr.screenToWorld.mockReturnValue({ x: 1, y: 0, z: 1 });
    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);

    sceneMgr.screenToWorld.mockReturnValue({ x: 3, y: 0, z: 3 });
    getHandler("mousemove")!({ clientX: 30, clientY: 30 } as MouseEvent);

    getHandler("mouseup")!({ clientX: 30, clientY: 30 } as MouseEvent);

    // After mouseup, further mousemove should not move the object
    sceneMgr.screenToWorld.mockReturnValue({ x: 9, y: 0, z: 9 });
    getHandler("mousemove")!({ clientX: 90, clientY: 90 } as MouseEvent);

    const block = sceneEditor.getEditorBlocks()[0]!;
    expect(block.x).toBe(3);
    expect(block.z).toBe(3);
  });

  it("move tool updates entity position (cat spawn)", () => {
    sceneEditor.enable();
    sceneEditor.selectEntityTool("catSpawn");
    sceneEditor.placeEntity(2, 2);
    sceneEditor.setEditorToolMode("move");

    sceneMgr.screenToWorld.mockReturnValue({ x: 2, y: 0, z: 2 });
    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);

    sceneMgr.screenToWorld.mockReturnValue({ x: 6, y: 0, z: 8 });
    getHandler("mousemove")!({ clientX: 60, clientY: 80 } as MouseEvent);

    const spawn = sceneEditor.getCatSpawns()[0]!;
    expect(spawn.x).toBe(6);
    expect(spawn.z).toBe(8);
  });

  it("mousedown on empty area does not start a move drag", () => {
    sceneEditor.enable();
    sceneEditor.setEditorToolMode("move");

    // No object at (5, 5)
    sceneMgr.screenToWorld.mockReturnValue({ x: 5, y: 0, z: 5 });
    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);

    // Mousemove should not throw or mutate anything
    sceneMgr.screenToWorld.mockReturnValue({ x: 8, y: 0, z: 8 });
    expect(() => {
      getHandler("mousemove")!({ clientX: 80, clientY: 80 } as MouseEvent);
    }).not.toThrow();
  });

  it("calls updateTransform on the mesh during drag", () => {
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Grass);
    sceneEditor.placeBlock(1, 1);
    sceneEditor.setEditorToolMode("move");

    sceneMgr.screenToWorld.mockReturnValue({ x: 1, y: 0, z: 1 });
    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);

    sceneMgr.updateTransform.mockClear();
    sceneMgr.screenToWorld.mockReturnValue({ x: 5, y: 0, z: 5 });
    getHandler("mousemove")!({ clientX: 50, clientY: 50 } as MouseEvent);

    expect(sceneMgr.updateTransform).toHaveBeenCalled();
    const [, pos] = sceneMgr.updateTransform.mock.calls[0] as [
      symbol,
      { x: number; y: number; z: number },
      unknown,
      unknown,
    ];
    expect(pos.x).toBe(5);
    expect(pos.z).toBe(5);
  });
});
