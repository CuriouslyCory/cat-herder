import type { Component } from "../Component";
import type { MeshConfig, SceneHandle } from "../../engine/SceneManager";

export interface Renderable extends Component {
  readonly type: "Renderable";
  /** Config passed to SceneManager.addMesh() */
  meshConfig: MeshConfig;
  /**
   * Opaque handle returned by SceneManager.addMesh().
   * Null until RenderSystem has registered this entity with the scene.
   */
  sceneHandle: SceneHandle | null;
}

export function createRenderable(meshConfig: MeshConfig): Renderable {
  return { type: "Renderable", meshConfig, sceneHandle: null };
}
