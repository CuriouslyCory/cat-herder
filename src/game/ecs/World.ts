import type { Component, ComponentType } from "./Component";
import type { Entity } from "./Entity";

/**
 * World is the ECS registry. It manages entity lifecycle and component storage,
 * and provides a cached query() API so systems can efficiently iterate archetypes.
 *
 * Query cache strategy:
 *   - Key: sorted component-type strings joined by "|"
 *   - Value: Entity[] snapshot computed on first call
 *   - Invalidated on any addComponent / removeComponent / destroyEntity call
 *     (rather than per-key invalidation — simpler, cheap enough for this scale)
 */
export class World {
  private nextId = 1;

  /** entity → (componentType → component) */
  private components = new Map<Entity, Map<ComponentType, Component>>();

  /** Alive entity set — O(1) membership check */
  private entities = new Set<Entity>();

  /** Query cache: sorted-type-key → matching entities */
  private queryCache = new Map<string, Entity[]>();

  // ── Entity lifecycle ──────────────────────────────────────────────────────

  createEntity(): Entity {
    const id = this.nextId++;
    this.entities.add(id);
    this.components.set(id, new Map());
    return id;
  }

  destroyEntity(entity: Entity): void {
    this.entities.delete(entity);
    this.components.delete(entity);
    this.invalidateCache();
  }

  // ── Component management ──────────────────────────────────────────────────

  addComponent<T extends Component>(entity: Entity, component: T): void {
    const map = this.components.get(entity);
    if (!map) return; // entity not alive — silently ignore
    map.set(component.type, component);
    this.invalidateCache();
  }

  removeComponent<T extends Component>(
    entity: Entity,
    type: ComponentType,
  ): void {
    const map = this.components.get(entity);
    if (!map) return;
    map.delete(type);
    this.invalidateCache();
  }

  getComponent<T extends Component>(
    entity: Entity,
    type: ComponentType,
  ): T | null {
    return (this.components.get(entity)?.get(type) as T | undefined) ?? null;
  }

  // ── Query (cached) ────────────────────────────────────────────────────────

  /**
   * Returns all alive entities that have every requested component type.
   * The result is a cached snapshot — identical type lists share one array.
   * Cache is fully invalidated on any structural change (add/remove/destroy).
   */
  query(...types: ComponentType[]): Entity[] {
    const key = [...types].sort().join("|");
    const cached = this.queryCache.get(key);
    if (cached) return cached;

    const result: Entity[] = [];
    for (const entity of this.entities) {
      const map = this.components.get(entity)!;
      if (types.every((t) => map.has(t))) {
        result.push(entity);
      }
    }

    this.queryCache.set(key, result);
    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private invalidateCache(): void {
    this.queryCache.clear();
  }

  /** Convenience: check if an entity is alive. */
  isAlive(entity: Entity): boolean {
    return this.entities.has(entity);
  }

  /** Total number of alive entities. */
  get entityCount(): number {
    return this.entities.size;
  }
}
