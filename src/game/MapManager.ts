import type { World } from "../ecs/World";
import type { MapData, SpawnPoint } from "../maps/MapData";
import { TerrainType } from "../types";
import { createTransform } from "../ecs/components/Transform";
import { createRenderable } from "../ecs/components/Renderable";
import { createCollider } from "../ecs/components/Collider";

// Terrain color map
const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.Grass]: "#4caf50",
  [TerrainType.Dirt]: "#8d6e63",
  [TerrainType.Stone]: "#9e9e9e",
  [TerrainType.Water]: "#1e88e5",
  [TerrainType.Hidden]: "#212121",
};

// Size of each terrain cell in world units
const CELL_SIZE = 1;

export class MapManager {
  private currentMap: MapData | null = null;

  constructor(private readonly world: World) {}

  loadMap(data: MapData): void {
    this.currentMap = data;
    this.spawnTerrain(data);
    this.spawnBoundaryWalls(data);
  }

  getTerrainAt(x: number, z: number): TerrainType {
    if (!this.currentMap) return TerrainType.Grass;
    const col = Math.floor(x);
    const row = Math.floor(z);
    const cell = this.currentMap.terrain[row]?.[col];
    return cell?.type ?? TerrainType.Grass;
  }

  getHeightAt(x: number, z: number): number {
    if (!this.currentMap) return 0;
    const col = Math.floor(x);
    const row = Math.floor(z);
    return this.currentMap.terrain[row]?.[col]?.height ?? 0;
  }

  getSpawnPoints(): SpawnPoint[] {
    return this.currentMap?.spawnPoints ?? [];
  }

  private spawnTerrain(data: MapData): void {
    for (let row = 0; row < data.terrain.length; row++) {
      const terrainRow = data.terrain[row];
      if (!terrainRow) continue;
      for (let col = 0; col < terrainRow.length; col++) {
        const cell = terrainRow[col];
        if (!cell) continue;

        const entity = this.world.createEntity();
        const height = cell.height;

        this.world.addComponent(
          entity,
          createTransform(
            { x: col * CELL_SIZE + CELL_SIZE / 2, y: height / 2, z: row * CELL_SIZE + CELL_SIZE / 2 },
            { x: 0, y: 0, z: 0 },
            { x: CELL_SIZE, y: Math.max(height, 0.1), z: CELL_SIZE },
          ),
        );

        this.world.addComponent(
          entity,
          createRenderable({
            geometry: "box",
            size: [CELL_SIZE, Math.max(height, 0.1), CELL_SIZE],
            color: TERRAIN_COLORS[cell.type],
            receiveShadow: true,
          }),
        );

        if (cell.navigable) {
          this.world.addComponent(
            entity,
            createCollider(
              "box",
              { x: CELL_SIZE, y: Math.max(height, 0.1), z: CELL_SIZE },
              { isStatic: true },
            ),
          );
        }
      }
    }
  }

  private spawnBoundaryWalls(data: MapData): void {
    const w = data.size.width;
    const d = data.size.depth;
    const wallHeight = 4;
    const wallThickness = 1;

    const walls = [
      // North
      { x: w / 2, z: -wallThickness / 2, sx: w, sz: wallThickness },
      // South
      { x: w / 2, z: d + wallThickness / 2, sx: w, sz: wallThickness },
      // West
      { x: -wallThickness / 2, z: d / 2, sx: wallThickness, sz: d },
      // East
      { x: w + wallThickness / 2, z: d / 2, sx: wallThickness, sz: d },
    ];

    for (const wall of walls) {
      const entity = this.world.createEntity();
      this.world.addComponent(
        entity,
        createTransform(
          { x: wall.x, y: wallHeight / 2, z: wall.z },
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 1 },
        ),
      );
      this.world.addComponent(
        entity,
        createCollider(
          "box",
          { x: wall.sx, y: wallHeight, z: wall.sz },
          { isStatic: true },
        ),
      );
    }
  }
}
