import type { GameAction, Vec2 } from "~/game/types";

export interface MockInputManager {
  isActionPressed(action: GameAction): boolean;
  isActionHeld(action: GameAction): boolean;
  getMovementIntent(): Vec2;
  getMouseWorldPosition(): { x: number; y: number; z: number } | null;
  pressAction(action: GameAction): void;
  holdAction(action: GameAction): void;
  releaseAction(action: GameAction): void;
  setMovementIntent(x: number, z: number): void;
  reset(): void;
}

export function createMockInputManager(): MockInputManager {
  const pressed = new Set<GameAction>();
  const held = new Set<GameAction>();
  let movementIntent: Vec2 = { x: 0, z: 0 };

  return {
    isActionPressed(action: GameAction) {
      return pressed.has(action);
    },
    isActionHeld(action: GameAction) {
      return held.has(action);
    },
    getMovementIntent() {
      return { ...movementIntent };
    },
    getMouseWorldPosition() {
      return null;
    },
    pressAction(action: GameAction) {
      pressed.add(action);
    },
    holdAction(action: GameAction) {
      held.add(action);
    },
    releaseAction(action: GameAction) {
      pressed.delete(action);
      held.delete(action);
    },
    setMovementIntent(x: number, z: number) {
      movementIntent = { x, z };
    },
    reset() {
      pressed.clear();
      held.clear();
      movementIntent = { x: 0, z: 0 };
    },
  };
}
