// ---------------------------------------------------------------------------
// Centralized game config — all GDD constants in one place.
//
// CONFIG is frozen (runtime-immutable). runtimeConfig is a deep copy used
// exclusively by the debug menu so live tweaks never pollute the base values.
// ---------------------------------------------------------------------------

export interface VisualConfig {
  postProcessing: boolean;
  /** Number of hard cel bands in the toon gradient ramp (min 2). */
  toonBands: number;
  bloom: boolean;
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;
  /** OutlineEffect ink-line thickness (world-space hull inflation). */
  outlineThickness: number;
  /** Cosmetic hand-drawn vertex jitter amplitude (world units; 0 = off). */
  handDrawnJitter: number;
  /** Apply the procedural grain/hatch surface texture to meshes. */
  proceduralTexture: boolean;
  /** World units per texture tile — larger = coarser, sparser pattern. */
  textureScale: number;
  rimLighting: boolean;
}

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
  /** Derived from jumpApex and gravity: sqrt(2 * |gravity| * jumpApex). Do not set manually. */
  jumpImpulse: number;
  jumpApex: number; // apex height (u)
  coyoteFrames: number; // frames of coyote time after walking off edge
  jumpBufferFrames: number; // frames of jump buffering before landing

  // Physics
  gravity: number; // u/s² (negative = downward)
  collisionRadius: number; // player capsule radius (u)
  skinWidth: number; // collision skin (u)
  groundSnapTolerance: number; // downward snap distance for ground detection (u)

  // Oxygen (swimming)
  oxygenMax: number; // percentage (100 = full)
  oxygenDrainRate: number; // percent/s lost while diving (isDiving===true)
  oxygenRefillRate: number; // percent/s recovered on water surface (not diving)
  oxygenHealthDrainRate: number; // hp/s lost when oxygen reaches 0
  oxygenWarningThreshold: number; // percent at which OXYGEN_WARNING event fires

  // Camera
  cameraAzimuth: number; // degrees — isometric horizontal angle
  cameraElevation: number; // degrees — isometric vertical angle
  cameraLeadDistance: number; // units of camera lead ahead of player
  cameraLeadLerp: number; // lead lerp factor (0-1 per frame @60fps)

  // Cat companions
  maxActiveCats: number; // max number of simultaneously summoned cats

  // Persistence
  autoSaveIntervalMs: number; // milliseconds between auto-saves

  // Debug / time control
  timeScale: number; // simulation speed multiplier (1.0 = realtime; debug only)

  // Visual effects
  visual: VisualConfig;
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
  jumpImpulse: 0, // derived below from jumpApex + gravity
  jumpApex: 1.2,
  coyoteFrames: 5,
  jumpBufferFrames: 5,

  // Physics
  gravity: -12,
  collisionRadius: 0.4,
  skinWidth: 0.1,
  groundSnapTolerance: 0.15,

  // Oxygen
  oxygenMax: 100,            // 100% max
  oxygenDrainRate: 3.33,     // 1% per 0.3s = 3.33%/s while diving
  oxygenRefillRate: 5,       // 5%/s when floating at surface
  oxygenHealthDrainRate: 1,  // 1 hp/s when oxygen depleted
  oxygenWarningThreshold: 20, // fire warning at 20%

  // Camera
  cameraAzimuth: 45,
  cameraElevation: 30, // degrees above the horizon — lower = more oblique view
  cameraLeadDistance: 2.5,
  cameraLeadLerp: 0.08,

  // Cat companions
  maxActiveCats: 3,

  // Persistence
  autoSaveIntervalMs: 30_000,

  // Debug
  timeScale: 1.0,

  // Visual effects
  visual: {
    postProcessing: true,
    toonBands: 3,
    bloom: true,
    bloomStrength: 0.05,
    bloomThreshold: 0.85,
    bloomRadius: 0.4,
    // World-space hull inflation for OutlineEffect. Small because the ortho
    // camera has a wide view — 0.004 reads as a crisp 1–2px ink line.
    outlineThickness: 0.004,
    handDrawnJitter: 0.03,
    proceduralTexture: true,
    textureScale: 2,
    // Ink outlines now carry the silhouette, so Fresnel rim light defaults off.
    rimLighting: false,
  },
};

BASE_CONFIG.jumpImpulse = Math.sqrt(
  2 * Math.abs(BASE_CONFIG.gravity) * BASE_CONFIG.jumpApex,
);

/** Immutable production config. Import this for all production game logic. */
export const CONFIG: Readonly<GameConfig> = Object.freeze({ ...BASE_CONFIG });

/** Mutable deep copy of CONFIG — used exclusively by the debug menu. */
export const runtimeConfig: GameConfig = { ...BASE_CONFIG };

/** Recompute derived fields after the debug menu mutates runtimeConfig. */
export function recalcDerivedConfig(): void {
  runtimeConfig.jumpImpulse = Math.sqrt(
    2 * Math.abs(runtimeConfig.gravity) * runtimeConfig.jumpApex,
  );
}

// ---------------------------------------------------------------------------
// Resource node configs — gather time, yield, and respawn timers per type.
// These values are used by Game.ts spawnTestMapResourceNodes() and should
// be treated as GDD balance constants (change requires a regression test update).
// ---------------------------------------------------------------------------

export interface ResourceNodeConfig {
  /** Seconds to complete one gather interaction. */
  gatherTime: number;
  /** Items yielded per completed gather. */
  yieldAmount: number;
  /** Seconds before the node becomes ready again after being gathered. */
  respawnTime: number;
}

export const RESOURCE_CONFIGS = {
  Grass:  { gatherTime: 1.5, yieldAmount: 1, respawnTime: 30 },
  Sticks: { gatherTime: 1.5, yieldAmount: 1, respawnTime: 45 },
  Water:  { gatherTime: 2.0, yieldAmount: 1, respawnTime: 60 },
} as const satisfies Record<string, ResourceNodeConfig>;
