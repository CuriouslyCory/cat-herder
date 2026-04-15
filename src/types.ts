// ─── Enums ────────────────────────────────────────────────────────────────────

export enum GameAction {
  Jump = "Jump",
  Interact = "Interact",
  ToggleMap = "ToggleMap",
  ToggleDebug = "ToggleDebug",
  Pause = "Pause",
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

// ─── Shared Geometry ──────────────────────────────────────────────────────────

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Vector2 {
  x: number;
  z: number;
}

// ─── Game Events (discriminated union) ───────────────────────────────────────

export type GameEvent =
  | { type: "PlayerJumped"; entityId: number }
  | { type: "PlayerLanded"; entityId: number }
  | { type: "TriggerEntered"; triggerId: string; entityId: number }
  | { type: "TriggerExited"; triggerId: string; entityId: number }
  | { type: "CollisionOccurred"; entityA: number; entityB: number }
  | { type: "ActionPressed"; action: GameAction }
  | { type: "MapLoaded"; mapName: string }
  | { type: "GamePaused" }
  | { type: "GameResumed" };
