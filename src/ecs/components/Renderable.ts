import type { Component } from "../Component";
import type { MeshConfig, SceneHandle } from "../../engine/SceneManager";

export const RENDERABLE = "Renderable";

export interface Renderable extends Component {
  readonly type: typeof RENDERABLE;
  meshConfig: MeshConfig;
  /** Set by RenderSystem once the mesh is registered with SceneManager. */
  sceneHandle: SceneHandle | null;
}

export function createRenderable(meshConfig: MeshConfig): Renderable {
  return { type: RENDERABLE, meshConfig, sceneHandle: null };
}
