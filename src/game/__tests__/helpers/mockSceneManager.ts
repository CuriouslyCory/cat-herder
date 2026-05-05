export type SceneHandle = symbol;

export interface MockSceneManager {
  setMeshOpacity(handle: SceneHandle, opacity: number): void;
  getOpacity(handle: SceneHandle): number | undefined;
  createHandle(): SceneHandle;
}

export function createMockSceneManager(): MockSceneManager {
  const opacities = new Map<SceneHandle, number>();

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
  };
}
