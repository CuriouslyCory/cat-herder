import type { System } from "../ecs/System";
import type { World } from "../ecs/World";
import type { Entity } from "../ecs/Entity";
import type { SceneHandle, SceneManager } from "../engine/SceneManager";
import type { Transform } from "../ecs/components/Transform";
import type { Renderable } from "../ecs/components/Renderable";

/**
 * RenderSystem — ECS-to-Three.js bridge.
 *
 * Each frame:
 *  - New entities (Transform + Renderable, sceneHandle not yet registered):
 *    → calls sceneManager.addMesh() and stores the handle
 *  - Existing entities:
 *    → calls sceneManager.updateTransform() to sync position/rotation/scale
 *  - Entities that left the query (destroyed or lost a required component):
 *    → calls sceneManager.removeMesh() to release GPU resources
 *
 * No game logic lives here — this is a pure data-sync layer.
 */
export class RenderSystem implements System {
  /**
   * Tracks scene handles for every entity currently registered with the scene.
   * Using a local map (rather than relying solely on Renderable.sceneHandle)
   * lets us clean up meshes even after an entity is destroyed and its
   * components are no longer accessible.
   */
  private readonly handles = new Map<Entity, SceneHandle>();

  constructor(private readonly sceneManager: SceneManager) {}

  update(world: World, _dt: number): void {
    const entities = world.query("Transform", "Renderable");
    const currentSet = new Set(entities);

    // ── Remove stale entities ──────────────────────────────────────────────
    // An entity is stale when it has left the query (destroyed, or lost a
    // required component). We iterate over our own handle map so we can clean
    // up even if the entity's components are already gone.
    for (const [entity, handle] of this.handles) {
      if (currentSet.has(entity)) continue;

      this.sceneManager.removeMesh(handle);

      // Best-effort: clear the cached handle on the component if it still exists.
      const renderable = world.getComponent<Renderable>(entity, "Renderable");
      if (renderable) renderable.sceneHandle = null;

      this.handles.delete(entity);
    }

    // ── Sync current entities ──────────────────────────────────────────────
    for (const entity of entities) {
      const transform = world.getComponent<Transform>(entity, "Transform")!;
      const renderable = world.getComponent<Renderable>(entity, "Renderable")!;

      // Register new entities with the scene on first encounter.
      if (!this.handles.has(entity)) {
        const handle = this.sceneManager.addMesh(renderable.meshConfig);
        renderable.sceneHandle = handle;
        this.handles.set(entity, handle);
      }

      const handle = this.handles.get(entity)!;

      this.sceneManager.updateTransform(
        handle,
        { x: transform.x, y: transform.y, z: transform.z },
        { x: 0, y: transform.rotationY, z: 0 },
        { x: transform.scaleX, y: transform.scaleY, z: transform.scaleZ },
      );
    }
  }
}
