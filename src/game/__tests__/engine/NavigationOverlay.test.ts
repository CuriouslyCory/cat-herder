import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NavigationOverlay } from "~/game/ui/NavigationOverlay";
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
  width?: number;
  height?: number;
  getContext: ReturnType<typeof vi.fn>;
}

function makeMockCtx2d() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillText: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "" as CanvasTextAlign,
  };
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
    getContext: vi.fn(() => makeMockCtx2d()),
  };
}

// ---------------------------------------------------------------------------
// Mock World and MapManager
// ---------------------------------------------------------------------------

function makeMapManager(mapData: MapData | null = null) {
  return { getMapData: vi.fn(() => mapData) };
}

function makeWorld(entities: number[] = []) {
  return {
    query: vi.fn(() => entities),
    getComponent: vi.fn(() => null),
  };
}

function makeSampleMapData(): MapData {
  return {
    name: "test",
    size: { width: 10, depth: 10 },
    terrain: [
      [
        { type: TerrainType.Grass, height: 1, navigable: true },
        { type: TerrainType.Dirt, height: 1, navigable: true },
      ],
      [
        { type: TerrainType.Stone, height: 1, navigable: true },
        { type: TerrainType.Water, height: 0, navigable: false },
      ],
    ],
    cellSize: 5,
    spawnPoints: [{ x: 0, z: 0, role: "player" }],
    resourceNodes: [],
    yarnPickups: [],
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let createdElements: MockEl[];
let hostCanvas: MockEl;
let mockBody: { appendChild: ReturnType<typeof vi.fn> };
let docMock: {
  createElement: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  body: { appendChild: ReturnType<typeof vi.fn> };
};
let overlay: NavigationOverlay;

function getContainer(): MockEl {
  return createdElements[0]!;
}

function getCanvas(): MockEl {
  return createdElements[1]!;
}

function getCaptureKeydownHandler():
  | ((e: Partial<KeyboardEvent>) => void)
  | undefined {
  return (docMock.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
    (c: unknown[]) => c[0] === "keydown" && c[2] === true,
  )?.[1] as ((e: Partial<KeyboardEvent>) => void) | undefined;
}

beforeEach(() => {
  createdElements = [];
  mockBody = { appendChild: vi.fn() };

  docMock = {
    createElement: vi.fn((): MockEl => {
      const el = makeMockEl();
      createdElements.push(el);
      return el;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    body: mockBody,
  };

  vi.stubGlobal("document", docMock);

  hostCanvas = makeMockEl();
  // Simulate canvas.parentElement so the overlay appends to it
  const parentEl = makeMockEl();
  (hostCanvas as MockEl).parentElement = parentEl;

  overlay = new NavigationOverlay(
    hostCanvas as unknown as HTMLCanvasElement,
    makeWorld(),
    makeMapManager(),
    () => null,
  );
});

afterEach(() => {
  overlay.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe("initial state", () => {
  it("isVisible() returns false initially", () => {
    expect(overlay.isVisible()).toBe(false);
  });

  it("builds container div (createdElements[0]) appended to parent", () => {
    const parent = hostCanvas.parentElement as MockEl;
    expect(parent.appendChild).toHaveBeenCalledWith(getContainer());
  });

  it("builds a canvas element (createdElements[1]) inside the container", () => {
    expect(getContainer().appendChild).toHaveBeenCalledWith(getCanvas());
  });

  it("container starts hidden (display:none not set to flex)", () => {
    expect(getContainer().style.display).not.toBe("flex");
  });

  it("registers a capture-phase keydown listener on document", () => {
    const handler = getCaptureKeydownHandler();
    expect(handler).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// open() / close() / toggle()
// ---------------------------------------------------------------------------

describe("open()", () => {
  it("sets isVisible() to true", () => {
    overlay.open();
    expect(overlay.isVisible()).toBe(true);
  });

  it("sets container display to flex", () => {
    overlay.open();
    expect(getContainer().style.display).toBe("flex");
  });
});

describe("close()", () => {
  it("sets isVisible() to false after open", () => {
    overlay.open();
    overlay.close();
    expect(overlay.isVisible()).toBe(false);
  });

  it("sets container display to none", () => {
    overlay.open();
    overlay.close();
    expect(getContainer().style.display).toBe("none");
  });
});

describe("toggle()", () => {
  it("opens when closed", () => {
    overlay.toggle();
    expect(overlay.isVisible()).toBe(true);
  });

  it("closes when open", () => {
    overlay.open();
    overlay.toggle();
    expect(overlay.isVisible()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Keyboard input — capture handler
// ---------------------------------------------------------------------------

describe("capture keydown handler", () => {
  it("does nothing when overlay is not visible", () => {
    const handler = getCaptureKeydownHandler()!;
    const event = {
      code: "KeyM",
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    handler(event);
    expect(overlay.isVisible()).toBe(false);
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it("stops propagation on all keys while visible", () => {
    overlay.open();
    const handler = getCaptureKeydownHandler()!;
    const event = {
      code: "KeyW",
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    handler(event);
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(overlay.isVisible()).toBe(true); // W doesn't close
  });

  it("closes on M key while visible", () => {
    overlay.open();
    const handler = getCaptureKeydownHandler()!;
    const event = {
      code: "KeyM",
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    handler(event);
    expect(overlay.isVisible()).toBe(false);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("closes on Escape while visible", () => {
    overlay.open();
    const handler = getCaptureKeydownHandler()!;
    const event = {
      code: "Escape",
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    handler(event);
    expect(overlay.isVisible()).toBe(false);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// worldToPixel — coordinate mapping
// ---------------------------------------------------------------------------

describe("worldToPixel()", () => {
  const mapData: MapData = {
    name: "test",
    size: { width: 100, depth: 100 },
    terrain: [],
    cellSize: 1,
    spawnPoints: [],
    resourceNodes: [],
    yarnPickups: [],
  };

  it("maps world center (0,0) to canvas center (200,200)", () => {
    const { px, py } = overlay.worldToPixel(0, 0, mapData);
    expect(px).toBeCloseTo(200);
    expect(py).toBeCloseTo(200);
  });

  it("maps top-left corner (-50, -50) to (0, 0)", () => {
    const { px, py } = overlay.worldToPixel(-50, -50, mapData);
    expect(px).toBeCloseTo(0);
    expect(py).toBeCloseTo(0);
  });

  it("maps bottom-right corner (50, 50) to (400, 400)", () => {
    const { px, py } = overlay.worldToPixel(50, 50, mapData);
    expect(px).toBeCloseTo(400);
    expect(py).toBeCloseTo(400);
  });

  it("maps quarter-point (-25, -25) to (100, 100)", () => {
    const { px, py } = overlay.worldToPixel(-25, -25, mapData);
    expect(px).toBeCloseTo(100);
    expect(py).toBeCloseTo(100);
  });

  it("scales correctly for non-square maps", () => {
    const rectMap: MapData = {
      name: "rect",
      size: { width: 200, depth: 50 },
      terrain: [],
      cellSize: 1,
      spawnPoints: [],
      resourceNodes: [],
      yarnPickups: [],
    };
    // World x=0 (center) → px=200; world z=0 (center) → py=200
    const { px, py } = overlay.worldToPixel(0, 0, rectMap);
    expect(px).toBeCloseTo(200);
    expect(py).toBeCloseTo(200);
  });
});

// ---------------------------------------------------------------------------
// Game does not pause when overlay opens
// ---------------------------------------------------------------------------

describe("does not pause game", () => {
  it("open() does not call any external pause function", () => {
    // NavigationOverlay has no reference to game lifecycle — just verify that
    // opening it doesn't throw and leaves isVisible() true.
    expect(() => overlay.open()).not.toThrow();
    expect(overlay.isVisible()).toBe(true);
  });

  it("update() re-renders without toggling visibility", () => {
    overlay.open();
    overlay.update(0.016);
    expect(overlay.isVisible()).toBe(true); // still open after update
  });

  it("update() while closed does not open the overlay", () => {
    overlay.update(0.016);
    expect(overlay.isVisible()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rendering with map data — terrain coverage
// ---------------------------------------------------------------------------

describe("rendering with map data", () => {
  it("calls getContext('2d') on the canvas when open() is called", () => {
    const mapManager = makeMapManager(makeSampleMapData());
    const world = makeWorld();
    const o = new NavigationOverlay(
      hostCanvas as unknown as HTMLCanvasElement,
      world,
      mapManager,
      () => null,
    );
    o.open();
    // beforeEach overlay uses indices 0 (div) + 1 (canvas);
    // second instance uses indices 2 (div) + 3 (canvas).
    const canvas = createdElements[3];
    expect(canvas?.getContext).toHaveBeenCalledWith("2d");
    o.dispose();
  });

  it("renders hidden terrain cells by skipping them (no fillRect for Hidden)", () => {
    const mapWithHidden: MapData = {
      name: "h",
      size: { width: 10, depth: 5 },
      terrain: [[{ type: TerrainType.Hidden, height: 1, navigable: false }]],
      cellSize: 10,
      spawnPoints: [],
      resourceNodes: [],
      yarnPickups: [],
    };
    const mapManager = makeMapManager(mapWithHidden);
    const world = makeWorld();
    const o = new NavigationOverlay(
      hostCanvas as unknown as HTMLCanvasElement,
      world,
      mapManager,
      () => null,
    );
    // second instance: index 2 = div, index 3 = canvas
    const canvas = createdElements[3]!;
    const ctx = makeMockCtx2d();
    canvas.getContext = vi.fn(() => ctx);
    o.open();
    // Background fillRect fires; terrain fillRect should NOT fire for Hidden cell.
    // The background fillRect uses full-canvas dimensions (0,0,400,400).
    const terrainCalls = ctx.fillRect.mock.calls.filter(
      (c: number[]) => c[2] !== 400, // exclude the 400-wide background call
    );
    expect(terrainCalls).toHaveLength(0);
    o.dispose();
  });
});

// ---------------------------------------------------------------------------
// dispose()
// ---------------------------------------------------------------------------

describe("dispose()", () => {
  it("removes the capture keydown listener from document", () => {
    const handler = getCaptureKeydownHandler()!;
    overlay.dispose();
    expect(docMock.removeEventListener).toHaveBeenCalledWith(
      "keydown",
      handler,
      true,
    );
  });

  it("removes the container from the DOM", () => {
    const container = getContainer();
    overlay.dispose();
    expect(container.remove).toHaveBeenCalled();
  });

  it("isVisible() returns false after dispose", () => {
    overlay.open();
    overlay.dispose();
    expect(overlay.isVisible()).toBe(false);
  });
});
