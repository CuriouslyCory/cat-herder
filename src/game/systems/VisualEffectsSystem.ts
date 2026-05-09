import type { System } from "../ecs/System";
import type { World } from "../ecs/World";
import type { SceneManager } from "../engine/SceneManager";
import type { Renderable } from "../ecs/components/Renderable";
import type { Transform } from "../ecs/components/Transform";
import type { Entity } from "../ecs/Entity";
import type { CatScaleAnimation } from "../ecs/components/CatScaleAnimation";
import { createShadowSprite } from "../ecs/components/ShadowSprite";
import { createTransform } from "../ecs/components/Transform";
import { createRenderable } from "../ecs/components/Renderable";

const SHADOW_Y = 0.02;
const SHADOW_RADIUS = 0.4;
const SHADOW_HEIGHT = 0.02;
const SHADOW_OPACITY = 0.3;
const WATER_OPACITY_BASE = 0.7;
const WATER_OPACITY_AMP = 0.1;
const WATER_PULSE_SPEED = 1.5;

/**
 * VisualEffectsSystem — per-frame visual animations.
 *
 * - Yarn pickups: emissive pulse (sine wave) for "collectible" cue.
 * - Water zones: opacity pulse between 0.6-0.8 for animated water.
 * - Ground shadows: elliptical flat disk entities that follow player/cat
 *   XZ positions at ground level (y=SHADOW_Y).
 */
export class VisualEffectsSystem implements System {
  private elapsed = 0;
  private readonly _shadowMap = new Map<Entity, Entity>();

  constructor(private readonly sceneManager: SceneManager) {}

  update(world: World, dt: number): void {
    this.elapsed += dt;
    this._updateScaleAnimations(world, dt);
    this._updateYarnPickups(world);
    this._updateWater(world);
    this._updateShadows(world);
  }

  private _updateScaleAnimations(world: World, dt: number): void {
    const entitiesToDestroy: Entity[] = [];
    const entities = world.query("CatScaleAnimation", "Transform");

    for (const entity of entities) {
      const anim = world.getComponent<CatScaleAnimation>(entity, "CatScaleAnimation")!;
      const transform = world.getComponent<Transform>(entity, "Transform")!;

      anim.elapsed += dt;
      const t = Math.min(anim.elapsed / anim.duration, 1);
      const scale = anim.fromScale + (anim.toScale - anim.fromScale) * t;

      transform.scaleX = scale;
      transform.scaleY = scale;
      transform.scaleZ = scale;

      if (t >= 1) {
        if (anim.destroyOnComplete) {
          entitiesToDestroy.push(entity);
        } else {
          world.removeComponent(entity, "CatScaleAnimation");
        }
      }
    }

    // Destroy after iteration to avoid mutating the query snapshot mid-loop.
    for (const entity of entitiesToDestroy) {
      world.destroyEntity(entity);
    }
  }

  private _updateYarnPickups(world: World): void {
    const pickups = world.query("Renderable", "YarnPickup");
    for (const entity of pickups) {
      const renderable = world.getComponent<Renderable>(entity, "Renderable");
      if (!renderable?.sceneHandle) continue;
      const pulse = 0.35 + 0.25 * Math.sin(this.elapsed * 3.0);
      this.sceneManager.setMeshEmissive(renderable.sceneHandle, "#ffd700", pulse);
    }
  }

  private _updateWater(world: World): void {
    const waterEntities = world.query("Renderable", "WaterTrigger");
    const opacity =
      WATER_OPACITY_BASE + WATER_OPACITY_AMP * Math.sin(this.elapsed * WATER_PULSE_SPEED);
    for (const entity of waterEntities) {
      const renderable = world.getComponent<Renderable>(entity, "Renderable");
      if (!renderable?.sceneHandle) continue;
      this.sceneManager.setMeshOpacity(renderable.sceneHandle, opacity);
    }
  }

  private _updateShadows(world: World): void {
    const parentEntities = new Set<Entity>([
      ...world.query("PlayerControlled", "Transform"),
      ...world.query("CatBehavior", "Transform"),
    ]);

    // Destroy shadows for entities no longer in the world
    for (const [parentEntity, shadowEntity] of this._shadowMap) {
      if (!parentEntities.has(parentEntity)) {
        world.destroyEntity(shadowEntity);
        this._shadowMap.delete(parentEntity);
      }
    }

    // Create shadows for new entities; track position for existing ones
    for (const parentEntity of parentEntities) {
      const parentTransform = world.getComponent<Transform>(parentEntity, "Transform");
      if (!parentTransform) continue;

      if (!this._shadowMap.has(parentEntity)) {
        const shadowEntity = world.createEntity();
        world.addComponent(
          shadowEntity,
          createTransform(parentTransform.x, SHADOW_Y, parentTransform.z),
        );
        world.addComponent(
          shadowEntity,
          createRenderable({
            geometry: "cylinder",
            dims: [SHADOW_RADIUS, SHADOW_RADIUS, SHADOW_HEIGHT],
            color: "#000000",
            opacity: SHADOW_OPACITY,
            castShadow: false,
            receiveShadow: false,
          }),
        );
        world.addComponent(shadowEntity, createShadowSprite(parentEntity));
        this._shadowMap.set(parentEntity, shadowEntity);
      } else {
        const shadowEntity = this._shadowMap.get(parentEntity)!;
        const shadowTransform = world.getComponent<Transform>(shadowEntity, "Transform");
        if (shadowTransform) {
          shadowTransform.x = parentTransform.x;
          shadowTransform.z = parentTransform.z;
        }
      }
    }
  }
}
