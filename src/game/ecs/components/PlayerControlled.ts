import type { Component } from "../Component";

/**
 * Marker component that identifies the player-controlled entity.
 * Carries timers for coyote time and jump buffer used by MovementSystem.
 */
export interface PlayerControlled extends Component {
  readonly type: "PlayerControlled";
  isGrounded: boolean;
  /** Frames remaining of coyote-time (allows jumping just after walking off a ledge) */
  coyoteTimer: number;
  /** Frames remaining of jump-buffer (jump pressed just before landing still triggers) */
  jumpBufferTimer: number;
}

export function createPlayerControlled(): PlayerControlled {
  return {
    type: "PlayerControlled",
    isGrounded: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
  };
}
