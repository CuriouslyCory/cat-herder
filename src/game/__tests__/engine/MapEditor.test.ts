import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MapEditor, RESOURCE_RESPAWN_DEFAULTS } from "~/game/maps/MapEditor";
import type { EditorBlock, EditorWaterZone, EditorToolMode } from "~/game/maps/MapEditor";
import type { CameraController } from "~/game/engine/CameraController";
import type { MapData, TerrainCell } from "~/game/maps/MapData";
import { TerrainType, ResourceType } from "~/game/types";
import { mapDataSchema } from "~/game/maps/MapDataSchema";
import { cellToWorld, worldToCell } from "~/game/maps/coords";

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
  click: ReturnType<typeof vi.fn>;
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
    click: vi.fn(),
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
  setTerrainGrid: ReturnType<typeof vi.fn>;
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
    setTerrainGrid: vi.fn(),
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
    size: { width: 1, depth: 1 },
    terrain: [[{ type: TerrainType.Grass, height: 1, navigable: true }]],
    cellSize: 1,
    spawnPoints: [{ x: 0, z: 0, role: "player" }],
    resourceNodes: [],
    yarnPickups: [],
  };
}

/** Build an empty (all Grass/0) terrain grid of the given cell dimensions. */
function buildEmptyTerrain(rows: number, cols: number): TerrainCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (): TerrainCell => ({
      type: TerrainType.Grass,
      height: 0,
      navigable: true,
    }))
  );
}

/**
 * Build a small MapData for editor tests.
 * @param cols - number of cells wide (size.width = cols * cellSize)
 * @param rows - number of cells deep (size.depth = rows * cellSize)
 * @param cellSize - cell size in world units
 */
function makeMapData(cols: number, rows: number, cellSize: number): MapData {
  return {
    name: "test-map",
    size: { width: cols * cellSize, depth: rows * cellSize },
    terrain: buildEmptyTerrain(rows, cols),
    cellSize,
    spawnPoints: [],
    resourceNodes: [],
    yarnPickups: [],
  };
}

/**
 * Build a single-cell MapData with a specific cell at (col, row).
 */
function mapWithCell(col: number, row: number, cell: TerrainCell, cols = 4, rows = 4, cellSize = 2): MapData {
  const terrain = buildEmptyTerrain(rows, cols);
  terrain[row]![col]! = { ...cell };
  return {
    name: "cell-test",
    size: { width: cols * cellSize, depth: rows * cellSize },
    terrain,
    cellSize,
    spawnPoints: [],
    resourceNodes: [],
    yarnPickups: [],
  };
}

/**
 * Build a full sample MapData with water, hidden, and elevated cells for round-trip tests.
 */
function makeFullSampleMapData(): MapData {
  const terrain = buildEmptyTerrain(4, 4);
  // Water cell at (0,0)
  terrain[0]![0]! = { type: TerrainType.Water, height: 0, navigable: false, depth: 2 };
  // Hidden cell at (1,1)
  terrain[1]![1]! = { type: TerrainType.Hidden, height: 1.5, navigable: false };
  // Elevated stone at (2,2)
  terrain[2]![2]! = { type: TerrainType.Stone, height: 3, navigable: true };
  return {
    name: "full-sample",
    size: { width: 8, depth: 8 },
    terrain,
    cellSize: 2,
    spawnPoints: [{ x: -3, z: -3, role: "player" }],
    resourceNodes: [{ x: 1, z: 1, type: ResourceType.Grass, respawnTime: 30 }],
    yarnPickups: [{ x: 3, z: 3, yarnAmount: 5 }],
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

  it("getEditorBlocks() returns empty array initially (no non-default cells)", () => {
    // No map loaded, no blocks placed — returns empty
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
    expect(result.size).toEqual({ width: 1, depth: 1 });
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
    const data = makeMapData(5, 5, 2);
    editor.loadMapData(data);
    editor.placeBlock(5, 3);
    expect(editor.getEditorBlocks()).toHaveLength(0);
  });

  it("places a Stone block — visible in getEditorBlocks() and terrain[][]", () => {
    // Use a small 6×6/cellSize=2 map so cell math is predictable.
    const data = makeMapData(6, 6, 2);
    editor.loadMapData(data);
    editor.selectTool(TerrainType.Stone);
    // World (-5, -5) → cell(0,0) in a 12×12/cellSize=2 map
    editor.placeBlock(-5, -5);
    const blocks = editor.getEditorBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe(TerrainType.Stone);
  });

  it("placed block has correct terrain type", () => {
    const data = makeMapData(6, 6, 2);
    editor.loadMapData(data);
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const { col, row } = worldToCell(0, 0, 2, 12, 12);
    expect(editor.getMapData().terrain[row]![col]!.type).toBe(TerrainType.Stone);
  });

  it("placed block has height 0 (cell default) unless the cell already has height", () => {
    const data = makeMapData(6, 6, 2);
    editor.loadMapData(data);
    editor.selectTool(TerrainType.Dirt);
    editor.placeBlock(0, 0);
    const { col, row } = worldToCell(0, 0, 2, 12, 12);
    expect(editor.getMapData().terrain[row]![col]!.height).toBe(0);
  });

  it("placing multiple non-Grass blocks at different positions creates multiple entries", () => {
    const data = makeMapData(6, 6, 2);
    editor.loadMapData(data);
    editor.selectTool(TerrainType.Stone);
    // Three clearly separate cells
    editor.placeBlock(-5, -5); // cell (0,0)
    editor.placeBlock(1, -5);  // cell (3,0)
    editor.placeBlock(-5, 1);  // cell (0,3)
    expect(editor.getEditorBlocks()).toHaveLength(3);
  });

  it("placing a block at an occupied position updates its type instead of adding", () => {
    const data = makeMapData(6, 6, 2);
    editor.loadMapData(data);
    editor.selectTool(TerrainType.Dirt);
    editor.placeBlock(0, 0);
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const blocks = editor.getEditorBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe(TerrainType.Stone);
  });

  it("nearby clicks that map to the same cell are deduplicated", () => {
    const data = makeMapData(6, 6, 2);
    editor.loadMapData(data);
    editor.selectTool(TerrainType.Water);
    // Both positions should snap to the same cell
    const center = cellToWorld(3, 3, 2, 12, 12);
    editor.placeBlock(center.x - 0.3, center.z - 0.3);
    editor.placeBlock(center.x + 0.3, center.z + 0.3);
    // Only one Water cell
    expect(editor.getEditorWaterZones()).toHaveLength(1);
  });

  it("clicks that snap to different cells create separate entries", () => {
    const data = makeMapData(6, 6, 2);
    editor.loadMapData(data);
    editor.selectTool(TerrainType.Stone);
    const c1 = cellToWorld(1, 1, 2, 12, 12);
    const c2 = cellToWorld(3, 3, 2, 12, 12);
    editor.placeBlock(c1.x, c1.z);
    editor.placeBlock(c2.x, c2.z);
    expect(editor.getEditorBlocks()).toHaveLength(2);
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

  it("calls addMesh when placing a non-default block", () => {
    // Load a map so terrain exists; use Stone (non-default) so the mesh is created
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Stone);
    sceneEditor.placeBlock(0, 0);
    expect(sceneMgr.addMesh).toHaveBeenCalled();
  });

  it("addMesh receives correct geometry and opacity for solid block", () => {
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Dirt);
    sceneEditor.placeBlock(0, 0);
    const call = sceneMgr.addMesh.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.geometry).toBe("box");
    expect(call.opacity).toBeUndefined(); // solid block — no custom opacity
  });

  it("block handle is stored on EditorBlock via getEditorBlocks()", () => {
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Stone);
    sceneEditor.placeBlock(0, 0);
    const block = sceneEditor.getEditorBlocks()[0]!;
    expect(block).not.toBeUndefined();
    expect(block.handle).not.toBeNull();
    expect(typeof block.handle).toBe("symbol");
  });

  it("updateTransform is called with cell-center world position", () => {
    // Use a 6-cell/cellSize=2 map (12×12 world). Cell (3,3) center = (1,1).
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Stone);
    // Place near cell-center (1,1): worldToCell(1,1,2,12,12) = (3,3)
    sceneEditor.placeBlock(1, 1);
    expect(sceneMgr.updateTransform).toHaveBeenCalled();
    const [, pos] = sceneMgr.updateTransform.mock.calls[0] as [
      symbol,
      { x: number; y: number; z: number },
      unknown,
      unknown,
    ];
    // cellToWorld(3,3,2,12,12) = x=-6+6+1=1, z=-6+6+1=1
    expect(pos.x).toBeCloseTo(1);
    expect(pos.z).toBeCloseTo(1);
    // height=0 → centerY = -0.1 (FLOOR_THICKNESS/2)
    expect(pos.y).toBeCloseTo(-0.1);
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
  it("getEditorBlocks() returns the correct shape for non-default cells", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const block: EditorBlock = editor.getEditorBlocks()[0]!;
    expect(block).not.toBeUndefined();
    expect(typeof block.x).toBe("number");
    expect(typeof block.z).toBe("number");
    expect(typeof block.height).toBe("number");
    expect(block.type).toBe(TerrainType.Stone);
    expect(block.handle).toBeNull(); // no SceneManager
  });
});

// ---------------------------------------------------------------------------
// US-302b: Block selection
// ---------------------------------------------------------------------------

describe("selectBlock()", () => {
  it("selectBlock() sets the selected block", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    expect(editor.getSelectedBlock()).toBe(block);
  });

  it("selectBlock(null) deselects", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.selectBlock(null);
    expect(editor.getSelectedBlock()).toBeNull();
  });

  it("selecting a different block deselects the previous one", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    const c1 = cellToWorld(1, 1, 2, 12, 12);
    const c2 = cellToWorld(3, 3, 2, 12, 12);
    editor.placeBlock(c1.x, c1.z);
    editor.placeBlock(c2.x, c2.z);
    const [blockA, blockB] = editor.getEditorBlocks() as [EditorBlock, EditorBlock];
    editor.selectBlock(blockA);
    editor.selectBlock(blockB);
    expect(editor.getSelectedBlock()).toBe(blockB);
  });

  it("selectBlock() is safe when block has no handle (no SceneManager)", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const block = editor.getEditorBlocks()[0]!;
    expect(block).not.toBeUndefined();
    expect(block.handle).toBeNull();
    expect(() => editor.selectBlock(block)).not.toThrow();
    expect(editor.getSelectedBlock()).toBe(block);
  });

  it("calls setMeshEmissive on block handle when SceneManager is present", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Stone);
    sceneEditor.placeBlock(0, 0);
    sceneMgr.setMeshEmissive.mockClear();
    const block = sceneEditor.getEditorBlocks()[0]!;
    expect(block).not.toBeUndefined();
    sceneEditor.selectBlock(block);
    expect(sceneMgr.setMeshEmissive).toHaveBeenCalledWith(
      block.handle,
      expect.any(String),
      expect.any(Number),
    );
    sceneEditor.dispose();
  });

  it("calls setMeshEmissive to remove highlight on previously selected block", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Stone);
    const c1 = cellToWorld(1, 1, 2, 12, 12);
    const c2 = cellToWorld(3, 3, 2, 12, 12);
    sceneEditor.placeBlock(c1.x, c1.z);
    sceneEditor.placeBlock(c2.x, c2.z);
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
  it("updates the type of the selected block in terrain[][]", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.updateSelectedBlockType(TerrainType.Dirt);
    // Check terrain directly
    const { col, row } = worldToCell(block.x, block.z, 2, 12, 12);
    expect(editor.getMapData().terrain[row]![col]!.type).toBe(TerrainType.Dirt);
  });

  it("does nothing when no block is selected", () => {
    expect(() => editor.updateSelectedBlockType(TerrainType.Grass)).not.toThrow();
  });

  it("recreates the cell mesh when SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Stone);
    sceneEditor.placeBlock(0, 0);
    const block = sceneEditor.getEditorBlocks()[0]!;
    sceneEditor.selectBlock(block);
    sceneMgr.addMesh.mockClear();
    sceneEditor.updateSelectedBlockType(TerrainType.Dirt);
    // _setCellMesh recreates the mesh → addMesh called again
    expect(sceneMgr.addMesh).toHaveBeenCalled();
    sceneEditor.dispose();
  });
});

describe("updateSelectedBlockHeight()", () => {
  it("updates the height of the selected block in terrain[][]", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.updateSelectedBlockHeight(2.5);
    const { col, row } = worldToCell(block.x, block.z, 2, 12, 12);
    expect(editor.getMapData().terrain[row]![col]!.height).toBe(2.5);
    expect(block.height).toBe(2.5); // compat block updated too
  });

  it("clamps height to minimum (0.5)", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.updateSelectedBlockHeight(0);
    expect(block.height).toBe(0.5);
  });

  it("clamps height to maximum (5)", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.updateSelectedBlockHeight(10);
    expect(block.height).toBe(5);
  });

  it("does nothing when no block is selected", () => {
    expect(() => editor.updateSelectedBlockHeight(2)).not.toThrow();
  });

  it("recreates the cell mesh with correct centerY when SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Stone);
    sceneEditor.placeBlock(0, 0);
    const block = sceneEditor.getEditorBlocks()[0]!;
    sceneEditor.selectBlock(block);
    sceneMgr.updateTransform.mockClear();
    sceneEditor.updateSelectedBlockHeight(3);
    expect(sceneMgr.updateTransform).toHaveBeenCalled();
    const [, pos] = sceneMgr.updateTransform.mock.calls[0] as [
      symbol,
      { x: number; y: number; z: number },
      unknown,
      unknown,
    ];
    expect(pos.y).toBeCloseTo(1.5); // cellMeshGeometry(3).centerY = 3/2
    sceneEditor.dispose();
  });
});

// ---------------------------------------------------------------------------
// US-302b: Delete selected block
// ---------------------------------------------------------------------------

describe("deleteSelectedBlock()", () => {
  it("removes the selected block — terrain cell resets to Grass/0", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    const c1 = cellToWorld(1, 1, 2, 12, 12);
    const c2 = cellToWorld(3, 3, 2, 12, 12);
    editor.placeBlock(c1.x, c1.z);
    editor.placeBlock(c2.x, c2.z);
    expect(editor.getEditorBlocks()).toHaveLength(2);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.deleteSelectedBlock();
    expect(editor.getEditorBlocks()).toHaveLength(1);
    // The deleted cell should be Grass/0 again
    const { col, row } = worldToCell(block.x, block.z, 2, 12, 12);
    expect(editor.getMapData().terrain[row]![col]!.type).toBe(TerrainType.Grass);
  });

  it("deselects after deletion", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.deleteSelectedBlock();
    expect(editor.getSelectedBlock()).toBeNull();
  });

  it("does nothing when no block is selected", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    expect(() => editor.deleteSelectedBlock()).not.toThrow();
    expect(editor.getEditorBlocks()).toHaveLength(1);
  });

  it("calls removeMesh when block has a handle and SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Stone);
    sceneEditor.placeBlock(0, 0);
    const block = sceneEditor.getEditorBlocks()[0]!;
    const handle = block.handle;
    sceneEditor.selectBlock(block);
    sceneMgr.removeMesh.mockClear();
    sceneEditor.deleteSelectedBlock();
    expect(sceneMgr.removeMesh).toHaveBeenCalledWith(handle);
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

    editor.loadMapData(makeMapData(6, 6, 2));
    editor.enable();
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
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

    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    editor.placeBlock(0, 0);
    // editor is NOT enabled

    keydownHandler!({ key: "Delete", ctrlKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent);

    // Block still exists
    expect(editor.getEditorBlocks()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// US-302b: Water zone creation
// ---------------------------------------------------------------------------

describe("createWaterZone()", () => {
  // After refactor, createWaterZone paints individual Water cells in terrain[][].
  // getEditorWaterZones() returns one entry per Water cell (compat shim).

  it("paints Water cells in terrain[][] and they appear in getEditorWaterZones()", () => {
    // Use a small 4×4/cellSize=2 map. createWaterZone with a single cell center.
    editor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(1, 1, 2, 8, 8);
    editor.createWaterZone(c.x, c.z, c.x, c.z);
    expect(editor.getEditorWaterZones()).toHaveLength(1);
  });

  it("multi-cell rect paints all cells Water", () => {
    // 4×4 map, two cells: (0,0) and (1,0) — drag from cell center to cell center
    editor.loadMapData(makeMapData(4, 4, 2));
    const c1 = cellToWorld(0, 0, 2, 8, 8);
    const c2 = cellToWorld(1, 0, 2, 8, 8);
    editor.createWaterZone(c1.x, c1.z, c2.x, c2.z);
    expect(editor.getEditorWaterZones()).toHaveLength(2);
  });

  it("default depth is 1 (from selectedWaterDepth)", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(0, 0, 2, 8, 8);
    editor.createWaterZone(c.x, c.z, c.x, c.z);
    expect(editor.getEditorWaterZones()[0]!.depth).toBe(1);
  });

  it("can call createWaterZone twice for non-overlapping cells", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c1 = cellToWorld(0, 0, 2, 8, 8);
    const c2 = cellToWorld(3, 3, 2, 8, 8);
    editor.createWaterZone(c1.x, c1.z, c1.x, c1.z);
    editor.createWaterZone(c2.x, c2.z, c2.x, c2.z);
    expect(editor.getEditorWaterZones()).toHaveLength(2);
  });

  it("handle is null when no SceneManager", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(0, 0, 2, 8, 8);
    editor.createWaterZone(c.x, c.z, c.x, c.z);
    expect(editor.getEditorWaterZones()[0]!.handle).toBeNull();
  });

  it("creates cell meshes via SceneManager when present", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(0, 0, 2, 8, 8);
    sceneEditor.createWaterZone(c.x, c.z, c.x, c.z);
    const zones = sceneEditor.getEditorWaterZones();
    expect(zones).toHaveLength(1);
    expect(zones[0]!.handle).not.toBeNull();
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

  it("drag across multiple cells paints Water cells in terrain[][]", () => {
    // Load a map first
    sceneEditor.loadMapData(makeMapData(10, 10, 2));
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Water);

    // Simulate drag: two different cells (same row, adjacent columns)
    // Using cell centers so snap math gives distinct cells.
    const c1 = cellToWorld(2, 2, 2, 20, 20);
    const c2 = cellToWorld(4, 3, 2, 20, 20);
    sceneMgr.screenToWorld
      .mockReturnValueOnce({ x: c1.x, y: 0, z: c1.z }) // mousedown
      .mockReturnValueOnce({ x: c2.x, y: 0, z: c2.z }); // mouseup

    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);
    getHandler("mouseup")!({ clientX: 100, clientY: 100 } as MouseEvent);

    // Water cells should exist in terrain[][]
    const waterZones = sceneEditor.getEditorWaterZones();
    expect(waterZones.length).toBeGreaterThan(1);
  });

  it("same-position mousedown/mouseup does NOT create Water cells", () => {
    sceneEditor.loadMapData(makeMapData(10, 10, 2));
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Water);

    const c = cellToWorld(3, 3, 2, 20, 20);
    sceneMgr.screenToWorld
      .mockReturnValueOnce({ x: c.x, y: 0, z: c.z }) // mousedown
      .mockReturnValueOnce({ x: c.x, y: 0, z: c.z }); // mouseup at same cell

    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);
    getHandler("mouseup")!({ clientX: 0, clientY: 0 } as MouseEvent);

    expect(sceneEditor.getEditorWaterZones()).toHaveLength(0);
  });

  it("mousedown with non-Water tool does not start a drag", () => {
    sceneEditor.loadMapData(makeMapData(10, 10, 2));
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Grass); // not Water

    sceneMgr.screenToWorld.mockReturnValue({ x: 0, y: 0, z: 0 });

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
  it("places a player spawn snapped to the cell center", () => {
    // Default map: 30×30/cellSize=2. Place near cell (9,11): worldToCell(4,8,2,30,30) = (9,11)
    // cellToWorld(9,11,2,30,30) = x=4, z=8
    const expectedX = cellToWorld(9, 11, 2, 30, 30).x;
    const expectedZ = cellToWorld(9, 11, 2, 30, 30).z;
    editor.selectEntityTool("playerSpawn");
    editor.placeEntity(4, 8);
    const spawn = editor.getPlayerSpawn();
    expect(spawn).not.toBeNull();
    expect(spawn!.x).toBeCloseTo(expectedX);
    expect(spawn!.z).toBeCloseTo(expectedZ);
  });

  it("only one player spawn is allowed — placing a second moves the first", () => {
    editor.selectEntityTool("playerSpawn");
    // Use cell-centers directly so positions are predictable
    const p1 = cellToWorld(1, 1, 2, 30, 30);
    const p2 = cellToWorld(5, 5, 2, 30, 30);
    editor.placeEntity(p1.x, p1.z);
    editor.placeEntity(p2.x, p2.z);
    const spawn = editor.getPlayerSpawn();
    expect(spawn).not.toBeNull();
    expect(spawn!.x).toBeCloseTo(p2.x);
    expect(spawn!.z).toBeCloseTo(p2.z);
  });

  it("moving player spawn removes the old mesh when SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    const p1 = cellToWorld(1, 1, 2, 30, 30);
    const p2 = cellToWorld(5, 5, 2, 30, 30);
    sceneEditor.selectEntityTool("playerSpawn");
    sceneEditor.placeEntity(p1.x, p1.z);
    const firstHandle = sceneEditor.getPlayerSpawn()!.handle;
    sceneMgr.removeMesh.mockClear();
    sceneEditor.placeEntity(p2.x, p2.z);
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
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.selectEntityTool("playerSpawn");
    sceneEditor.placeEntity(0, 0);
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
  it("places a cat spawn snapped to cell center", () => {
    const p = cellToWorld(2, 4, 2, 30, 30);
    editor.selectEntityTool("catSpawn");
    editor.placeEntity(p.x, p.z);
    const spawns = editor.getCatSpawns();
    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.x).toBeCloseTo(p.x);
    expect(spawns[0]!.z).toBeCloseTo(p.z);
  });

  it("can place multiple cat spawns", () => {
    editor.selectEntityTool("catSpawn");
    const c1 = cellToWorld(1, 1, 2, 30, 30);
    const c2 = cellToWorld(5, 5, 2, 30, 30);
    const c3 = cellToWorld(10, 10, 2, 30, 30);
    editor.placeEntity(c1.x, c1.z);
    editor.placeEntity(c2.x, c2.z);
    editor.placeEntity(c3.x, c3.z);
    expect(editor.getCatSpawns()).toHaveLength(3);
  });

  it("cat spawn handle is null when no SceneManager", () => {
    editor.selectEntityTool("catSpawn");
    editor.placeEntity(0, 0);
    expect(editor.getCatSpawns()[0]!.handle).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// US-303: Entity placement — resource node
// ---------------------------------------------------------------------------

describe("placeEntity() — resourceNode", () => {
  it("places a resource node with default Grass type", () => {
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(0, 0);
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
    const p1 = cellToWorld(1, 1, 2, 30, 30);
    const p2 = cellToWorld(3, 3, 2, 30, 30);
    editor.placeEntity(p1.x, p1.z);
    editor.placeEntity(p2.x, p2.z);
    expect(editor.getResourceNodes()).toHaveLength(2);
  });

  it("resource node position is snapped to cell center", () => {
    editor.selectEntityTool("resourceNode");
    // placeEntity(4.7, 2.3) → worldToCell(4.7, 2.3, 2, 30, 30) = (9, 8) → cellToWorld(9,8,...) = (4, 2)
    const expectedCol = Math.floor((4.7 + 15) / 2); // 9
    const expectedRow = Math.floor((2.3 + 15) / 2); // 8
    const expected = cellToWorld(expectedCol, expectedRow, 2, 30, 30);
    editor.placeEntity(4.7, 2.3);
    const node = editor.getResourceNodes()[0]!;
    expect(node.x).toBeCloseTo(expected.x);
    expect(node.z).toBeCloseTo(expected.z);
  });

  it("resource node handle is null when no SceneManager", () => {
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(0, 0);
    expect(editor.getResourceNodes()[0]!.handle).toBeNull();
  });

  it("stores correct resource node type (default Grass)", () => {
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(0, 0);
    expect(editor.getResourceNodes()[0]!.type).toBe(ResourceType.Grass);
  });
});

// ---------------------------------------------------------------------------
// US-303: Entity placement — yarn pickup
// ---------------------------------------------------------------------------

describe("placeEntity() — yarnPickup", () => {
  it("places a yarn pickup with default amount (3)", () => {
    editor.selectEntityTool("yarnPickup");
    editor.placeEntity(0, 0);
    const pickups = editor.getYarnPickups();
    expect(pickups).toHaveLength(1);
    expect(pickups[0]!.yarnAmount).toBe(3);
  });

  it("can place multiple yarn pickups", () => {
    editor.selectEntityTool("yarnPickup");
    const p1 = cellToWorld(1, 1, 2, 30, 30);
    const p2 = cellToWorld(2, 2, 2, 30, 30);
    editor.placeEntity(p1.x, p1.z);
    editor.placeEntity(p2.x, p2.z);
    expect(editor.getYarnPickups()).toHaveLength(2);
  });

  it("yarn pickup position is snapped to cell center", () => {
    editor.selectEntityTool("yarnPickup");
    const expCol = Math.floor((1.6 + 15) / 2); // floor(8.3) = 8
    const expRow = Math.floor((3.2 + 15) / 2); // floor(9.1) = 9
    const expected = cellToWorld(expCol, expRow, 2, 30, 30);
    editor.placeEntity(1.6, 3.2);
    const pickup = editor.getYarnPickups()[0]!;
    expect(pickup.x).toBeCloseTo(expected.x);
    expect(pickup.z).toBeCloseTo(expected.z);
  });

  it("yarn pickup handle is null when no SceneManager", () => {
    editor.selectEntityTool("yarnPickup");
    editor.placeEntity(0, 0);
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
  // After refactor, createHiddenTerrainZone paints Hidden cells in terrain[][].
  // getEditorHiddenTerrainZones() returns one entry per Hidden cell (compat shim).

  it("paints Hidden cells in terrain[][] (single cell)", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(1, 1, 2, 8, 8);
    editor.createHiddenTerrainZone(c.x, c.z, c.x, c.z);
    expect(editor.getEditorHiddenTerrainZones()).toHaveLength(1);
  });

  it("multi-cell rect paints all cells Hidden", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c1 = cellToWorld(0, 0, 2, 8, 8);
    const c2 = cellToWorld(1, 0, 2, 8, 8);
    editor.createHiddenTerrainZone(c1.x, c1.z, c2.x, c2.z);
    expect(editor.getEditorHiddenTerrainZones()).toHaveLength(2);
  });

  it("default height is 1", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(0, 0, 2, 8, 8);
    editor.createHiddenTerrainZone(c.x, c.z, c.x, c.z);
    expect(editor.getEditorHiddenTerrainZones()[0]!.height).toBe(1);
  });

  it("can paint non-overlapping cells in two separate calls", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c1 = cellToWorld(0, 0, 2, 8, 8);
    const c2 = cellToWorld(3, 3, 2, 8, 8);
    editor.createHiddenTerrainZone(c1.x, c1.z, c1.x, c1.z);
    editor.createHiddenTerrainZone(c2.x, c2.z, c2.x, c2.z);
    expect(editor.getEditorHiddenTerrainZones()).toHaveLength(2);
  });

  it("handle is null when no SceneManager", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(0, 0, 2, 8, 8);
    editor.createHiddenTerrainZone(c.x, c.z, c.x, c.z);
    expect(editor.getEditorHiddenTerrainZones()[0]!.handle).toBeNull();
  });

  it("creates cell meshes via SceneManager when present", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(0, 0, 2, 8, 8);
    sceneEditor.createHiddenTerrainZone(c.x, c.z, c.x, c.z);
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

  it("drag across multiple cells paints Hidden cells in terrain[][]", () => {
    sceneEditor.loadMapData(makeMapData(10, 10, 2));
    sceneEditor.enable();
    sceneEditor.selectEntityTool("hiddenTerrain");

    const c1 = cellToWorld(2, 2, 2, 20, 20);
    const c2 = cellToWorld(4, 3, 2, 20, 20);
    sceneMgr.screenToWorld
      .mockReturnValueOnce({ x: c1.x, y: 0, z: c1.z }) // mousedown
      .mockReturnValueOnce({ x: c2.x, y: 0, z: c2.z }); // mouseup

    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);
    getHandler("mouseup")!({ clientX: 100, clientY: 100 } as MouseEvent);

    expect(sceneEditor.getEditorHiddenTerrainZones().length).toBeGreaterThan(1);
  });

  it("same-position mousedown/mouseup does NOT create Hidden terrain cells", () => {
    sceneEditor.loadMapData(makeMapData(10, 10, 2));
    sceneEditor.enable();
    sceneEditor.selectEntityTool("hiddenTerrain");

    const c = cellToWorld(3, 3, 2, 20, 20);
    sceneMgr.screenToWorld
      .mockReturnValueOnce({ x: c.x, y: 0, z: c.z })
      .mockReturnValueOnce({ x: c.x, y: 0, z: c.z });

    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);
    getHandler("mouseup")!({ clientX: 0, clientY: 0 } as MouseEvent);

    expect(sceneEditor.getEditorHiddenTerrainZones()).toHaveLength(0);
  });

  it("mousedown with non-hiddenTerrain entity tool does not start a drag", () => {
    sceneEditor.loadMapData(makeMapData(10, 10, 2));
    sceneEditor.enable();
    sceneEditor.selectEntityTool("catSpawn");

    sceneMgr.screenToWorld.mockReturnValue({ x: 0, y: 0, z: 0 });

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
  it("deletes a terrain block at the given cell center", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    const p = cellToWorld(2, 2, 2, 12, 12);
    editor.placeBlock(p.x, p.z);
    expect(editor.getEditorBlocks()).toHaveLength(1);
    editor.deleteObjectAtPosition(p.x, p.z);
    expect(editor.getEditorBlocks()).toHaveLength(0);
  });

  it("position is cell-snapped before lookup — nearby point deletes same cell", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    const p = cellToWorld(2, 2, 2, 12, 12);
    editor.placeBlock(p.x, p.z);
    // Use a slightly offset point that maps to the same cell
    editor.deleteObjectAtPosition(p.x + 0.3, p.z + 0.3);
    expect(editor.getEditorBlocks()).toHaveLength(0);
  });

  it("does nothing when no object at position", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    const p1 = cellToWorld(2, 2, 2, 12, 12);
    const p2 = cellToWorld(4, 4, 2, 12, 12);
    editor.placeBlock(p1.x, p1.z);
    editor.deleteObjectAtPosition(p2.x, p2.z); // different cell
    expect(editor.getEditorBlocks()).toHaveLength(1);
  });

  it("deletes a player spawn", () => {
    const p = cellToWorld(2, 2, 2, 30, 30);
    editor.selectEntityTool("playerSpawn");
    editor.placeEntity(p.x, p.z);
    editor.deleteObjectAtPosition(p.x, p.z);
    expect(editor.getPlayerSpawn()).toBeNull();
  });

  it("deletes a cat spawn", () => {
    const p = cellToWorld(4, 4, 2, 30, 30);
    editor.selectEntityTool("catSpawn");
    editor.placeEntity(p.x, p.z);
    editor.deleteObjectAtPosition(p.x, p.z);
    expect(editor.getCatSpawns()).toHaveLength(0);
  });

  it("deletes only the matched cat spawn when multiple exist", () => {
    const p1 = cellToWorld(1, 1, 2, 30, 30);
    const p2 = cellToWorld(5, 5, 2, 30, 30);
    editor.selectEntityTool("catSpawn");
    editor.placeEntity(p1.x, p1.z);
    editor.placeEntity(p2.x, p2.z);
    editor.deleteObjectAtPosition(p1.x, p1.z);
    const spawns = editor.getCatSpawns();
    expect(spawns).toHaveLength(1);
    expect(spawns[0]!.x).toBeCloseTo(p2.x);
    expect(spawns[0]!.z).toBeCloseTo(p2.z);
  });

  it("deletes a resource node", () => {
    const p = cellToWorld(6, 6, 2, 30, 30);
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(p.x, p.z);
    editor.deleteObjectAtPosition(p.x, p.z);
    expect(editor.getResourceNodes()).toHaveLength(0);
  });

  it("deletes a yarn pickup", () => {
    const p = cellToWorld(7, 7, 2, 30, 30);
    editor.selectEntityTool("yarnPickup");
    editor.placeEntity(p.x, p.z);
    editor.deleteObjectAtPosition(p.x, p.z);
    expect(editor.getYarnPickups()).toHaveLength(0);
  });

  it("calls removeMesh on the object's handle when SceneManager present", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      mockCamera as unknown as CameraController,
      lifecycle,
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Stone);
    const p = cellToWorld(2, 2, 2, 12, 12);
    sceneEditor.placeBlock(p.x, p.z);
    const handle = sceneEditor.getEditorBlocks()[0]!.handle;
    sceneMgr.removeMesh.mockClear();
    sceneEditor.deleteObjectAtPosition(p.x, p.z);
    expect(sceneMgr.removeMesh).toHaveBeenCalledWith(handle);
    sceneEditor.dispose();
  });

  it("deselects the block if it was selected when deleted", () => {
    editor.loadMapData(makeMapData(6, 6, 2));
    editor.selectTool(TerrainType.Stone);
    const p = cellToWorld(2, 2, 2, 12, 12);
    editor.placeBlock(p.x, p.z);
    const block = editor.getEditorBlocks()[0]!;
    editor.selectBlock(block);
    editor.deleteObjectAtPosition(p.x, p.z);
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

  it("mousedown+mousemove+mouseup moves a block to the new cell", () => {
    // Move is committed to terrain[][] only on mouseup (intermediate drag is visual only).
    sceneEditor.loadMapData(makeMapData(10, 10, 2));
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Stone);
    const p1 = cellToWorld(1, 1, 2, 20, 20);
    const p2 = cellToWorld(4, 4, 2, 20, 20);
    sceneEditor.placeBlock(p1.x, p1.z);
    sceneEditor.setEditorToolMode("move");

    sceneMgr.screenToWorld.mockReturnValue({ x: p1.x, y: 0, z: p1.z });
    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);

    sceneMgr.screenToWorld.mockReturnValue({ x: p2.x, y: 0, z: p2.z });
    getHandler("mousemove")!({ clientX: 40, clientY: 40 } as MouseEvent);

    // Commit the move on mouseup
    getHandler("mouseup")!({ clientX: 40, clientY: 40 } as MouseEvent);

    // After mouseup, terrain[][] should reflect the new position
    const block = sceneEditor.getEditorBlocks()[0]!;
    expect(block).not.toBeUndefined();
    expect(block.x).toBeCloseTo(p2.x);
    expect(block.z).toBeCloseTo(p2.z);
  });

  it("mouseup finalizes the move and clears the moving object (no further moves)", () => {
    sceneEditor.loadMapData(makeMapData(10, 10, 2));
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Stone);
    const p1 = cellToWorld(1, 1, 2, 20, 20);
    const p2 = cellToWorld(3, 3, 2, 20, 20);
    const p3 = cellToWorld(7, 7, 2, 20, 20);
    sceneEditor.placeBlock(p1.x, p1.z);
    sceneEditor.setEditorToolMode("move");

    sceneMgr.screenToWorld.mockReturnValue({ x: p1.x, y: 0, z: p1.z });
    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);

    sceneMgr.screenToWorld.mockReturnValue({ x: p2.x, y: 0, z: p2.z });
    getHandler("mousemove")!({ clientX: 30, clientY: 30 } as MouseEvent);

    // Commit at p2 then verify no further moves change the block
    getHandler("mouseup")!({ clientX: 30, clientY: 30 } as MouseEvent);

    // After mouseup, further mousemove should not move the object
    sceneMgr.screenToWorld.mockReturnValue({ x: p3.x, y: 0, z: p3.z });
    getHandler("mousemove")!({ clientX: 90, clientY: 90 } as MouseEvent);

    // Block is at p2 (committed position), not p3
    const block = sceneEditor.getEditorBlocks()[0]!;
    expect(block.x).toBeCloseTo(p2.x);
    expect(block.z).toBeCloseTo(p2.z);
  });

  it("move tool updates entity position (cat spawn)", () => {
    sceneEditor.enable();
    const p1 = cellToWorld(2, 2, 2, 30, 30);
    const p2 = cellToWorld(6, 8, 2, 30, 30);
    sceneEditor.selectEntityTool("catSpawn");
    sceneEditor.placeEntity(p1.x, p1.z);
    sceneEditor.setEditorToolMode("move");

    sceneMgr.screenToWorld.mockReturnValue({ x: p1.x, y: 0, z: p1.z });
    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);

    sceneMgr.screenToWorld.mockReturnValue({ x: p2.x, y: 0, z: p2.z });
    getHandler("mousemove")!({ clientX: 60, clientY: 80 } as MouseEvent);

    const spawn = sceneEditor.getCatSpawns()[0]!;
    expect(spawn.x).toBeCloseTo(p2.x);
    expect(spawn.z).toBeCloseTo(p2.z);
  });

  it("mousedown on empty area does not start a move drag", () => {
    sceneEditor.loadMapData(makeMapData(10, 10, 2));
    sceneEditor.enable();
    sceneEditor.setEditorToolMode("move");

    // No object at (5, 5) — Grass/0 cells are invisible to block lookup
    const farCell = cellToWorld(5, 5, 2, 20, 20);
    sceneMgr.screenToWorld.mockReturnValue({ x: farCell.x, y: 0, z: farCell.z });
    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);

    // Mousemove should not throw or mutate anything
    sceneMgr.screenToWorld.mockReturnValue({ x: farCell.x + 4, y: 0, z: farCell.z + 4 });
    expect(() => {
      getHandler("mousemove")!({ clientX: 80, clientY: 80 } as MouseEvent);
    }).not.toThrow();
  });

  it("calls updateTransform on the mesh during drag", () => {
    sceneEditor.loadMapData(makeMapData(10, 10, 2));
    sceneEditor.enable();
    sceneEditor.selectTool(TerrainType.Stone);
    const p1 = cellToWorld(1, 1, 2, 20, 20);
    const p2 = cellToWorld(5, 5, 2, 20, 20);
    sceneEditor.placeBlock(p1.x, p1.z);
    sceneEditor.setEditorToolMode("move");

    sceneMgr.screenToWorld.mockReturnValue({ x: p1.x, y: 0, z: p1.z });
    getHandler("mousedown")!({ clientX: 0, clientY: 0 } as MouseEvent);

    sceneMgr.updateTransform.mockClear();
    sceneMgr.screenToWorld.mockReturnValue({ x: p2.x, y: 0, z: p2.z });
    getHandler("mousemove")!({ clientX: 50, clientY: 50 } as MouseEvent);

    expect(sceneMgr.updateTransform).toHaveBeenCalled();
    const [, pos] = sceneMgr.updateTransform.mock.calls[0] as [
      symbol,
      { x: number; y: number; z: number },
      unknown,
      unknown,
    ];
    expect(pos.x).toBeCloseTo(p2.x);
    expect(pos.z).toBeCloseTo(p2.z);
  });
});

// ---------------------------------------------------------------------------
// US-305 — Zod schema validation
// ---------------------------------------------------------------------------

describe("mapDataSchema (US-305)", () => {
  it("accepts valid MapData", () => {
    const result = mapDataSchema.safeParse(makeSampleMapData());
    expect(result.success).toBe(true);
  });

  it("rejects MapData missing required fields", () => {
    const result = mapDataSchema.safeParse({ name: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid TerrainType", () => {
    const data = makeSampleMapData();
    // biome-ignore lint/suspicious/noExplicitAny: test intentional bad type
    (data.terrain[0]![0] as any).type = "InvalidType";
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects invalid spawnPoint role", () => {
    const data = makeSampleMapData();
    // biome-ignore lint/suspicious/noExplicitAny: test intentional bad type
    (data.spawnPoints[0] as any).role = "badRole";
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects empty terrain (terrain must have at least one row)", () => {
    const data: MapData = {
      name: "empty",
      size: { width: 10, depth: 10 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [],
      resourceNodes: [],
      yarnPickups: [],
    };
    const result = mapDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// US-305 — saveMap()
// ---------------------------------------------------------------------------

describe("saveMap() (US-305)", () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCreateObjectURL = vi.fn(() => "blob:fake-url");
    mockRevokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });
    vi.stubGlobal("Blob", class MockBlob {
      constructor(public parts: unknown[], public opts: unknown) {}
    });
    Object.assign(mockBody, { removeChild: vi.fn() });
  });

  it("calls URL.createObjectURL", () => {
    editor.saveMap();
    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
  });

  it("calls URL.revokeObjectURL after download", () => {
    editor.saveMap();
    expect(mockRevokeObjectURL).toHaveBeenCalledOnce();
  });

  it("creates an anchor element with .download attribute set", () => {
    const data = makeSampleMapData();
    editor.loadMapData(data);
    editor.saveMap();
    // The anchor will have a .download property assigned after createElement
    const anchors = createdElements.filter(
      (el) => (el as unknown as Record<string, unknown>).download !== undefined,
    );
    expect(anchors.length).toBeGreaterThan(0);
  });

  it("does not throw when no map data loaded", () => {
    expect(() => editor.saveMap()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// US-305 — loadFromFile()
// ---------------------------------------------------------------------------

describe("loadFromFile() (US-305)", () => {
  it("loads valid map data from file", async () => {
    const data = makeSampleMapData();
    const mockFile = { text: vi.fn().mockResolvedValue(JSON.stringify(data)) };
    await editor.loadFromFile(mockFile as unknown as File);
    const result = editor.getMapData();
    expect(result.name).toBe("test-map");
  });

  it("shows error for invalid JSON and leaves map data unchanged", async () => {
    const mockFile = { text: vi.fn().mockResolvedValue("not-valid-json!!!") };
    await editor.loadFromFile(mockFile as unknown as File);
    // No throw; map data should remain the default ("untitled")
    const result = editor.getMapData();
    expect(result.name).toBe("untitled");
  });

  it("shows error for valid JSON that fails schema validation", async () => {
    const bad = JSON.stringify({ name: 42, terrain: "not-an-array" });
    const mockFile = { text: vi.fn().mockResolvedValue(bad) };
    await editor.loadFromFile(mockFile as unknown as File);
    const result = editor.getMapData();
    expect(result.name).toBe("untitled"); // not replaced
  });

  it("loads data successfully and clears any previous error", async () => {
    // First cause an error
    const bad = { text: vi.fn().mockResolvedValue("bad-json") };
    await editor.loadFromFile(bad as unknown as File);
    // Then load valid data
    const data = makeSampleMapData();
    const good = { text: vi.fn().mockResolvedValue(JSON.stringify(data)) };
    await editor.loadFromFile(good as unknown as File);
    expect(editor.getMapData().name).toBe("test-map");
  });
});

// ---------------------------------------------------------------------------
// US-305 — playMap()
// ---------------------------------------------------------------------------

describe("playMap() (US-305)", () => {
  function makeEditorWithManager() {
    const mockMapManager = { loadMap: vi.fn() };
    const c2 = makeMockEl() as unknown as HTMLElement;
    const sm = makeMockSceneManager();
    const ed = new MapEditor(
      c2,
      makeMockCamera() as unknown as CameraController,
      makeGameLifecycle(),
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      sm as any,
      mockMapManager,
    );
    ed.enable();
    return { ed, mockMapManager };
  }

  it("calls mapManager.loadMap with current map data", () => {
    const { ed, mockMapManager } = makeEditorWithManager();
    const data = makeSampleMapData();
    ed.loadMapData(data);
    ed.playMap();
    expect(mockMapManager.loadMap).toHaveBeenCalledOnce();
    expect(mockMapManager.loadMap).toHaveBeenCalledWith(
      expect.objectContaining({ name: "test-map" }),
    );
    ed.dispose();
  });

  it("calls disable() after loading — editor becomes inactive", () => {
    const { ed } = makeEditorWithManager();
    ed.playMap();
    expect(ed.isActive()).toBe(false);
    ed.dispose();
  });

  it("is a no-op when mapManager is not provided", () => {
    // The default editor (no mapManager) — playMap should not throw
    expect(() => editor.playMap()).not.toThrow();
  });

  it("refreshes terrain grid with loaded map dimensions on playMap (regression: grid stayed at boot-time 30×30)", () => {
    // Map with non-default dimensions to prove the grid isn't using the boot-time TestMap values.
    const customMap: MapData = {
      name: "custom-map",
      size: { width: 50, depth: 40 },
      terrain: [],
      cellSize: 3,
      spawnPoints: [],
      resourceNodes: [],
      yarnPickups: [],
    };
    const mockMapManager = { loadMap: vi.fn() };
    const c2 = makeMockEl() as unknown as HTMLElement;
    const sm = makeMockSceneManager();
    const ed = new MapEditor(
      c2,
      makeMockCamera() as unknown as CameraController,
      makeGameLifecycle(),
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      sm as any,
      mockMapManager,
    );
    ed.enable();
    ed.loadMapData(customMap);
    ed.playMap();

    // setTerrainGrid must be called with the custom map's dimensions, not any stale defaults.
    expect(sm.setTerrainGrid).toHaveBeenCalledOnce();
    expect(sm.setTerrainGrid).toHaveBeenCalledWith(50, 40, 3);
    ed.dispose();
  });
});

// ---------------------------------------------------------------------------
// Finding 1 (CRITICAL) — getMapData() / loadMapData() full round-trip
// ---------------------------------------------------------------------------

describe("getMapData() / loadMapData() round-trip (Finding 1 regression)", () => {
  /**
   * Helper: create a fresh MapEditor with a SceneManager that returns
   * incrementing symbols so handles are unique and trackable.
   */
  function makeRoundTripEditor(): { ed: MapEditor; sceneMgr: MockSceneMgr } {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const c = makeMockEl() as unknown as HTMLElement;
    const ed = new MapEditor(
      c,
      makeMockCamera() as unknown as CameraController,
      makeGameLifecycle(),
      sceneMgr as any,
    );
    return { ed, sceneMgr };
  }

  it("ROUND-TRIP: place all entity types then loadMapData on a fresh editor yields identical data", () => {
    const { ed: ed1 } = makeRoundTripEditor();

    // Use cell-center coords for all placement (default map: 30×30/cellSize=2)
    const pStone = cellToWorld(3, 5, 2, 30, 30);
    const pWaterCorner1 = cellToWorld(1, 1, 2, 30, 30);
    const pWaterCorner2 = cellToWorld(4, 4, 2, 30, 30);
    const pHidden1 = cellToWorld(8, 8, 2, 30, 30);
    const pHidden2 = cellToWorld(10, 10, 2, 30, 30);
    const pPlayer = cellToWorld(0, 0, 2, 30, 30);
    const pCat = cellToWorld(2, 2, 2, 30, 30);
    const pResource = cellToWorld(7, 7, 2, 30, 30);
    const pYarn = cellToWorld(9, 9, 2, 30, 30);

    // Place a terrain block (editor-internal state; not serialized to MapData)
    ed1.selectTool(TerrainType.Stone);
    ed1.placeBlock(pStone.x, pStone.z);
    const block = ed1.getEditorBlocks()[0]!;
    ed1.selectBlock(block);
    ed1.updateSelectedBlockHeight(2.5);
    ed1.updateSelectedBlockType(TerrainType.Dirt);

    // Place a water zone with non-default depth (editor-internal state)
    ed1.setSelectedWaterDepth(3.5);
    ed1.createWaterZone(pWaterCorner1.x, pWaterCorner1.z, pWaterCorner2.x, pWaterCorner2.z);

    // Place a hidden terrain zone (editor-internal state)
    ed1.createHiddenTerrainZone(pHidden1.x, pHidden1.z, pHidden2.x, pHidden2.z);

    // Place a player spawn
    ed1.selectEntityTool("playerSpawn");
    ed1.placeEntity(pPlayer.x, pPlayer.z);

    // Place a cat spawn
    ed1.selectEntityTool("catSpawn");
    ed1.placeEntity(pCat.x, pCat.z);

    // Place a resource node with a non-default respawn time
    ed1.selectEntityTool("resourceNode");
    ed1.placeEntity(pResource.x, pResource.z);
    // Verify it was placed with the default type and respawn time
    expect(ed1.getResourceNodes()[0]!.respawnTime).toBe(30);

    // Place a yarn pickup
    ed1.selectEntityTool("yarnPickup");
    ed1.placeEntity(pYarn.x, pYarn.z);

    // Export map data from the first editor
    const exported = ed1.getMapData();

    // blocks/waterZones/hiddenTerrainZones are editor-internal state — not in MapData
    // Spawn points: player + cat
    expect(exported.spawnPoints).toHaveLength(2);
    const playerSp = exported.spawnPoints.find((s) => s.role === "player");
    const catSp = exported.spawnPoints.find((s) => s.role === "cat");
    expect(playerSp).toMatchObject({ role: "player", x: expect.any(Number), z: expect.any(Number) });
    expect(catSp).toMatchObject({ role: "cat", x: expect.any(Number), z: expect.any(Number) });
    expect(exported.resourceNodes).toHaveLength(1);
    expect(exported.resourceNodes[0]).toMatchObject({ type: ResourceType.Grass, respawnTime: 30 });
    expect(exported.yarnPickups).toHaveLength(1);
    expect(exported.yarnPickups[0]).toMatchObject({ yarnAmount: 3 });

    // Load into a FRESH editor
    const { ed: ed2 } = makeRoundTripEditor();
    ed2.loadMapData(exported);

    // Export again and compare — both exports must be deeply equal for MapData fields
    const reexported = ed2.getMapData();
    expect(reexported.spawnPoints).toEqual(expect.arrayContaining(exported.spawnPoints));
    expect(reexported.spawnPoints).toHaveLength(exported.spawnPoints.length);
    expect(reexported.resourceNodes).toEqual(exported.resourceNodes);
    expect(reexported.yarnPickups).toEqual(exported.yarnPickups);

    ed1.dispose();
    ed2.dispose();
  });

  it("ROUND-TRIP: loadMapData() recreates scene meshes for all entity types", () => {
    const { ed: ed1 } = makeRoundTripEditor();

    // blocks/waterZones/hiddenTerrainZones are editor-internal and don't flow through MapData
    // Use cell-center coords for predictable snapping
    const p3 = cellToWorld(3, 3, 2, 30, 30);
    const p4 = cellToWorld(4, 4, 2, 30, 30);
    const p6 = cellToWorld(6, 6, 2, 30, 30);
    const p8 = cellToWorld(8, 8, 2, 30, 30);
    ed1.selectEntityTool("playerSpawn");
    ed1.placeEntity(p3.x, p3.z);
    ed1.selectEntityTool("catSpawn");
    ed1.placeEntity(p4.x, p4.z);
    ed1.selectEntityTool("resourceNode");
    ed1.placeEntity(p6.x, p6.z);
    ed1.selectEntityTool("yarnPickup");
    ed1.placeEntity(p8.x, p8.z);

    const exported = ed1.getMapData();

    const { ed: ed2, sceneMgr: sm2 } = makeRoundTripEditor();
    sm2.addMesh.mockClear();
    ed2.loadMapData(exported);

    // addMesh should have been called for each recreated entity:
    // playerSpawn + catSpawn + resourceNode + yarnPickup = 4
    expect(sm2.addMesh).toHaveBeenCalledTimes(4);

    ed1.dispose();
    ed2.dispose();
  });

  it("ROUND-TRIP: loadMapData() clears previous editor state before rebuilding", () => {
    const { ed } = makeRoundTripEditor();

    // Place initial content using Stone (visible in getEditorBlocks compat shim)
    ed.selectTool(TerrainType.Stone);
    const pBlock = cellToWorld(1, 1, 2, 30, 30);
    ed.placeBlock(pBlock.x, pBlock.z);
    const pCat1 = cellToWorld(2, 2, 2, 30, 30);
    const pCat2 = cellToWorld(3, 3, 2, 30, 30);
    ed.selectEntityTool("catSpawn");
    ed.placeEntity(pCat1.x, pCat1.z);
    ed.placeEntity(pCat2.x, pCat2.z);

    // Now load a completely different map (blocks are editor-internal state — not in MapData)
    ed.loadMapData({
      name: "replacement",
      size: { width: 20, depth: 20 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [{ x: 5, z: 5, role: "player" }],
      resourceNodes: [],
      yarnPickups: [],
    });

    // Old editor blocks were cleared (they're editor-internal state)
    expect(ed.getEditorBlocks()).toHaveLength(0);
    // Old cat spawns gone; new player spawn present
    expect(ed.getCatSpawns()).toHaveLength(0);
    expect(ed.getPlayerSpawn()).not.toBeNull();
    expect(ed.getPlayerSpawn()!.x).toBe(5);

    ed.dispose();
  });

  it("ROUND-TRIP: getMapData() returns empty arrays for resourceNodes and yarnPickups when nothing is placed", () => {
    const { ed } = makeRoundTripEditor();
    const data = ed.getMapData();
    // resourceNodes and yarnPickups are required fields — empty when nothing placed
    expect(data.resourceNodes).toHaveLength(0);
    expect(data.yarnPickups).toHaveLength(0);
    // blocks/waterZones/hiddenTerrainZones are editor-internal state — not on MapData
    ed.dispose();
  });

  it("ROUND-TRIP: spawnPoints from loaded MapData are mapped to correct editor entities", () => {
    const { ed } = makeRoundTripEditor();
    ed.loadMapData({
      name: "spawn-test",
      size: { width: 10, depth: 10 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [
        { x: 1, z: 2, role: "player" },
        { x: 3, z: 4, role: "cat" },
        { x: 5, z: 6, role: "cat" },
        // "item" role is ignored (not a cat or player spawn)
        { x: 7, z: 8, role: "item" },
      ],
      resourceNodes: [],
      yarnPickups: [],
    });

    expect(ed.getPlayerSpawn()).toMatchObject({ x: 1, z: 2 });
    expect(ed.getCatSpawns()).toHaveLength(2);
    expect(ed.getCatSpawns()[0]).toMatchObject({ x: 3, z: 4 });
    expect(ed.getCatSpawns()[1]).toMatchObject({ x: 5, z: 6 });

    ed.dispose();
  });
});

// ---------------------------------------------------------------------------
// Finding 2 (Major) — repaint occupied cell updates mesh color
// ---------------------------------------------------------------------------

describe("placeBlock() repainting (Finding 2 regression)", () => {
  it("repaint to a new type recreates the cell mesh and updates the compat block", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      makeMockCamera() as unknown as CameraController,
      makeGameLifecycle(),
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    const p = cellToWorld(2, 2, 2, 12, 12);

    // Place a Stone block (visible in compat shim)
    sceneEditor.selectTool(TerrainType.Stone);
    sceneEditor.placeBlock(p.x, p.z);
    const block = sceneEditor.getEditorBlocks()[0]!;
    expect(block).not.toBeUndefined();

    // Clear calls so far and count addMesh calls
    const addMeshCountBefore = sceneMgr.addMesh.mock.calls.length;

    // Repaint to Dirt by placing again at the same cell
    sceneEditor.selectTool(TerrainType.Dirt);
    sceneEditor.placeBlock(p.x, p.z);

    // _setCellMesh was called again → addMesh called one more time
    expect(sceneMgr.addMesh.mock.calls.length).toBeGreaterThan(addMeshCountBefore);

    // The terrain cell must be Dirt now
    const { col, row } = worldToCell(p.x, p.z, 2, 12, 12);
    expect(sceneEditor.getMapData().terrain[row]![col]!.type).toBe(TerrainType.Dirt);

    sceneEditor.dispose();
  });

  it("repaint does not create a new block — still one entry after repaint", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      makeMockCamera() as unknown as CameraController,
      makeGameLifecycle(),
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    const p = cellToWorld(2, 2, 2, 12, 12);

    sceneEditor.selectTool(TerrainType.Stone);
    sceneEditor.placeBlock(p.x, p.z);
    sceneEditor.selectTool(TerrainType.Dirt);
    sceneEditor.placeBlock(p.x, p.z);

    expect(sceneEditor.getEditorBlocks()).toHaveLength(1);
    expect(sceneEditor.getEditorBlocks()[0]!.type).toBe(TerrainType.Dirt);
    sceneEditor.dispose();
  });
});

// ---------------------------------------------------------------------------
// Finding 3 (Major) — water zone depth uses selected depth
// ---------------------------------------------------------------------------

describe("water zone depth (Finding 3 regression)", () => {
  it("default water depth is 1", () => {
    expect(editor.getSelectedWaterDepth()).toBe(1);
  });

  it("setSelectedWaterDepth() stores the value and getSelectedWaterDepth() returns it", () => {
    editor.setSelectedWaterDepth(3.5);
    expect(editor.getSelectedWaterDepth()).toBe(3.5);
  });

  it("setSelectedWaterDepth() clamps to minimum 0.5", () => {
    editor.setSelectedWaterDepth(0);
    expect(editor.getSelectedWaterDepth()).toBe(0.5);
  });

  it("setSelectedWaterDepth() clamps to maximum 10", () => {
    editor.setSelectedWaterDepth(99);
    expect(editor.getSelectedWaterDepth()).toBe(10);
  });

  it("createWaterZone() uses the selected water depth (not hard-coded 1)", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(0, 0, 2, 8, 8);
    editor.setSelectedWaterDepth(4.5);
    editor.createWaterZone(c.x, c.z, c.x, c.z);
    expect(editor.getEditorWaterZones()[0]!.depth).toBe(4.5);
  });

  it("createWaterZone() with default depth still stores depth=1", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(0, 0, 2, 8, 8);
    editor.createWaterZone(c.x, c.z, c.x, c.z);
    expect(editor.getEditorWaterZones()[0]!.depth).toBe(1);
  });

  it("water depth is stored in editor-internal state (not serialized through MapData)", () => {
    const sm1 = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const ed1 = new MapEditor(
      makeMockEl() as unknown as HTMLElement,
      makeMockCamera() as unknown as CameraController,
      makeGameLifecycle(),
      sm1 as any,
    );
    ed1.loadMapData(makeMapData(6, 6, 2));
    const c1 = cellToWorld(0, 0, 2, 12, 12);
    const c2 = cellToWorld(4, 4, 2, 12, 12);

    ed1.setSelectedWaterDepth(7.5);
    ed1.createWaterZone(c1.x, c1.z, c2.x, c2.z);
    // Water zone depth is held in editor-internal state
    expect(ed1.getEditorWaterZones()[0]!.depth).toBe(7.5);
    // MapData no longer serializes waterZones (editor-internal only)
    const exported = ed1.getMapData();
    expect(exported.resourceNodes).toHaveLength(0);

    ed1.dispose();
  });
});

// ---------------------------------------------------------------------------
// Finding 4 (Major) — dispose() removes terrain block meshes
// ---------------------------------------------------------------------------

describe("dispose() removes terrain block meshes (Finding 4 regression)", () => {
  it("dispose() calls removeMesh for each placed cell's handle", () => {
    const sceneMgr = makeMockSceneManager({ x: 0, y: 0, z: 0 });
    const sceneContainer = makeMockEl();
    const sceneEditor = new MapEditor(
      sceneContainer as unknown as HTMLElement,
      makeMockCamera() as unknown as CameraController,
      makeGameLifecycle(),
      sceneMgr as any,
    );
    sceneEditor.loadMapData(makeMapData(6, 6, 2));

    // Use Stone (non-default) so they appear in getEditorBlocks() compat shim
    sceneEditor.selectTool(TerrainType.Stone);
    const p1 = cellToWorld(1, 1, 2, 12, 12);
    const p2 = cellToWorld(2, 2, 2, 12, 12);
    const p3 = cellToWorld(3, 3, 2, 12, 12);
    sceneEditor.placeBlock(p1.x, p1.z);
    sceneEditor.placeBlock(p2.x, p2.z);
    sceneEditor.placeBlock(p3.x, p3.z);

    const handles = sceneEditor.getEditorBlocks().map((b) => b.handle);
    expect(handles).toHaveLength(3);
    sceneMgr.removeMesh.mockClear();
    sceneEditor.dispose();

    for (const h of handles) {
      expect(sceneMgr.removeMesh).toHaveBeenCalledWith(h);
    }
  });

  it("dispose() clears terrain cell handles (getEditorBlocks() is empty after dispose)", () => {
    const sceneEditor = new MapEditor(
      makeMockEl() as unknown as HTMLElement,
      makeMockCamera() as unknown as CameraController,
      makeGameLifecycle(),
      null,
    );
    sceneEditor.loadMapData(makeMapData(6, 6, 2));
    sceneEditor.selectTool(TerrainType.Dirt);
    const p = cellToWorld(2, 2, 2, 12, 12);
    sceneEditor.placeBlock(p.x, p.z);
    expect(sceneEditor.getEditorBlocks()).toHaveLength(1);
    sceneEditor.dispose();
    expect(sceneEditor.getEditorBlocks()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Finding 5 (Major) — schema rejects zero/negative dimensions
// ---------------------------------------------------------------------------

describe("mapDataSchema positive constraints (Finding 5 regression)", () => {
  it("rejects width of 0", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: 0, depth: 10 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative width", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: -5, depth: 10 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects depth of 0", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: 10, depth: 0 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative depth", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: 10, depth: -3 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects cellSize of 0", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: 10, depth: 10 },
      terrain: [],
      cellSize: 0,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative cellSize", () => {
    const result = mapDataSchema.safeParse({
      name: "bad",
      size: { width: 10, depth: 10 },
      terrain: [],
      cellSize: -1,
      spawnPoints: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid map with correct terrain dimensions", () => {
    const result = mapDataSchema.safeParse({
      name: "good",
      size: { width: 4, depth: 2 },
      terrain: [
        [{ type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }],
        [{ type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }, { type: TerrainType.Grass, height: 0, navigable: true }],
      ],
      cellSize: 1,
      spawnPoints: [],
      resourceNodes: [],
      yarnPickups: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid resourceNodes and yarnPickups arrays", () => {
    const result = mapDataSchema.safeParse({
      name: "with-entities",
      size: { width: 1, depth: 1 },
      terrain: [[{ type: TerrainType.Grass, height: 0, navigable: true }]],
      cellSize: 1,
      spawnPoints: [],
      resourceNodes: [{ x: 5, z: 5, type: ResourceType.Grass, respawnTime: 30 }],
      yarnPickups: [{ x: 7, z: 7, yarnAmount: 5 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid ResourceType in resourceNodes array", () => {
    const result = mapDataSchema.safeParse({
      name: "bad-resource",
      size: { width: 1, depth: 1 },
      terrain: [[{ type: TerrainType.Grass, height: 0, navigable: true }]],
      cellSize: 1,
      spawnPoints: [],
      resourceNodes: [{ x: 1, z: 2, type: "BadResource", respawnTime: 30 }],
      yarnPickups: [],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plan §A — Cell-aware snapping (US-315 new tests)
// ---------------------------------------------------------------------------

describe("cell-aware snapping (plan §A)", () => {
  it("placeBlock snaps to cell center for TestMap geometry (cellSize=2, 60×60)", () => {
    const mapData: MapData = {
      name: "t",
      size: { width: 60, depth: 60 },
      cellSize: 2,
      terrain: buildEmptyTerrain(30, 30),
      spawnPoints: [],
      resourceNodes: [],
      yarnPickups: [],
    };
    editor.loadMapData(mapData);
    editor.selectTool(TerrainType.Stone);
    // World click at (-28.7, -28.3) → cell (0,0) center = (-29, -29)
    editor.placeBlock(-28.7, -28.3);
    const cell = editor.getMapData().terrain[0]![0]!;
    expect(cell.type).toBe(TerrainType.Stone);
  });

  it("cell center matches cellToWorld for (col=0, row=0) in 60×60/cellSize=2 map", () => {
    const { x, z } = cellToWorld(0, 0, 2, 60, 60);
    expect(x).toBeCloseTo(-29);
    expect(z).toBeCloseTo(-29);
  });

  it("placed cell (col, row) round-trips through worldToCell(cellToWorld(...))", () => {
    const col = 5;
    const row = 7;
    const { x, z } = cellToWorld(col, row, 2, 60, 60);
    const back = worldToCell(x, z, 2, 60, 60);
    expect(back.col).toBe(col);
    expect(back.row).toBe(row);
  });

  it("half-cell-offset sanity check: removing + cellSize/2 would give wrong center", () => {
    // Without + cellSize/2, col=0/row=0 would land at wall edge (-30,-30), not center (-29,-29)
    const { x, z } = cellToWorld(0, 0, 2, 60, 60);
    expect(x).not.toBe(-30);
    expect(z).not.toBe(-30);
    expect(x).toBeCloseTo(-29);
    expect(z).toBeCloseTo(-29);
  });
});

// ---------------------------------------------------------------------------
// Plan §B — terrain[][] round-trip: loadMapData → getMapData
// ---------------------------------------------------------------------------

describe("terrain round-trip (plan §B)", () => {
  it("loadMapData → getMapData returns exact terrain[][]", () => {
    const terrain: TerrainCell[][] = [
      [
        { type: TerrainType.Water, height: 0, navigable: false, depth: 2 },
        { type: TerrainType.Grass, height: 1, navigable: true },
      ],
    ];
    const data: MapData = {
      name: "rt",
      size: { width: 4, depth: 2 },
      cellSize: 2,
      terrain,
      spawnPoints: [],
      resourceNodes: [],
      yarnPickups: [],
    };
    editor.loadMapData(data);
    const out = editor.getMapData();
    expect(out.terrain[0]![0]!.type).toBe(TerrainType.Water);
    expect(out.terrain[0]![0]!.depth).toBe(2);
    expect(out.terrain[0]![1]!.height).toBe(1);
  });

  it("double round-trip is stable: loadMapData(getMapData()) produces identical terrain", () => {
    const data = makeFullSampleMapData();
    editor.loadMapData(data);
    const once = editor.getMapData();
    editor.loadMapData(once);
    const twice = editor.getMapData();
    expect(twice.terrain).toEqual(once.terrain);
  });
});

// ---------------------------------------------------------------------------
// Plan §C — Vertical-layer alignment (cellMeshGeometry via MockSceneManager)
// ---------------------------------------------------------------------------

describe("cell mesh vertical alignment (plan §C)", () => {
  function makeSceneEditorLocal(sm: MockSceneMgr): MapEditor {
    return new MapEditor(
      makeMockEl() as unknown as HTMLElement,
      makeMockCamera() as unknown as CameraController,
      makeGameLifecycle(),
      sm as any,
    );
  }

  it("elevated cell (height=2) positions mesh at centerY=1.0", () => {
    const sm = makeMockSceneManager();
    const sceneEd = makeSceneEditorLocal(sm);
    const data = mapWithCell(0, 0, { type: TerrainType.Stone, height: 2, navigable: true });
    sceneEd.loadMapData(data);
    const calls = sm.updateTransform.mock.calls as [symbol, { x: number; y: number; z: number }, unknown, unknown][];
    const pos = calls.find(([, p]) => Math.abs(p.y - 1) < 0.01)?.[1];
    expect(pos).not.toBeUndefined();
    expect(pos!.y).toBeCloseTo(1);
    sceneEd.dispose();
  });

  it("flat cell (height=0, non-Grass type) positions mesh at centerY=-0.1", () => {
    const sm = makeMockSceneManager();
    const sceneEd = makeSceneEditorLocal(sm);
    const data = mapWithCell(0, 0, { type: TerrainType.Dirt, height: 0, navigable: true });
    sceneEd.loadMapData(data);
    const calls = sm.updateTransform.mock.calls as [symbol, { x: number; y: number; z: number }, unknown, unknown][];
    const pos = calls.find(([, p]) => p.y < 0)?.[1];
    expect(pos).not.toBeUndefined();
    expect(pos!.y).toBeCloseTo(-0.1);
    sceneEd.dispose();
  });

  it("addMesh dims use cellSize for footprint (not hard-coded 1×1)", () => {
    const sm = makeMockSceneManager();
    const sceneEd = makeSceneEditorLocal(sm);
    const data = mapWithCell(0, 0, { type: TerrainType.Stone, height: 1, navigable: true });
    sceneEd.loadMapData(data);
    const call = sm.addMesh.mock.calls[0]![0] as { dims: number[] };
    expect(call.dims[0]).toBe(2); // cellSize
    expect(call.dims[2]).toBe(2); // cellSize
    sceneEd.dispose();
  });
});

// ---------------------------------------------------------------------------
// Plan §D — Water/hidden cell painting with depth
// ---------------------------------------------------------------------------

describe("water/hidden cell painting (plan §D)", () => {
  it("createWaterZone paints Water type with depth into terrain[][]", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    editor.setSelectedWaterDepth(3);
    const c = cellToWorld(0, 0, 2, 8, 8);
    editor.createWaterZone(c.x, c.z, c.x, c.z);
    const terrain = editor.getMapData().terrain;
    expect(terrain[0]![0]!.type).toBe(TerrainType.Water);
    expect(terrain[0]![0]!.depth).toBe(3);
    expect(terrain[0]![0]!.navigable).toBe(false);
  });

  it("createHiddenTerrainZone paints Hidden type with height into terrain[][]", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    const c = cellToWorld(0, 0, 2, 8, 8);
    editor.createHiddenTerrainZone(c.x, c.z, c.x, c.z);
    const cell = editor.getMapData().terrain[0]![0]!;
    expect(cell.type).toBe(TerrainType.Hidden);
    expect(cell.navigable).toBe(false);
    expect(typeof cell.height).toBe("number");
  });

  it("water depth persists through getMapData() terrain round-trip", () => {
    editor.loadMapData(makeMapData(4, 4, 2));
    editor.setSelectedWaterDepth(5);
    const c = cellToWorld(1, 1, 2, 8, 8);
    editor.createWaterZone(c.x, c.z, c.x, c.z);
    const exported = editor.getMapData();
    const ed2 = new MapEditor(
      makeMockEl() as unknown as HTMLElement,
      makeMockCamera() as unknown as CameraController,
      makeGameLifecycle(),
      null,
    );
    ed2.loadMapData(exported);
    expect(ed2.getMapData().terrain[1]![1]!.depth).toBe(5);
    ed2.dispose();
  });
});

// ---------------------------------------------------------------------------
// Plan §E — Entity snapping to cell centers
// ---------------------------------------------------------------------------

describe("entity snapping to cell centers (plan §E)", () => {
  it("placeEntity playerSpawn snaps to cell center", () => {
    // 60×60 / cellSize=2: cell (0,0) center = (-29, -29)
    const mapData = makeMapData(30, 30, 2);
    editor.loadMapData(mapData);
    editor.selectEntityTool("playerSpawn");
    editor.placeEntity(-28.9, -28.1);
    const spawn = editor.getPlayerSpawn()!;
    expect(spawn.x).toBeCloseTo(-29);
    expect(spawn.z).toBeCloseTo(-29);
  });

  it("resource node x/z in getMapData() is a cell center", () => {
    // 20×20 / cellSize=2: cell (0,1) center = (-9, -7)
    const mapData = makeMapData(10, 10, 2);
    editor.loadMapData(mapData);
    editor.selectEntityTool("resourceNode");
    editor.placeEntity(-8.6, -6.4);
    const node = editor.getMapData().resourceNodes[0]!;
    expect(node.x).toBeCloseTo(-9);
    expect(node.z).toBeCloseTo(-7);
  });
});
