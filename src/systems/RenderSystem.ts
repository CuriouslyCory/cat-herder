import type { System } from "../ecs/System";
import type { World } from "../ecs/World";
import type { SceneManager } from "../engine/SceneManager";
import type { Transform } from "../ecs/components/Transform";
import type { Renderable } from "../ecs/components/Renderable";
import { TRANSFORM } from "../ecs/components/Transform";
import { RENDERABLE } from "../ecs/components/Renderable";

export class RenderSystem implements System {
  private readonly knownEntities = new Set<number>();

  constructor(private readonly sceneManager: SceneManager) {}

  update(world: World, _dt: number): void {
    const entities = world.query(TRANSFORM, RENDERABLE);
    const activeSet = new Set(entities);

    // Clean up entities that were removed
    for (const id of this.knownEntities) {
      if (!activeSet.has(id as never)) {
        this.knownEntities.delete(id);
        // Entity was destroyed; the Renderable component is gone so we can't
        // clean up the mesh handle here. Callers should call removeMesh before
        // destroying the entity if they want proper cleanup.
      }
    }

    for (const entity of entities) {
      const transform = world.getComponent<Transform>(entity, TRANSFORM);
      const renderable = world.getComponent<Renderable>(entity, RENDERABLE);
      if (!transform || !renderable) continue;

      if (!renderable.sceneHandle) {
        // First time seeing this entity — register with SceneManager
        renderable.sceneHandle = this.sceneManager.addMesh(renderable.meshConfig);
        this.knownEntities.add(entity as unknown as number);
      }

      this.sceneManager.updateTransform(
        renderable.sceneHandle,
        transform.position,
        transform.rotation,
        transform.scale,
      );
    }
  }
}
