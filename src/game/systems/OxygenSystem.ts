import type { System } from "../ecs/System";
import type { World } from "../ecs/World";
import type { EventBus } from "../engine/EventBus";
import type { OxygenState } from "../ecs/components/OxygenState";
import type { SwimmingState } from "../ecs/components/SwimmingState";
import type { PlayerControlled } from "../ecs/components/PlayerControlled";
import { runtimeConfig } from "../config";

/**
 * OxygenSystem — drives oxygen drain, refill, and health penalty each physics tick.
 *
 * Logic per frame:
 *  1. For each entity with OxygenState + SwimmingState + PlayerControlled:
 *     - If diving (SwimmingState.isDiving): drain oxygenDrainRate %/s
 *     - If on surface (!isDiving): refill oxygenRefillRate %/s
 *  2. At oxygenWarningThreshold (%): emit oxygen:warning once per submersion.
 *  3. At 0%: emit oxygen:depleted once per submersion, then drain health at
 *     oxygenHealthDrainRate hp/s (accumulated to avoid sub-frame rounding).
 *  4. On water exit (OxygenState removed by WaterSystem): oxygen is already
 *     reset to 100 — no action needed here.
 *
 * Frame position in the loop:
 *   MovementSystem → PhysicsEngine.step() → CollisionSystem → WaterSystem
 *   → **OxygenSystem**
 */
export class OxygenSystem implements System {
  constructor(private readonly eventBus: EventBus) {}

  update(world: World, dt: number): void {
    const entities = world.query("OxygenState", "SwimmingState", "PlayerControlled");

    for (const entity of entities) {
      const oxygen = world.getComponent<OxygenState>(entity, "OxygenState")!;
      const swimming = world.getComponent<SwimmingState>(entity, "SwimmingState")!;
      const player = world.getComponent<PlayerControlled>(entity, "PlayerControlled")!;

      const cfg = runtimeConfig;

      // ── 1. Drain or refill based on dive state ────────────────────────────
      if (swimming.isDiving) {
        oxygen.oxygenPercent = Math.max(0, oxygen.oxygenPercent - cfg.oxygenDrainRate * dt);
      } else {
        // On the water surface — refill (but not above 100)
        oxygen.oxygenPercent = Math.min(cfg.oxygenMax, oxygen.oxygenPercent + cfg.oxygenRefillRate * dt);
      }

      // ── 2. Warning threshold ──────────────────────────────────────────────
      if (!oxygen.hasEmittedWarning && oxygen.oxygenPercent <= cfg.oxygenWarningThreshold) {
        oxygen.hasEmittedWarning = true;
        this.eventBus.emit({ type: "oxygen:warning", entity });
      }

      // ── 3. Depletion: health drain when oxygen = 0 ────────────────────────
      if (oxygen.oxygenPercent <= 0) {
        if (!oxygen.hasEmittedDepleted) {
          oxygen.hasEmittedDepleted = true;
          this.eventBus.emit({ type: "oxygen:depleted", entity });
        }

        // Accumulate fractional hp loss; apply integer portions to avoid float drift
        oxygen.healthDrainAccum += cfg.oxygenHealthDrainRate * dt;
        const hpLoss = Math.floor(oxygen.healthDrainAccum);
        if (hpLoss > 0) {
          oxygen.healthDrainAccum -= hpLoss;
          player.health = Math.max(0, player.health - hpLoss);
        }
      } else {
        // Oxygen above 0 — clear accumulated damage and allow re-emitting warning
        // on next depletion (but don't reset hasEmittedWarning; it fires once per dive)
        oxygen.healthDrainAccum = 0;
      }
    }
  }
}
