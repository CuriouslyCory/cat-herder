import { TerrainType } from "~/game/types";

export interface MockMapManager {
  getHeightAt(x: number, z: number): number;
  getTerrainAt(x: number, z: number): { type: TerrainType } | null;
  setTerrain(x: number, z: number, type: TerrainType): void;
  setHeight(x: number, z: number, height: number): void;
}

export function createMockMapManager(): MockMapManager {
  const terrainMap = new Map<string, TerrainType>();
  const heightMap = new Map<string, number>();

  const key = (x: number, z: number) => `${Math.floor(x)},${Math.floor(z)}`;

  return {
    getHeightAt(x: number, z: number) {
      return heightMap.get(key(x, z)) ?? 0;
    },
    getTerrainAt(x: number, z: number) {
      const type = terrainMap.get(key(x, z));
      if (type === undefined) return { type: TerrainType.Grass };
      return { type };
    },
    setTerrain(x: number, z: number, type: TerrainType) {
      terrainMap.set(key(x, z), type);
    },
    setHeight(x: number, z: number, height: number) {
      heightMap.set(key(x, z), height);
    },
  };
}
