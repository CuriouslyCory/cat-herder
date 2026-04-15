import { EventBus } from "./EventBus";
import { SceneManager } from "./SceneManager";
import { InputManager } from "./InputManager";
import { PhysicsEngine } from "./PhysicsEngine";
import { CameraController } from "./CameraController";
import { World } from "../ecs/World";
import { RenderSystem } from "../systems/RenderSystem";
import { MovementSystem } from "../systems/MovementSystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { MapManager } from "../game/MapManager";
import type { AuthModule } from "../modules/auth/AuthModule";

// UIManager stub — will be replaced in US-020
class UIManagerStub {
  update(_dt: number): void {}
}

const FIXED_STEP = 1 / 60; // seconds
const MAX_ACCUMULATED = 0.25; // cap to prevent spiral of death

export class Game {
  readonly eventBus: EventBus;
  readonly sceneManager: SceneManager;
  readonly inputManager: InputManager;
  readonly physicsEngine: PhysicsEngine;
  readonly world: World;
  readonly cameraController: CameraController;
  readonly mapManager: MapManager;

  private readonly renderSystem: RenderSystem;
  private readonly movementSystem: MovementSystem;
  private readonly collisionSystem: CollisionSystem;
  private readonly uiManager: UIManagerStub;
  private rafHandle: number | null = null;
  private lastTime: number | null = null;
  private accumulator = 0;
  private running = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly auth?: AuthModule,
  ) {
    // Initialize in dependency order
    this.eventBus = new EventBus();
    this.sceneManager = new SceneManager(canvas);
    this.inputManager = new InputManager(this.sceneManager);
    this.physicsEngine = new PhysicsEngine(this.eventBus);
    this.world = new World();
    this.cameraController = new CameraController(this.sceneManager);
    this.mapManager = new MapManager(this.world);
    this.uiManager = new UIManagerStub();

    // Systems in update order (see frame order spec in PRD US-018)
    this.movementSystem = new MovementSystem(this.inputManager);
    this.collisionSystem = new CollisionSystem(this.eventBus);
    this.renderSystem = new RenderSystem(this.sceneManager);


    void this.auth; // available for future use (persistence, etc.)
  }

  start(): void {
    this.running = true;
    this.lastTime = null;
    this.accumulator = 0;
    this.rafHandle = requestAnimationFrame(this.loop);
  }

  pause(): void {
    this.running = false;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  resume(): void {
    if (!this.running) {
      this.running = true;
      this.lastTime = null;
      this.rafHandle = requestAnimationFrame(this.loop);
    }
  }

  dispose(): void {
    this.pause();
    this.eventBus.clear();
    this.inputManager.dispose();
    this.sceneManager.dispose();
  }

  private readonly loop = (timestamp: number): void => {
    if (!this.running) return;

    if (this.lastTime === null) {
      this.lastTime = timestamp;
    }

    const frameTime = Math.min((timestamp - this.lastTime) / 1000, MAX_ACCUMULATED);
    this.lastTime = timestamp;
    this.accumulator += frameTime;

    // Fixed timestep physics steps
    while (this.accumulator >= FIXED_STEP) {
      // Frame update order per PRD:
      // InputManager.poll → MovementSystem → PhysicsEngine.step → CollisionSystem
      // → CameraSystem → RenderSystem → UIManager
      this.inputManager.poll();
      this.movementSystem.update(this.world, FIXED_STEP);
      this.physicsEngine.step(FIXED_STEP);
      this.collisionSystem.update(this.world, FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }

    // Interpolation factor for render (not yet used for smoothing — future work)
    // const alpha = this.accumulator / FIXED_STEP;

    this.cameraController.update(this.world, frameTime);
    this.renderSystem.update(this.world, frameTime);
    this.uiManager.update(frameTime);
    this.sceneManager.render();

    this.rafHandle = requestAnimationFrame(this.loop);
  };
}
