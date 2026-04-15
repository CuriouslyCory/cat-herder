import type { Component } from "../Component";

export const PLAYER_CONTROLLED = "PlayerControlled";

export interface PlayerControlled extends Component {
  readonly type: typeof PLAYER_CONTROLLED;
  isGrounded: boolean;
  /** Counts down from config.coyoteFrames to 0 after leaving the ground. */
  coyoteTimer: number;
  /** Counts down from config.jumpBufferFrames to 0 after jump input is received. */
  jumpBufferTimer: number;
}

export function createPlayerControlled(): PlayerControlled {
  return {
    type: PLAYER_CONTROLLED,
    isGrounded: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
  };
}
