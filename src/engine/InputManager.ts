import { GameAction } from "../types";
import type { Vector3, Vector2 } from "../types";
import type { SceneManager } from "./SceneManager";

// ─── Key Bindings ─────────────────────────────────────────────────────────────

const MOVEMENT_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "w",
  "W",
  "a",
  "A",
  "s",
  "S",
  "d",
  "D",
]);

const ACTION_KEYS: Record<string, GameAction> = {
  " ": GameAction.Jump,
  e: GameAction.Interact,
  E: GameAction.Interact,
  m: GameAction.ToggleMap,
  M: GameAction.ToggleMap,
  Escape: GameAction.Pause,
};

// Ctrl+D → ToggleDebug handled separately

// ─── InputManager ─────────────────────────────────────────────────────────────

export class InputManager {
  private readonly held = new Set<string>();
  private readonly pressedThisFrame = new Set<GameAction>();
  private readonly actionHeld = new Map<GameAction, boolean>();
  private mouseScreenX = 0;
  private mouseScreenY = 0;

  constructor(private readonly sceneManager: SceneManager) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("mousemove", this.handleMouseMove);
  }

  /** Call once at the top of each frame, before systems read input. */
  poll(): void {
    this.pressedThisFrame.clear();
  }

  getMovementIntent(): Vector2 {
    let x = 0;
    let z = 0;

    if (this.held.has("a") || this.held.has("A") || this.held.has("ArrowLeft")) x -= 1;
    if (this.held.has("d") || this.held.has("D") || this.held.has("ArrowRight")) x += 1;
    if (this.held.has("w") || this.held.has("W") || this.held.has("ArrowUp")) z -= 1;
    if (this.held.has("s") || this.held.has("S") || this.held.has("ArrowDown")) z += 1;

    // Normalize diagonal input to unit length
    const len = Math.sqrt(x * x + z * z);
    if (len > 0) {
      x /= len;
      z /= len;
    }

    return { x, z };
  }

  /** True only on the frame the action was first pressed. */
  isActionPressed(action: GameAction): boolean {
    return this.pressedThisFrame.has(action);
  }

  /** True while the action key is held. */
  isActionHeld(action: GameAction): boolean {
    return this.actionHeld.get(action) ?? false;
  }

  getMouseWorldPosition(): Vector3 | null {
    return this.sceneManager.screenToWorld(this.mouseScreenX, this.mouseScreenY);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("mousemove", this.handleMouseMove);
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (MOVEMENT_KEYS.has(e.key)) e.preventDefault();

    this.held.add(e.key);

    // Ctrl+D → ToggleDebug
    if (e.key === "d" && e.ctrlKey) {
      e.preventDefault();
      this.fireAction(GameAction.ToggleDebug);
      return;
    }

    const action = ACTION_KEYS[e.key];
    if (action !== undefined && !e.repeat) {
      this.fireAction(action);
    }
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.key);

    const action = ACTION_KEYS[e.key];
    if (action !== undefined) {
      this.actionHeld.set(action, false);
    }
  };

  private readonly handleMouseMove = (e: MouseEvent): void => {
    this.mouseScreenX = e.clientX;
    this.mouseScreenY = e.clientY;
  };

  private fireAction(action: GameAction): void {
    this.pressedThisFrame.add(action);
    this.actionHeld.set(action, true);
  }
}
