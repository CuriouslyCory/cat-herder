import { EventBus } from "./EventBus";
import { SceneManager } from "./SceneManager";
import { InputManager } from "./InputManager";
import { PhysicsEngine } from "./PhysicsEngine";
import { World } from "../ecs/World";
import { RenderSystem } from "../systems/RenderSystem";
import { MovementSystem } from "../systems/MovementSystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { WaterSystem } from "../systems/WaterSystem";
import { CameraController } from "./CameraController";
import { MapManager } from "../maps/MapManager";
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
  private readonly world: World;
  private readonly cameraController: CameraController;
  private readonly mapManager: MapManager;
  private readonly uiManager: UIManager;

  // ── Systems (called in frame order) ─────────────────────────────────────────
  private readonly movementSystem: MovementSystem;
  private readonly collisionSystem: CollisionSystem;
  private readonly waterSystem: WaterSystem;
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

    // 5. World — ECS entity/component registry
    this.world = new World();

    // 6. Systems — instantiated with their dependencies; update() called each frame
    this.movementSystem = new MovementSystem(this.inputManager, this.physics);
    this.collisionSystem = new CollisionSystem(this.eventBus);
    // WaterSystem subscribes to trigger events emitted by CollisionSystem
    this.waterSystem = new WaterSystem(this.world, this.physics, this.eventBus);
    this.renderSystem = new RenderSystem(this.sceneManager);

    // 7. CameraController — installs OrthographicCamera into SceneManager
    this.cameraController = new CameraController(
      canvas,
      this.sceneManager,
      this.world,
    );

    // 8. MapManager — builds terrain entities in the ECS world
    this.mapManager = new MapManager(this.world, this.eventBus);

    // 9. UIManager — DOM panels over the canvas (stub; full impl in US-018)
    this.uiManager = new UIManager(canvas);
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
      this.accumulator -= FIXED_DT;
    }

    // ── Variable-rate render pass ──────────────────────────────────────────────
    this.cameraController.update(realDt);
    this.renderSystem.update(this.world, realDt);
    this.uiManager.update(realDt);
    this.sceneManager.render();

    // ── Auto-save (every CONFIG.autoSaveIntervalMs milliseconds) ───────────────
    this.saveTimer += realDt * 1000; // accumulate in ms
    if (this.saveTimer >= CONFIG.autoSaveIntervalMs) {
      this.saveTimer = 0;
      this.triggerAutoSave();
    }
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
