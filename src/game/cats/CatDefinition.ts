import type { CatType } from "../types";
import type { MeshConfig } from "../engine/SceneManager";

// ---------------------------------------------------------------------------
// Behavior configuration — describes what a cat does when active.
// ---------------------------------------------------------------------------

export interface CatBehaviorConfig {
  /** Seconds the active effect persists. Undefined = permanent until dismissed. */
  duration?: number;
  /** Seconds before this cat can be summoned again after dismissal. */
  cooldown?: number;
  /**
   * Cat-type-specific effect parameters. Keyed by arbitrary strings so each
   * cat type can carry its own data without needing a union of known fields.
   */
  params?: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------------------
// CatDefinition — the single source of truth for a cat type.
//
// Adding a new cat requires:
//   1. A new CatType enum entry in types.ts
//   2. A new file in src/game/cats/definitions/<CatType>.ts
//   3. A barrel export + registry entry in src/game/cats/definitions/index.ts
// ---------------------------------------------------------------------------

export type CatEffectType = "terrain" | "movement" | "utility" | "launch";

export interface CatDefinition {
  /** Discriminator — must match the CatType enum value. */
  readonly type: CatType;
  /** Display name shown in the HUD selection bar. */
  readonly name: string;
  /** Short description shown in the cat catalog / tooltip. */
  readonly description: string;
  /** Yarn cost to summon. */
  readonly yarnCost: number;
  /** Broad category used by systems to route effect logic. */
  readonly effectType: CatEffectType;
  /** Three.js primitive config for the cat's in-world mesh. */
  readonly meshConfig: MeshConfig;
  /** Behavior timing and effect parameters. */
  readonly behavior: CatBehaviorConfig;
}
