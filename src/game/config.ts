// ---------------------------------------------------------------------------
// Centralized game config — all GDD constants in one place.
//
// CONFIG is frozen (runtime-immutable). runtimeConfig is a deep copy used
// exclusively by the debug menu so live tweaks never pollute the base values.
// ---------------------------------------------------------------------------

export interface GameConfig {
  // Movement
  walkSpeed: number; // units/second
  swimSpeedSurface: number; // units/second horizontal while on water surface
  swimSpeedDive: number; // units/second horizontal while diving (Shift held)
  swimSpeedAscend: number; // units/second upward when rising to surface
  swimSpeedVertical: number; // units/second downward while diving
  swimAcceleration: number; // seconds to reach full swim speed
  acceleration: number; // seconds to reach full speed
  deceleration: number; // seconds to stop from full speed
  airControlFactor: number; // fraction of normal horizontal control while airborne

  // Jump
  jumpImpulse: number; // initial upward velocity (u/s)
  jumpApex: number; // apex height (u)
  coyoteFrames: number; // frames of coyote time after walking off edge
  jumpBufferFrames: number; // frames of jump buffering before landing

  // Physics
  gravity: number; // u/s² (negative = downward)
  collisionRadius: number; // player capsule radius (u)
  skinWidth: number; // collision skin (u)
  groundSnapTolerance: number; // downward snap distance for ground detection (u)

  // Oxygen (swimming)
  oxygenMax: number; // seconds of air
  oxygenDrainRate: number; // seconds lost per second underwater
  oxygenRefillRate: number; // seconds recovered per second on surface

  // Camera
  cameraAzimuth: number; // degrees — isometric horizontal angle
  cameraElevation: number; // degrees — isometric vertical angle
  cameraLeadDistance: number; // units of camera lead ahead of player
  cameraLeadLerp: number; // lead lerp factor (0-1 per frame @60fps)

  // Persistence
  autoSaveIntervalMs: number; // milliseconds between auto-saves
}

const BASE_CONFIG: GameConfig = {
  // Movement
  walkSpeed: 4.5,
  swimSpeedSurface: 3.2,
  swimSpeedDive: 2.0,
  swimSpeedAscend: 2.5,
  swimSpeedVertical: 1.5,
  swimAcceleration: 0.5,
  acceleration: 0.3,
  deceleration: 0.2,
  airControlFactor: 0.7,

  // Jump
  jumpImpulse: 3.5,
  jumpApex: 1.2,
  coyoteFrames: 5,
  jumpBufferFrames: 5,

  // Physics
  gravity: -12,
  collisionRadius: 0.4,
  skinWidth: 0.1,
  groundSnapTolerance: 0.05,

  // Oxygen
  oxygenMax: 15,
  oxygenDrainRate: 1,
  oxygenRefillRate: 3,

  // Camera
  cameraAzimuth: 45,
  cameraElevation: 60,
  cameraLeadDistance: 2.5,
  cameraLeadLerp: 0.08,

  // Persistence
  autoSaveIntervalMs: 30_000,
};

/** Immutable production config. Import this for all production game logic. */
export const CONFIG: Readonly<GameConfig> = Object.freeze({ ...BASE_CONFIG });

/** Mutable deep copy of CONFIG — used exclusively by the debug menu. */
export const runtimeConfig: GameConfig = { ...BASE_CONFIG };
