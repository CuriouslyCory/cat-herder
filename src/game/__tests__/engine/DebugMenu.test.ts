import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GameState } from "~/game/engine/GameState";
import { EventBus } from "~/game/engine/EventBus";
import { DebugMenu } from "~/game/ui/DebugMenu";
import { World } from "~/game/ecs/World";
import { CONFIG } from "~/game/config";
import type { GameConfig } from "~/game/config";
import type { GameEvent } from "~/game/types";
import { CatType } from "~/game/types";
import type { Vec3 } from "~/game/types";
import type { CatCompanionManager } from "~/game/cats/CatCompanionManager";
import type { Entity } from "~/game/ecs/Entity";

// ---------------------------------------------------------------------------
// Minimal DOM stubs — node test env has no document/window
// ---------------------------------------------------------------------------

function makeMockEl() {
  return {
    style: { cssText: "", display: "" } as Record<string, string>,
    textContent: "",
    innerHTML: "",
    value: "0",
    checked: false,
    min: "",
    max: "",
    step: "",
    type: "",
    placeholder: "",
    disabled: false,
    dataset: {} as Record<string, string>,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    appendChild: vi.fn(),
    remove: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeRuntimeCfg(): GameConfig {
  return { ...CONFIG, visual: { ...CONFIG.visual } };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let gameState: GameState;
let eventBus: EventBus;
let world: World;
let runtimeCfg: GameConfig;
let container: ReturnType<typeof makeMockEl>;
let menu: DebugMenu;
let emittedEvents: GameEvent[];

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubGlobal("document", {
    createElement: vi.fn(() => makeMockEl()),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getElementById: vi.fn(() => null),
    head: { appendChild: vi.fn() },
  });

  gameState = new GameState(10);
  eventBus = new EventBus();
  world = new World();
  runtimeCfg = makeRuntimeCfg();
  container = makeMockEl();
  emittedEvents = [];

  eventBus.on("debug:value-changed", (e) => emittedEvents.push(e));

  menu = new DebugMenu(
    container as unknown as HTMLElement,
    gameState,
    eventBus,
    runtimeCfg,
    world,
  );
});

afterEach(() => {
  menu.dispose();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Toggle open/close
// ---------------------------------------------------------------------------

describe("toggle()", () => {
  it("starts closed", () => {
    expect(menu.isOpen).toBe(false);
  });

  it("opens menu on first toggle", () => {
    menu.toggle();
    expect(menu.isOpen).toBe(true);
  });

  it("closes menu on second toggle", () => {
    menu.toggle();
    menu.toggle();
    expect(menu.isOpen).toBe(false);
  });

  it("emits debug:toggled with visible=true when opening", () => {
    const toggled: GameEvent[] = [];
    eventBus.on("debug:toggled", (e) => toggled.push(e));
    menu.toggle();
    expect(toggled).toContainEqual(expect.objectContaining({ type: "debug:toggled", visible: true }));
  });

  it("emits debug:toggled with visible=false when closing", () => {
    const toggled: GameEvent[] = [];
    eventBus.on("debug:toggled", (e) => toggled.push(e));
    menu.toggle();
    menu.toggle();
    expect(toggled[1]).toMatchObject({ type: "debug:toggled", visible: false });
  });
});

// ---------------------------------------------------------------------------
// applyLevel
// ---------------------------------------------------------------------------

describe("applyLevel()", () => {
  it("sets player.stats.level in GameState", () => {
    menu.applyLevel(5);
    expect(gameState.get<number>("player.stats.level")).toBe(5);
  });

  it("clamps level to 0..10", () => {
    menu.applyLevel(-3);
    expect(gameState.get<number>("player.stats.level")).toBe(0);
    menu.applyLevel(99);
    expect(gameState.get<number>("player.stats.level")).toBe(10);
  });

  it("emits debug:value-changed with player.stats.level key", () => {
    menu.applyLevel(7);
    expect(emittedEvents).toContainEqual(
      expect.objectContaining({ type: "debug:value-changed", key: "player.stats.level", value: 7 }),
    );
  });
});

// ---------------------------------------------------------------------------
// applyHealth
// ---------------------------------------------------------------------------

describe("applyHealth()", () => {
  it("sets player.stats.health in GameState", () => {
    menu.applyHealth(6);
    expect(gameState.get<number>("player.stats.health")).toBe(6);
  });

  it("clamps health to 0..maxHealth", () => {
    menu.applyHealth(-1);
    expect(gameState.get<number>("player.stats.health")).toBe(0);
    menu.applyHealth(999);
    const maxHealth = gameState.get<number>("player.stats.maxHealth");
    expect(gameState.get<number>("player.stats.health")).toBe(maxHealth);
  });

  it("emits debug:value-changed with player.stats.health key", () => {
    menu.applyHealth(4);
    expect(emittedEvents).toContainEqual(
      expect.objectContaining({ type: "debug:value-changed", key: "player.stats.health", value: 4 }),
    );
  });
});

// ---------------------------------------------------------------------------
// applyYarn
// ---------------------------------------------------------------------------

describe("applyYarn()", () => {
  it("sets player.yarn in GameState", () => {
    menu.applyYarn(42);
    expect(gameState.get<number>("player.yarn")).toBe(42);
  });

  it("clamps yarn to 0..99", () => {
    menu.applyYarn(-5);
    expect(gameState.get<number>("player.yarn")).toBe(0);
    menu.applyYarn(200);
    expect(gameState.get<number>("player.yarn")).toBe(99);
  });

  it("emits debug:value-changed with player.yarn key", () => {
    menu.applyYarn(25);
    expect(emittedEvents).toContainEqual(
      expect.objectContaining({ type: "debug:value-changed", key: "player.yarn", value: 25 }),
    );
  });
});

// ---------------------------------------------------------------------------
// applyTeleport
// ---------------------------------------------------------------------------

describe("applyTeleport()", () => {
  it("updates player.position in GameState", () => {
    menu.applyTeleport(10, -5);
    const pos = gameState.get<{ x: number; y: number; z: number }>("player.position");
    expect(pos.x).toBe(10);
    expect(pos.z).toBe(-5);
  });

  it("calls the teleportPlayer callback when provided", () => {
    const teleportCb = vi.fn();
    const menuWithCb = new DebugMenu(
      container as unknown as HTMLElement,
      gameState,
      eventBus,
      runtimeCfg,
      world,
      teleportCb,
    );
    menuWithCb.applyTeleport(3, 7);
    expect(teleportCb).toHaveBeenCalledWith(3, 7);
    menuWithCb.dispose();
  });

  it("emits debug:value-changed with player.position key", () => {
    menu.applyTeleport(1, 2);
    expect(emittedEvents).toContainEqual(
      expect.objectContaining({ type: "debug:value-changed", key: "player.position" }),
    );
  });
});

// ---------------------------------------------------------------------------
// applySpeedMultiplier
// ---------------------------------------------------------------------------

describe("applySpeedMultiplier()", () => {
  it("modifies runtimeCfg.walkSpeed by the multiplier", () => {
    menu.applySpeedMultiplier(2.0);
    expect(runtimeCfg.walkSpeed).toBeCloseTo(CONFIG.walkSpeed * 2.0);
  });

  it("clamps multiplier to 0.5..3.0", () => {
    menu.applySpeedMultiplier(0.1);
    expect(runtimeCfg.walkSpeed).toBeCloseTo(CONFIG.walkSpeed * 0.5);
    menu.applySpeedMultiplier(5.0);
    expect(runtimeCfg.walkSpeed).toBeCloseTo(CONFIG.walkSpeed * 3.0);
  });

  it("stores speedMultiplier in debugState (not GameState)", () => {
    menu.applySpeedMultiplier(1.5);
    expect(menu.debugState.speedMultiplier).toBe(1.5);
  });

  it("emits debug:value-changed with runtimeConfig.walkSpeed key", () => {
    menu.applySpeedMultiplier(2.0);
    expect(emittedEvents).toContainEqual(
      expect.objectContaining({ type: "debug:value-changed", key: "runtimeConfig.walkSpeed" }),
    );
  });
});

// ---------------------------------------------------------------------------
// applyGodMode
// ---------------------------------------------------------------------------

describe("applyGodMode()", () => {
  it("stores godMode in debugState", () => {
    menu.applyGodMode(true);
    expect(menu.debugState.godMode).toBe(true);
    menu.applyGodMode(false);
    expect(menu.debugState.godMode).toBe(false);
  });

  it("emits debug:value-changed with debug.godMode key", () => {
    menu.applyGodMode(true);
    expect(emittedEvents).toContainEqual(
      expect.objectContaining({ type: "debug:value-changed", key: "debug.godMode", value: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// Debug state excluded from serialization
// ---------------------------------------------------------------------------

describe("debug state excluded from GameState.serialize()", () => {
  it("godMode does not appear in serialized output", () => {
    menu.applyGodMode(true);
    const save = gameState.serialize();
    expect(JSON.stringify(save)).not.toContain("godMode");
  });

  it("speedMultiplier does not appear in serialized output", () => {
    menu.applySpeedMultiplier(2.5);
    const save = gameState.serialize();
    expect(JSON.stringify(save)).not.toContain("speedMultiplier");
  });

  it("serialize() still contains expected player fields", () => {
    menu.applyLevel(5);
    menu.applyHealth(8);
    const save = gameState.serialize();
    // level and health ARE persisted via GameState.set() paths
    expect(save.player.stats.level).toBe(5);
    expect(save.player.stats.health).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Production mode — constructor no-ops
// ---------------------------------------------------------------------------

describe("production mode no-op", () => {
  it("does not build panel when NODE_ENV is not development", () => {
    vi.stubEnv("NODE_ENV", "production");
    const prodMenu = new DebugMenu(
      container as unknown as HTMLElement,
      gameState,
      eventBus,
      runtimeCfg,
      world,
    );
    expect(prodMenu.isOpen).toBe(false);
    // toggle() is safe to call even in production (panel is null, returns early)
    prodMenu.toggle();
    expect(prodMenu.isOpen).toBe(false);
    prodMenu.dispose();
  });
});

// ---------------------------------------------------------------------------
// Cats tab
// ---------------------------------------------------------------------------

describe("Cats tab", () => {
  type MockCatManager = {
    getCatalog: ReturnType<typeof vi.fn>;
    summon: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
    getActiveCompanions: ReturnType<typeof vi.fn>;
    canAfford: ReturnType<typeof vi.fn>;
    isValidPosition: ReturnType<typeof vi.fn>;
  };

  let mockCatManager: MockCatManager;
  let menuWithCats: DebugMenu;
  let mockGetPlayerPos: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCatManager = {
      getCatalog: vi.fn(() => [
        { type: CatType.Loaf, name: "Loaf", yarnCost: 2, description: "test", unlocked: true },
        { type: CatType.Zoomies, name: "Zoomies", yarnCost: 3, description: "test", unlocked: true },
      ]),
      summon: vi.fn(() => 42 as Entity),
      dismiss: vi.fn(),
      getActiveCompanions: vi.fn(() => [] as Entity[]),
      canAfford: vi.fn(() => true),
      isValidPosition: vi.fn(() => true),
    };

    mockGetPlayerPos = vi.fn(() => ({ x: 5, y: 0, z: 3 }));

    menuWithCats = new DebugMenu(
      container as unknown as HTMLElement,
      gameState,
      eventBus,
      runtimeCfg,
      world,
      undefined,
      mockCatManager as unknown as CatCompanionManager,
      mockGetPlayerPos as unknown as () => Vec3 | null,
    );
  });

  afterEach(() => {
    menuWithCats.dispose();
  });

  describe("applyForceSummon()", () => {
    it("calls catCompanionManager.summon at player position + 2 in X", () => {
      menuWithCats.applyForceSummon(CatType.Loaf);
      expect(mockCatManager.summon).toHaveBeenCalledWith(
        CatType.Loaf,
        expect.objectContaining({ x: 7, z: 3 }),
      );
    });

    it("restores yarn to its pre-summon value", () => {
      gameState.set("player.yarn", 10);
      menuWithCats.applyForceSummon(CatType.Loaf);
      expect(gameState.get<number>("player.yarn")).toBe(10);
    });

    it("restores runtimeConfig.maxActiveCats after summon", () => {
      runtimeCfg.maxActiveCats = 3;
      menuWithCats.applyForceSummon(CatType.Loaf);
      expect(runtimeCfg.maxActiveCats).toBe(3);
    });

    it("emits debug:value-changed with debug.forceSummon key", () => {
      menuWithCats.applyForceSummon(CatType.Loaf);
      expect(emittedEvents).toContainEqual(
        expect.objectContaining({ type: "debug:value-changed", key: "debug.forceSummon" }),
      );
    });

    it("uses origin + 2 in X when getPlayerPosition returns null", () => {
      mockGetPlayerPos.mockReturnValue(null);
      menuWithCats.applyForceSummon(CatType.Zoomies);
      expect(mockCatManager.summon).toHaveBeenCalledWith(
        CatType.Zoomies,
        expect.objectContaining({ x: 2, z: 0 }),
      );
    });
  });

  describe("applyDismissAll()", () => {
    it("calls dismiss for each active cat", () => {
      const entity1 = 1 as Entity;
      const entity2 = 2 as Entity;
      mockCatManager.getActiveCompanions.mockReturnValue([entity1, entity2]);
      menuWithCats.applyDismissAll();
      expect(mockCatManager.dismiss).toHaveBeenCalledWith(entity1);
      expect(mockCatManager.dismiss).toHaveBeenCalledWith(entity2);
    });

    it("is a no-op when no cats are active", () => {
      menuWithCats.applyDismissAll();
      expect(mockCatManager.dismiss).not.toHaveBeenCalled();
    });

    it("emits debug:value-changed with debug.dismissAll key", () => {
      menuWithCats.applyDismissAll();
      expect(emittedEvents).toContainEqual(
        expect.objectContaining({ type: "debug:value-changed", key: "debug.dismissAll", value: true }),
      );
    });
  });

  describe("applyYarnOverride()", () => {
    it("sets player.yarn to any non-negative value (above normal 99 cap)", () => {
      menuWithCats.applyYarnOverride(500);
      expect(gameState.get<number>("player.yarn")).toBe(500);
    });

    it("clamps to 0 for negative values", () => {
      menuWithCats.applyYarnOverride(-10);
      expect(gameState.get<number>("player.yarn")).toBe(0);
    });

    it("emits debug:value-changed with player.yarn key", () => {
      menuWithCats.applyYarnOverride(100);
      expect(emittedEvents).toContainEqual(
        expect.objectContaining({ type: "debug:value-changed", key: "player.yarn", value: 100 }),
      );
    });
  });

  describe("applyCatLimitOverride()", () => {
    it("sets runtimeConfig.maxActiveCats", () => {
      menuWithCats.applyCatLimitOverride(7);
      expect(runtimeCfg.maxActiveCats).toBe(7);
    });

    it("clamps to 1..10", () => {
      menuWithCats.applyCatLimitOverride(0);
      expect(runtimeCfg.maxActiveCats).toBe(1);
      menuWithCats.applyCatLimitOverride(99);
      expect(runtimeCfg.maxActiveCats).toBe(10);
    });

    it("emits debug:value-changed with runtimeConfig.maxActiveCats key", () => {
      menuWithCats.applyCatLimitOverride(5);
      expect(emittedEvents).toContainEqual(
        expect.objectContaining({
          type: "debug:value-changed",
          key: "runtimeConfig.maxActiveCats",
          value: 5,
        }),
      );
    });
  });

  describe("update()", () => {
    it("calls getActiveCompanions when menu is open", () => {
      menuWithCats.toggle(); // open
      menuWithCats.update();
      expect(mockCatManager.getActiveCompanions).toHaveBeenCalled();
    });

    it("does not call getActiveCompanions when menu is closed", () => {
      // Menu starts closed
      menuWithCats.update();
      expect(mockCatManager.getActiveCompanions).not.toHaveBeenCalled();
    });
  });
});
