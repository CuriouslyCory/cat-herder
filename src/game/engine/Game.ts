import { EventBus } from "./EventBus";
import { SceneManager } from "./SceneManager";
import { InputManager } from "./InputManager";
import { PhysicsEngine } from "./PhysicsEngine";
import { GameState } from "./GameState";
import { World } from "../ecs/World";
import { RenderSystem } from "../systems/RenderSystem";
import { MovementSystem } from "../systems/MovementSystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { WaterSystem } from "../systems/WaterSystem";
import { OxygenSystem } from "../systems/OxygenSystem";
import { CatPlacementSystem } from "../systems/CatPlacementSystem";
import { ZoomiesSystem } from "../systems/ZoomiesSystem";
import { CameraController } from "./CameraController";
import { MapManager } from "../maps/MapManager";
import { CatCompanionManager } from "../cats/CatCompanionManager";
import { UIManager } from "../ui/UIManager";
import { TestMap } from "../maps/TestMap";
import { CONFIG, runtimeConfig } from "../config";
import { createTransform } from "../ecs/components/Transform";
import { createVelocity } from "../ecs/components/Velocity";
import { createPlayerControlled } from "../ecs/components/PlayerControlled";
import { createRenderable } from "../ecs/components/Renderable";
import { createCollider } from "../ecs/components/Collider";
import type { Entity } from "../ecs/Entity";
import type { Transform } from "../ecs/components/Transform";
import type { OxygenState } from "../ecs/components/OxygenState";
import type { PlayerControlled } from "../ecs/components/PlayerControlled";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GameUser {
  id: string;
  firstName?: string | null;
  email?: string | null;
}

export interface PlayerCharacterConfig {
  shape: "box" | "sphere" | "cylinder";
  colorHex: string;
  sizeScale: number;
}

/**
 * Minimal interface the engine uses to persist data.
 * GameCanvas constructs the concrete adapter by closing over api.game.* mutations,
 * so the engine never imports from ~/trpc/* directly.
 */
export interface GameTrpcAdapter {
  upsertSave(input: {
    version: string;
    saveData: Record<string, unknown>;
  }): Promise<void>;
}

export interface GameOpts {
  user: GameUser;
  trpc: GameTrpcAdapter;
  character?: PlayerCharacterConfig;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Physics tick rate: 60 steps per second. */
const FIXED_DT = 1 / 60;

/**
 * Maximum dt fed into the accumulator per frame.
 * Prevents the "spiral of death" when a frame takes an unusually long time.
 */
const MAX_ACCUMULATOR = 0.1; // 100ms ≈ 6 missed frames

// ---------------------------------------------------------------------------
// Game orchestrator
// ---------------------------------------------------------------------------

/**
 * Top-level Game orchestrator.
 *
 * Initialises all engine modules in dependency order, runs a fixed-timestep
 * physics loop with variable-rate rendering, and disposes everything cleanly
 * on destroy() — safe for React StrictMode and HMR.
 *
 * Module init order:
 *   EventBus → SceneManager → InputManager → PhysicsEngine → World →
 *   Systems → CameraController → MapManager → UIManager
 *
 * Frame order:
 *   InputManager.poll() → MovementSystem → PhysicsEngine.step() →
 *   CollisionSystem → CameraController.update() → RenderSystem →
 *   UIManager.update() → SceneManager.render()
 */
export class Game {
  // ── Core modules ────────────────────────────────────────────────────────────
  private readonly eventBus: EventBus;
  private readonly sceneManager: SceneManager;
  private readonly inputManager: InputManager;
  private readonly physics: PhysicsEngine;
  private readonly gameState: GameState;
  private readonly world: World;
  private readonly cameraController: CameraController;
  private readonly mapManager: MapManager;
  private readonly catCompanionManager: CatCompanionManager;
  private readonly uiManager: UIManager;

  // ── Systems (called in frame order) ─────────────────────────────────────────
  private readonly movementSystem: MovementSystem;
  private readonly collisionSystem: CollisionSystem;
  private readonly waterSystem: WaterSystem;
  private readonly oxygenSystem: OxygenSystem;
  private readonly catPlacementSystem: CatPlacementSystem;
  private readonly zoomiesSystem: ZoomiesSystem;
  private readonly renderSystem: RenderSystem;

  // ── Loop state ───────────────────────────────────────────────────────────────
  private rafId: number | null = null;
  private lastTime: number | null = null;
  private accumulator = 0;

  // ── Player entity ────────────────────────────────────────────────────────────
  private playerEntity: Entity | null = null;

  // ── Auto-save ────────────────────────────────────────────────────────────────
  private saveTimer = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: GameOpts,
  ) {
    // 1. EventBus — pub/sub backbone; must exist before anything that emits events
    this.eventBus = new EventBus();

    // 2. SceneManager — Three.js isolation boundary
    this.sceneManager = new SceneManager(canvas);

    // 3. InputManager — keyboard + mouse (needs SceneManager for screenToWorld)
    this.inputManager = new InputManager(canvas, this.sceneManager);

    // 4. PhysicsEngine — self-contained math layer; emits trigger events via eventBus
    this.physics = new PhysicsEngine(this.eventBus);

    // 5. GameState — mutable player state (yarn, inventory) shared across systems
    this.gameState = new GameState();

    // 6. World — ECS entity/component registry
    this.world = new World();

    // 7. Systems — instantiated with their dependencies; update() called each frame
    this.movementSystem = new MovementSystem(this.inputManager, this.physics);
    this.collisionSystem = new CollisionSystem(this.eventBus);
    // WaterSystem subscribes to trigger events emitted by CollisionSystem
    this.waterSystem = new WaterSystem(this.world, this.physics, this.eventBus);
    // OxygenSystem runs after WaterSystem (needs OxygenState + SwimmingState set up)
    this.oxygenSystem = new OxygenSystem(this.eventBus);
    this.renderSystem = new RenderSystem(this.sceneManager);

    // 8. CameraController — installs OrthographicCamera into SceneManager
    this.cameraController = new CameraController(
      canvas,
      this.sceneManager,
      this.world,
    );

    // 9. MapManager — builds terrain entities in the ECS world
    this.mapManager = new MapManager(this.world, this.eventBus);

    // 10. CatCompanionManager — companion lifecycle (summon/dismiss/catalog)
    this.catCompanionManager = new CatCompanionManager(
      this.world,
      this.eventBus,
      this.mapManager,
      this.gameState,
      () => this.playerEntity,
      this.physics,
    );

    // 11. ZoomiesSystem — trail timer, auto-dismiss, and speed-boost overlap
    this.zoomiesSystem = new ZoomiesSystem(this.catCompanionManager);

    // 12. CatPlacementSystem — ghost preview, number-key selection, click handling
    this.catPlacementSystem = new CatPlacementSystem(
      this.inputManager,
      this.sceneManager,
      this.catCompanionManager,
      this.mapManager,
      this.world,
    );

    // 13. UIManager — DOM panels over the canvas
    this.uiManager = new UIManager(canvas);
    this.uiManager.setCatCatalog(this.catCompanionManager.getCatalog());
  }

  // ---------------------------------------------------------------------------
  // Public lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Load the test map, spawn the player, and start the game loop.
   * Awaitable so callers can sequence post-start work if needed.
   */
  async start(): Promise<void> {
    // Load map (creates terrain entities in the ECS world)
    this.mapManager.loadMap(TestMap);

    // Set camera map bounds for focus clamping
    this.cameraController.setMapBounds({
      minX: -TestMap.size.width / 2,
      maxX: TestMap.size.width / 2,
      minZ: -TestMap.size.depth / 2,
      maxZ: TestMap.size.depth / 2,
    });

    // Spawn player entity (first time — no existing entity, so map spawn is used)
    this.spawnPlayer(this.opts.character);

    // Begin the render loop
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTime = null; // reset so resume doesn't produce a large dt spike
  }

  resume(): void {
    if (this.rafId !== null) return; // already running
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  /**
   * Tear down all engine modules and release GPU + DOM resources.
   * Safe to call during React StrictMode double-mounts and HMR cycles.
   */
  destroy(): void {
    this.pause();
    this.cameraController.dispose();
    this.inputManager.dispose();
    this.waterSystem.dispose();
    this.catPlacementSystem.dispose();
    this.uiManager.dispose();
    this.sceneManager.dispose();
    this.eventBus.clear();
    this.mapManager.unloadMap();
  }

  /**
   * Spawn (or re-spawn) the player entity using the given character config.
   * - First call (no existing entity): places the player at the map spawn point.
   * - Subsequent calls (config update from CharacterCreator): keeps the current
   *   position so the player doesn't teleport during a cosmetic change.
   */
  spawnPlayer(config?: PlayerCharacterConfig): void {
    // Determine spawn position
    let spawnX = 0;
    let spawnY = 1;
    let spawnZ = 0;

    if (this.playerEntity !== null) {
      // Keep current world position when updating character appearance
      const transform = this.world.getComponent<Transform>(
        this.playerEntity,
        "Transform",
      );
      if (transform) {
        spawnX = transform.x;
        spawnY = transform.y;
        spawnZ = transform.z;
      }
      // Clean up old physics body and ECS entity
      const oldHandle = this.physics.getHandleByEntity(this.playerEntity);
      if (oldHandle) this.physics.removeBody(oldHandle);
      this.world.destroyEntity(this.playerEntity);
      this.playerEntity = null;
    } else {
      // First spawn — use the map's designated player spawn point
      const spawn = this.mapManager.getSpawnPoint("player");
      spawnX = spawn?.x ?? 0;
      spawnZ = spawn?.z ?? 0;
    }

    const s = config?.sizeScale ?? 1;
    const shape = config?.shape ?? "box";
    const color = config?.colorHex ?? "#ff6b35";

    // Create ECS entity with all required components
    const entity = this.world.createEntity();

    this.world.addComponent(entity, createTransform(spawnX, spawnY, spawnZ));
    this.world.addComponent(entity, createVelocity());
    this.world.addComponent(entity, createPlayerControlled());
    this.world.addComponent(
      entity,
      createRenderable({
        geometry: shape, // "box" | "sphere" | "cylinder" are valid GeometryKinds
        size: 0.5 * s,
        color,
        castShadow: true,
      }),
    );
    this.world.addComponent(
      entity,
      createCollider("circle", runtimeConfig.collisionRadius, {
        collisionLayer: 1,
        collisionMask: 1,
      }),
    );

    // Register physics body at the same position
    const handle = this.physics.addBody(entity, {
      shape: "circle",
      size: runtimeConfig.collisionRadius,
      isStatic: false,
      isTrigger: false,
      collisionLayer: 1,
      collisionMask: 1,
    });
    this.physics.setPosition(handle, { x: spawnX, y: spawnY, z: spawnZ });

    this.playerEntity = entity;

    // Camera follows the new player entity
    this.cameraController.follow(entity);
  }

  // ---------------------------------------------------------------------------
  // Private — game loop
  // ---------------------------------------------------------------------------

  private loop(time: number): void {
    // Queue the next frame immediately so cancellation is always possible
    this.rafId = requestAnimationFrame((t) => this.loop(t));

    // Skip the first tick after start/resume to establish a baseline timestamp
    if (this.lastTime === null) {
      this.lastTime = time;
      return;
    }

    // Clamp to MAX_ACCUMULATOR to prevent spiral-of-death on slow frames
    const realDt = Math.min((time - this.lastTime) / 1000, MAX_ACCUMULATOR);
    this.lastTime = time;

    // ── Input (once per render frame, before any physics ticks) ───────────────
    this.inputManager.poll();

    // ── Fixed-timestep physics (may run 0, 1, or rarely 2 ticks per frame) ────
    this.accumulator += realDt;
    while (this.accumulator >= FIXED_DT) {
      this.movementSystem.update(this.world, FIXED_DT);
      this.physics.step(FIXED_DT);
      this.collisionSystem.update(this.world, FIXED_DT);
      // WaterSystem reacts to trigger events emitted by CollisionSystem above
      this.waterSystem.update(this.world, FIXED_DT);
      // OxygenSystem runs after WaterSystem so OxygenState is already present
      this.oxygenSystem.update(this.world, FIXED_DT);
      // ZoomiesSystem ticks trail timers and updates SpeedBoost on the player
      this.zoomiesSystem.update(this.world, FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    // ── Variable-rate render pass ──────────────────────────────────────────────
    this.cameraController.update(realDt);
    // CatPlacementSystem: processes clicks + updates ghost (once per render frame)
    this.catPlacementSystem.update(realDt);
    this.renderSystem.update(this.world, realDt);
    this.uiManager.update(realDt, this.buildHUDState());
    this.sceneManager.render();

    // ── Auto-save (every CONFIG.autoSaveIntervalMs milliseconds) ───────────────
    this.saveTimer += realDt * 1000; // accumulate in ms
    if (this.saveTimer >= CONFIG.autoSaveIntervalMs) {
      this.saveTimer = 0;
      this.triggerAutoSave();
    }
  }

  /**
   * Reads oxygen and health state from the player entity each render frame
   * and returns a snapshot for the HUD.
   */
  private buildHUDState(): import("../ui/UIManager").HUDState {
    const entity = this.playerEntity;
    if (entity === null) {
      return {
        oxygenPercent: null,
        health: 5,
        maxHealth: 5,
        yarn: this.gameState.yarn,
        selectedCatType: this.catPlacementSystem.getSelectedCatType(),
      };
    }

    const player = this.world.getComponent<PlayerControlled>(entity, "PlayerControlled");
    const oxygen = this.world.getComponent<OxygenState>(entity, "OxygenState");

    return {
      oxygenPercent: oxygen ? oxygen.oxygenPercent : null,
      health: player?.health ?? 5,
      maxHealth: player?.maxHealth ?? 5,
      yarn: this.gameState.yarn,
      selectedCatType: this.catPlacementSystem.getSelectedCatType(),
    };
  }

  private triggerAutoSave(): void {
    if (!this.playerEntity) return;

    const transform = this.world.getComponent<Transform>(
      this.playerEntity,
      "Transform",
    );

    void this.opts.trpc.upsertSave({
      version: "0.1",
      saveData: transform
        ? { player: { x: transform.x, y: transform.y, z: transform.z } }
        : {},
    });
  }
}
