import type { System } from "../ecs/System";
import type { World } from "../ecs/World";
import type { EventBus, Unsubscribe } from "../engine/EventBus";
import type { PhysicsEngine } from "../engine/PhysicsEngine";
import type { WaterTrigger } from "../ecs/components/WaterTrigger";
import { createSwimmingState } from "../ecs/components/SwimmingState";

/**
 * WaterSystem — manages SwimmingState lifecycle via trigger events.
 *
 * Responsibilities:
 *  1. On trigger:enter with a WaterTrigger entity: add SwimmingState to the
 *     overlapping PlayerControlled entity and disable gravity on its physics body.
 *  2. On trigger:exit: remove SwimmingState and re-enable gravity.
 *
 * The actual swimming physics (speed, buoyancy, diving) are applied each frame
 * by MovementSystem which reads SwimmingState directly — no state machine needed.
 *
 * Frame order: WaterSystem subscribes to EventBus, so it reacts synchronously
 * when CollisionSystem.update() emits trigger:enter / trigger:exit.
 */
export class WaterSystem implements System {
  private readonly unsubs: Unsubscribe[] = [];

  constructor(
    private readonly world: World,
    private readonly physics: PhysicsEngine,
    eventBus: EventBus,
  ) {
    this.unsubs.push(
      eventBus.on("trigger:enter", ({ trigger, target }) => {
        this.onTriggerEnter(trigger, target);
      }),
      eventBus.on("trigger:exit", ({ trigger, target }) => {
        this.onTriggerExit(trigger, target);
      }),
    );
  }

  /** No per-frame work needed — all state changes are event-driven. */
  update(_world: World, _dt: number): void {}

  dispose(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Called when two entities begin overlapping.
   * Either entity could be the water trigger (entity IDs are sorted in the key),
   * so check both.
   */
  private onTriggerEnter(entityA: number, entityB: number): void {
    const [waterEntity, playerEntity] = this.resolveWaterPlayer(entityA, entityB);
    if (waterEntity === null || playerEntity === null) return;

    const waterTrigger = this.world.getComponent<WaterTrigger>(waterEntity, "WaterTrigger");
    if (!waterTrigger) return;

    // Skip if already swimming (re-entry guard)
    if (this.world.getComponent(playerEntity, "SwimmingState")) return;

    this.world.addComponent(playerEntity, createSwimmingState(waterTrigger.surfaceY));

    const handle = this.physics.getHandleByEntity(playerEntity);
    if (handle) this.physics.setGravityEnabled(handle, false);
  }

  private onTriggerExit(entityA: number, entityB: number): void {
    const [_waterEntity, playerEntity] = this.resolveWaterPlayer(entityA, entityB);
    if (playerEntity === null) return;
    if (!this.world.getComponent(playerEntity, "SwimmingState")) return;

    this.world.removeComponent(playerEntity, "SwimmingState");

    const handle = this.physics.getHandleByEntity(playerEntity);
    if (handle) this.physics.setGravityEnabled(handle, true);
  }

  /**
   * Given two entity IDs from a trigger event, returns [waterEntity, playerEntity]
   * or [null, null] if neither pair matches (not a water-player interaction).
   */
  private resolveWaterPlayer(
    entityA: number,
    entityB: number,
  ): [number, number] | [null, null] {
    const aIsWater = !!this.world.getComponent(entityA, "WaterTrigger");
    const bIsPlayer = !!this.world.getComponent(entityB, "PlayerControlled");
    if (aIsWater && bIsPlayer) return [entityA, entityB];

    const bIsWater = !!this.world.getComponent(entityB, "WaterTrigger");
    const aIsPlayer = !!this.world.getComponent(entityA, "PlayerControlled");
    if (bIsWater && aIsPlayer) return [entityB, entityA];

    return [null, null];
  }
}
