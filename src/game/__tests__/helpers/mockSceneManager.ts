export type SceneHandle = symbol;

export interface MockSceneManager {
  setMeshOpacity(handle: SceneHandle, opacity: number): void;
  getOpacity(handle: SceneHandle): number | undefined;
  createHandle(): SceneHandle;
  setTerrainGrid(totalWidth: number, totalDepth: number, cellSize: number): void;
  getTerrainGridCalls(): Array<{ totalWidth: number; totalDepth: number; cellSize: number }>;
}

export function createMockSceneManager(): MockSceneManager {
  const opacities = new Map<SceneHandle, number>();
  const terrainGridCalls: Array<{ totalWidth: number; totalDepth: number; cellSize: number }> = [];

  return {
    setMeshOpacity(handle: SceneHandle, opacity: number) {
      opacities.set(handle, opacity);
    },
    getOpacity(handle: SceneHandle) {
      return opacities.get(handle);
    },
    createHandle() {
      const h = Symbol("MockSceneHandle");
      opacities.set(h, 1);
      return h;
    },
    setTerrainGrid(totalWidth: number, totalDepth: number, cellSize: number) {
      terrainGridCalls.push({ totalWidth, totalDepth, cellSize });
    },
    getTerrainGridCalls() {
      return terrainGridCalls;
    },
  };
}
