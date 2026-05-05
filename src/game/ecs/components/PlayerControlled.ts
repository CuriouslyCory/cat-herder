import type { Component } from "../Component";

/**
 * Marker component that identifies the player-controlled entity.
 * Carries timers for coyote time and jump buffer used by MovementSystem,
 * and core player stats (health) shared across systems.
 */
export interface PlayerControlled extends Component {
  readonly type: "PlayerControlled";
  isGrounded: boolean;
  /** Frames remaining of coyote-time (allows jumping just after walking off a ledge) */
  coyoteTimer: number;
  /** Frames remaining of jump-buffer (jump pressed just before landing still triggers) */
  jumpBufferTimer: number;
  /** Current health points */
  health: number;
  /** Maximum health points */
  maxHealth: number;
}

export function createPlayerControlled(): PlayerControlled {
  return {
    type: "PlayerControlled",
    isGrounded: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    health: 5,
    maxHealth: 5,
  };
}
