import type { System } from "../ecs/System";
import type { World } from "../ecs/World";
import type { SceneManager } from "../engine/SceneManager";
import type { Renderable } from "../ecs/components/Renderable";

/**
 * VisualEffectsSystem — animates emissive properties on pickup entities.
 *
 * Runs once per render frame (variable dt):
 *  - Yarn pickups: pulses emissive intensity using a sine wave for "collectible" visual cue.
 */
export class VisualEffectsSystem implements System {
  private elapsed = 0;

  constructor(private readonly sceneManager: SceneManager) {}

  update(world: World, dt: number): void {
    this.elapsed += dt;

    const pickups = world.query("Renderable", "YarnPickup");
    for (const entity of pickups) {
      const renderable = world.getComponent<Renderable>(entity, "Renderable");
      if (!renderable?.sceneHandle) continue;

      const pulse = 0.35 + 0.25 * Math.sin(this.elapsed * 3.0);
      this.sceneManager.setMeshEmissive(renderable.sceneHandle, "#ffd700", pulse);
    }
  }
}
