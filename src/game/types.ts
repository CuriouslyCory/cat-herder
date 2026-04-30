// ---------------------------------------------------------------------------
// Game enumerations
// ---------------------------------------------------------------------------

export enum GameAction {
  Jump = "Jump",
  Interact = "Interact",
  ToggleMap = "ToggleMap",
  ToggleDebug = "ToggleDebug",
  Pause = "Pause",
  Dive = "Dive",
}

export enum CatType {
  Loaf = "Loaf",
  Zoomies = "Zoomies",
  CuriosityCat = "CuriosityCat",
  Pounce = "Pounce",
}

export enum TerrainType {
  Grass = "Grass",
  Dirt = "Dirt",
  Stone = "Stone",
  Water = "Water",
  Hidden = "Hidden",
}

// ---------------------------------------------------------------------------
// Vector types (Three.js-compatible, no three import required)
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

// ---------------------------------------------------------------------------
// GameEvent discriminated union
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: "player:action"; action: GameAction }
  | { type: "player:grounded"; entity: number }
  | { type: "player:airborne"; entity: number }
  | { type: "player:spawned"; entity: number }
  | { type: "collision:enter"; entityA: number; entityB: number }
  | { type: "collision:exit"; entityA: number; entityB: number }
  | { type: "trigger:enter"; trigger: number; target: number }
  | { type: "trigger:exit"; trigger: number; target: number }
  | { type: "map:loaded"; mapName: string }
  | { type: "save:requested" }
  | { type: "save:complete" }
  | { type: "debug:toggled"; visible: boolean }
  | { type: "game:paused" }
  | { type: "game:resumed" };
