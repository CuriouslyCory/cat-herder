// ─── Game Configuration ───────────────────────────────────────────────────────
// All numeric constants from the GDD. The frozen BASE_CONFIG is the source of
// truth; runtimeConfig is a mutable copy for the debug menu to override.

const BASE_CONFIG = Object.freeze({
  // Movement
  walkSpeed: 4.5, // units/second
  swimSpeed: 2.0, // units/second
  sprintMultiplier: 1.6,
  acceleration: 0.3, // seconds to reach full walk speed
  deceleration: 0.2, // seconds to stop from full walk speed
  airControlFactor: 0.7, // horizontal movement retention while airborne

  // Jumping
  jumpImpulse: 3.5, // units/second upward velocity applied on jump
  jumpApexHeight: 1.2, // units

  // Physics
  gravity: -12, // units/second^2
  coyoteFrames: 5, // frames after leaving ground where jump is still allowed
  jumpBufferFrames: 5, // frames before landing where jump input is buffered
  collisionRadius: 0.4, // units — player capsule radius
  collisionSkinWidth: 0.1, // units — wall sliding tolerance
  groundSnapTolerance: 0.05, // units — snapping to ground after step down

  // Oxygen / water
  oxygenMax: 100,
  oxygenDrainRate: 10, // units/second while submerged
  oxygenRechargeRate: 20, // units/second while surface-breathing

  // Camera
  cameraAzimuth: 45, // degrees
  cameraElevation: 60, // degrees
  cameraLeadDistance: 2.5, // units ahead of player facing direction
  cameraLeadLerpFactor: 5, // per-second lerp speed for camera lead

  // Persistence
  autoSaveIntervalMs: 30_000, // 30 seconds
});

export type GameConfig = typeof BASE_CONFIG;

// Mutable runtime copy — mutate this for debug-menu overrides; read from here
// in all systems so changes take effect without reloading.
export const runtimeConfig: GameConfig = { ...BASE_CONFIG };

// Immutable reference to design defaults — useful to diff against in debug UI.
export const defaultConfig: Readonly<GameConfig> = BASE_CONFIG;
