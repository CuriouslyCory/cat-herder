import type { World } from "../ecs/World";
import type { Entity } from "../ecs/Entity";
import type { EventBus } from "../engine/EventBus";
import { createTransform } from "../ecs/components/Transform";
import { createRenderable } from "../ecs/components/Renderable";
import { createCollider } from "../ecs/components/Collider";
import { createWaterTrigger } from "../ecs/components/WaterTrigger";
import { createHiddenTerrain } from "../ecs/components/HiddenTerrain";
import type { MapData, TerrainCell, SpawnPoint } from "./MapData";
import { TerrainType } from "../types";

// ---------------------------------------------------------------------------
// MapManager — loads MapData into the ECS world as terrain entities
//
// Design:
//   - loadMap() runs a greedy-rectangle merge over the terrain grid to group
//     adjacent same-type same-height cells into maximal rectangles.  Each
//     rectangle becomes a single ECS entity (Transform + Renderable + Collider)
//     so the entity count stays small regardless of grid resolution.
//   - Boundary walls are added as four static box entities around the perimeter.
//   - Terrain collision layers:
//       Layer 2 — floor tiles (mask 0 → ignored by CollisionSystem; ground
//                 detection is handled by PhysicsEngine raycasting).
//       Layer 2 / mask 1 — elevated platform edges (registered as solid static
//                 bodies when US-017 wires PhysicsEngine).
//       Layer 1 / mask 1 — boundary walls (blocked for any layer-1 entity).
//       Water tiles — isTrigger so swim events fire without a physics push.
// ---------------------------------------------------------------------------

const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.Grass]: "#4a7c59",
  [TerrainType.Dirt]: "#8b6355",
  [TerrainType.Stone]: "#6e7074",
  [TerrainType.Water]: "#1565c0",
  [TerrainType.Hidden]: "#1a1a2e", // matches scene background — effectively invisible
};

/** Visual thickness of flat terrain slabs below their surface (world units). */
const FLOOR_THICKNESS = 0.2;

/** Height of boundary walls (world units). */
const WALL_HEIGHT = 5;

/** Thickness of boundary walls (world units). */
const WALL_THICKNESS = 1;

interface TerrainZone {
  cell: TerrainCell;
  worldX: number;
  worldZ: number;
  width: number;
  depth: number;
}

export class MapManager {
  private mapData: MapData | null = null;
  private readonly terrainEntities: Entity[] = [];

  constructor(
    private readonly world: World,
    private readonly eventBus: EventBus,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Load a map: destroys any existing terrain entities, builds new ones from
   * the provided MapData, and emits the `map:loaded` event.
   */
  loadMap(data: MapData): void {
    this.unloadMap();
    this.mapData = data;

    for (const zone of this.buildZones(data)) {
      this.createTerrainEntity(zone);
    }
    this.createBoundaryWalls(data);

    this.eventBus.emit({ type: "map:loaded", mapName: data.name });
  }

  /** Destroy all terrain entities and clear internal state. */
  unloadMap(): void {
    for (const entity of this.terrainEntities) {
      this.world.destroyEntity(entity);
    }
    this.terrainEntities.length = 0;
    this.mapData = null;
  }

  /**
   * Return the terrain cell at the given world position, or null if
   * outside the map or no map is loaded.
   */
  getTerrainAt(x: number, z: number): TerrainCell | null {
    if (!this.mapData) return null;
    const { terrain, size, cellSize } = this.mapData;
    const col = Math.floor((x + size.width / 2) / cellSize);
    const row = Math.floor((z + size.depth / 2) / cellSize);
    return terrain[row]?.[col] ?? null;
  }

  /** Return the surface height at the given world position (0 if outside). */
  getHeightAt(x: number, z: number): number {
    return this.getTerrainAt(x, z)?.height ?? 0;
  }

  /** Return all spawn points defined by the current map. */
  getSpawnPoints(): SpawnPoint[] {
    return this.mapData?.spawnPoints ?? [];
  }

  /** Return the first spawn point matching the given role, or undefined. */
  getSpawnPoint(role: SpawnPoint["role"]): SpawnPoint | undefined {
    return this.mapData?.spawnPoints.find((s) => s.role === role);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Group adjacent same-type same-height cells into maximal rectangles using a
   * greedy right-then-down expansion.  One zone → one ECS entity.
   */
  private buildZones(data: MapData): TerrainZone[] {
    const ROWS = data.terrain.length;
    const COLS = data.terrain[0]?.length ?? 0;
    const cs = data.cellSize;
    const halfW = data.size.width / 2;
    const halfD = data.size.depth / 2;

    const visited: boolean[][] = Array.from({ length: ROWS }, () =>
      new Array<boolean>(COLS).fill(false),
    );
    const zones: TerrainZone[] = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (visited[r]![c]) continue;

        const cell = data.terrain[r]![c]!;

        // Expand right
        let c2 = c;
        while (
          c2 + 1 < COLS &&
          !(visited[r]![c2 + 1] ?? false) &&
          data.terrain[r]![c2 + 1]!.type === cell.type &&
          data.terrain[r]![c2 + 1]!.height === cell.height
        ) {
          c2++;
        }

        // Expand down — all columns c..c2 in the next row must match
        let r2 = r;
        expandDown: while (r2 + 1 < ROWS) {
          for (let cc = c; cc <= c2; cc++) {
            const next = data.terrain[r2 + 1]?.[cc];
            if (
              !next ||
              (visited[r2 + 1]?.[cc] ?? false) ||
              next.type !== cell.type ||
              next.height !== cell.height
            ) {
              break expandDown;
            }
          }
          r2++;
        }

        // Mark all cells in this rectangle as visited
        for (let rr = r; rr <= r2; rr++) {
          for (let cc = c; cc <= c2; cc++) {
            visited[rr]![cc] = true;
          }
        }

        const width = (c2 - c + 1) * cs;
        const depth = (r2 - r + 1) * cs;
        const worldX = -halfW + c * cs + width / 2;
        const worldZ = -halfD + r * cs + depth / 2;

        zones.push({ cell, worldX, worldZ, width, depth });
      }
    }

    return zones;
  }

  private createTerrainEntity(zone: TerrainZone): void {
    const { cell, worldX, worldZ, width, depth } = zone;
    const color = TERRAIN_COLORS[cell.type];

    // Elevated terrain: box from y=0 to y=height (center at height/2).
    // Flat terrain: thin slab whose top face is at y=0 (center at -FLOOR_THICKNESS/2).
    const boxHeight =
      cell.height > 0 ? cell.height : FLOOR_THICKNESS;
    const centerY =
      cell.height > 0 ? cell.height / 2 : -FLOOR_THICKNESS / 2;

    const entity = this.world.createEntity();

    this.world.addComponent(entity, createTransform(worldX, centerY, worldZ));

    // Hidden terrain starts fully transparent (opacity 0) so it is invisible until
    // a Curiosity Cat reveals it.  The reveal mechanic switches opacity to 1.
    const isHidden = cell.type === TerrainType.Hidden;

    this.world.addComponent(
      entity,
      createRenderable({
        geometry: "box",
        dims: [width, boxHeight, depth],
        color,
        receiveShadow: !isHidden,
        castShadow: cell.height > 0 && !isHidden,
        opacity: isHidden ? 0 : 1,
      }),
    );

    // Tag hidden entities so CuriositySystem can find and reveal them.
    if (isHidden) {
      this.world.addComponent(entity, createHiddenTerrain());
    }

    // Collision config:
    //   Water → trigger (swim events, no physics push); layer 1 + mask 1 so
    //           CollisionSystem detects overlap with the layer-1 player entity.
    //   Hidden → collisionMask=0 until revealed (CuriositySystem re-enables it).
    //   Flat floor → collisionMask=0 (CollisionSystem skips; PhysicsEngine raycasts)
    //   Elevated terrain → collisionMask=1 (interacts with player via CollisionSystem)
    const isTrigger = cell.type === TerrainType.Water;

    if (isTrigger) {
      // Water surfaces use the player's layer (1) so CollisionSystem fires trigger events.
      this.world.addComponent(
        entity,
        createCollider("box", Math.max(width, depth) / 2, {
          isStatic: true,
          isTrigger: true,
          collisionLayer: 1,
          collisionMask: 1,
          halfExtents: { x: width / 2, z: depth / 2 },
        }),
      );
      // Tag so WaterSystem can identify this as a water zone.
      // Surface Y = top of the water slab = cell.height (0 for flat water).
      this.world.addComponent(entity, createWaterTrigger(cell.height));
    } else {
      const collisionMask = isHidden ? 0 : cell.height > 0 ? 1 : 0;
      this.world.addComponent(
        entity,
        createCollider("box", Math.max(width, depth) / 2, {
          isStatic: true,
          isTrigger: false,
          collisionLayer: 2,
          collisionMask,
          halfExtents: { x: width / 2, z: depth / 2 },
        }),
      );
    }

    this.terrainEntities.push(entity);
  }

  private createBoundaryWalls(data: MapData): void {
    const hw = data.size.width / 2;
    const hd = data.size.depth / 2;
    const wallY = WALL_HEIGHT / 2;
    const t = WALL_THICKNESS;
    const totalW = data.size.width + t * 2;

    const walls = [
      { cx: 0, cz: -(hd + t / 2), w: totalW, d: t },           // North
      { cx: 0, cz: hd + t / 2, w: totalW, d: t },              // South
      { cx: -(hw + t / 2), cz: 0, w: t, d: data.size.depth },  // West
      { cx: hw + t / 2, cz: 0, w: t, d: data.size.depth },     // East
    ];

    for (const { cx, cz, w, d } of walls) {
      const entity = this.world.createEntity();
      this.world.addComponent(entity, createTransform(cx, wallY, cz));
      this.world.addComponent(
        entity,
        createRenderable({
          geometry: "box",
          dims: [w, WALL_HEIGHT, d],
          color: "#555566",
          castShadow: true,
          receiveShadow: true,
        }),
      );
      // Boundary walls interact with any layer-1 entity (e.g. the player)
      this.world.addComponent(
        entity,
        createCollider("box", Math.max(w, d) / 2, {
          isStatic: true,
          collisionLayer: 1,
          collisionMask: 1,
          halfExtents: { x: w / 2, z: d / 2 },
        }),
      );
      this.terrainEntities.push(entity);
    }
  }
}
