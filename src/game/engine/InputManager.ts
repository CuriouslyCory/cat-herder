import { GameAction } from "../types";
import type { Vec3 } from "../types";
import type { SceneManager } from "./SceneManager";

// ---------------------------------------------------------------------------
// InputManager
// ---------------------------------------------------------------------------

/**
 * Manages keyboard and mouse input for the game canvas.
 *
 * Listeners are scoped to the canvas element so they never fire while the
 * player is interacting with DOM UI (React overlays, menus, etc.).
 *
 * Call poll() once per frame BEFORE any system reads input — it flushes the
 * single-frame "pressed" state.
 */
export class InputManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly sceneManager: SceneManager;

  /** Keys that are currently held down. */
  private readonly held = new Set<string>();
  /** Keys pressed for the first time this frame (cleared by poll()). */
  private readonly pressedThisFrame = new Set<string>();

  /** Last known mouse position in canvas-local pixels. */
  private mouseX = 0;
  private mouseY = 0;

  // Bound handlers — kept as fields so removeEventListener works correctly.
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onMouseMove: (e: MouseEvent) => void;

  /**
   * Maps each GameAction to the key code(s) that trigger it.
   * Ctrl+D (ToggleDebug) is handled inline and stored as the synthetic key
   * "CtrlD" so it doesn't conflict with the movement "D" key.
   */
  private static readonly ACTION_KEYS: Readonly<Record<GameAction, string[]>> =
    {
      [GameAction.Jump]: ["Space"],
      [GameAction.Interact]: ["KeyE"],
      [GameAction.ToggleMap]: ["KeyM"],
      [GameAction.ToggleDebug]: ["CtrlD"], // synthetic key — handled in onKeyDown
      [GameAction.Pause]: ["Escape"],
      [GameAction.Dive]: ["ShiftLeft", "ShiftRight"],
    };

  constructor(canvas: HTMLCanvasElement, sceneManager: SceneManager) {
    this.canvas = canvas;
    this.sceneManager = sceneManager;

    // Make the canvas focusable so it can receive keyboard events.
    canvas.tabIndex = 0;

    this.onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+D → ToggleDebug (handled before movement keys to avoid registering
      // a plain "D" keydown when the user only intends the debug shortcut).
      if (e.ctrlKey && e.code === "KeyD") {
        e.preventDefault();
        if (!this.held.has("CtrlD")) {
          this.pressedThisFrame.add("CtrlD");
        }
        this.held.add("CtrlD");
        return;
      }

      // Prevent the browser from scrolling while the player is in-game.
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }

      if (!this.held.has(e.code)) {
        this.pressedThisFrame.add(e.code);
      }
      this.held.add(e.code);
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      this.held.delete(e.code);
      // If D is released, CtrlD is no longer possible.
      if (e.code === "KeyD") {
        this.held.delete("CtrlD");
      }
    };

    this.onMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    };

    canvas.addEventListener("keydown", this.onKeyDown);
    canvas.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("mousemove", this.onMouseMove);
  }

  // ---------------------------------------------------------------------------
  // Frame lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Call once per frame, before systems read input.
   * Clears the single-frame "pressed" state so isActionPressed() resets each frame.
   */
  poll(): void {
    this.pressedThisFrame.clear();
  }

  // ---------------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------------

  /**
   * Returns a movement intent vector from WASD / Arrow Keys.
   * Diagonals are normalized to unit length so all 8 directions have equal speed.
   */
  getMovementIntent(): { x: number; z: number } {
    const x =
      (this.held.has("KeyA") || this.held.has("ArrowLeft") ? -1 : 0) +
      (this.held.has("KeyD") || this.held.has("ArrowRight") ? 1 : 0);

    const z =
      (this.held.has("KeyW") || this.held.has("ArrowUp") ? -1 : 0) +
      (this.held.has("KeyS") || this.held.has("ArrowDown") ? 1 : 0);

    const len = Math.sqrt(x * x + z * z);
    if (len === 0) return { x: 0, z: 0 };
    return { x: x / len, z: z / len };
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * True only on the first frame an action's key is pressed.
   * Resets after poll() is called.
   */
  isActionPressed(action: GameAction): boolean {
    return (InputManager.ACTION_KEYS[action] ?? []).some((code) =>
      this.pressedThisFrame.has(code),
    );
  }

  /**
   * True for every frame the action's key is held down.
   */
  isActionHeld(action: GameAction): boolean {
    return (InputManager.ACTION_KEYS[action] ?? []).some((code) =>
      this.held.has(code),
    );
  }

  // ---------------------------------------------------------------------------
  // Mouse
  // ---------------------------------------------------------------------------

  /**
   * Returns the world-space point under the mouse cursor by raycasting through
   * SceneManager, or null if no mesh is hit.
   */
  getMouseWorldPosition(): Vec3 | null {
    return this.sceneManager.screenToWorld(this.mouseX, this.mouseY);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Remove all event listeners. Call on unmount / destroy. */
  dispose(): void {
    this.canvas.removeEventListener("keydown", this.onKeyDown);
    this.canvas.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
  }
}
