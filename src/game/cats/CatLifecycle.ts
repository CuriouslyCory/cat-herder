import type { Entity } from "../ecs/Entity";
import type { CatState } from "../ecs/components/CatBehavior";

/**
 * CatStateView — the read-only lifecycle seam consumed by per-cat effect
 * systems (ZoomiesSystem, CuriositySystem, PounceSystem).
 *
 * Effect systems READ lifecycle state and may request a despawn HOLD; they
 * never drive state transitions, teardown, or entity destruction — that is
 * CatCompanionManager's exclusive responsibility (see
 * docs/adr/0004-cat-lifecycle-single-owner.md).
 *
 * `CatCompanionManager implements CatStateView`. Effect systems declare a
 * dependency on this interface rather than the concrete manager, which keeps
 * the dependency direction clean and makes them trivially mockable in tests.
 */
export interface CatStateView {
  /** Current lifecycle state, or undefined if the entity is not a tracked cat. */
  getCatState(entity: Entity): CatState | undefined;
  /** Convenience: true iff getCatState(entity) === "Active". */
  isActive(entity: Entity): boolean;
  /**
   * Prevent the owner from despawning an Expired cat until released.
   * Ref-counted so multiple effects can hold the same cat safely.
   */
  holdDespawn(entity: Entity): void;
  /** Release a previously-placed hold. Safe to call without a matching hold. */
  releaseDespawn(entity: Entity): void;
}
