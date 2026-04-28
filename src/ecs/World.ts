import type { Component } from "./Component";
import type { Entity } from "./Entity";

type ComponentStore = Map<string, Component>;

export class World {
  private nextId = 1 as Entity & number;
  private readonly entities = new Map<Entity, ComponentStore>();
  // Query cache: key = sorted component types joined by "|", value = entity list
  private readonly queryCache = new Map<string, Entity[]>();
  private cacheDirty = false;

  // ─── Entity lifecycle ────────────────────────────────────────────────────────

  createEntity(): Entity {
    const id = this.nextId as Entity;
    this.nextId = (this.nextId + 1) as Entity & number;
    this.entities.set(id, new Map());
    return id;
  }

  destroyEntity(entity: Entity): void {
    this.entities.delete(entity);
    this.invalidateCache();
  }

  // ─── Component management ────────────────────────────────────────────────────

  addComponent<T extends Component>(entity: Entity, component: T): void {
    const store = this.entities.get(entity);
    if (!store) return;
    store.set(component.type, component);
    this.invalidateCache();
  }

  removeComponent(entity: Entity, componentType: string): void {
    const store = this.entities.get(entity);
    if (!store) return;
    store.delete(componentType);
    this.invalidateCache();
  }

  getComponent<T extends Component>(entity: Entity, type: string): T | null {
    return (this.entities.get(entity)?.get(type) as T | undefined) ?? null;
  }

  hasComponent(entity: Entity, type: string): boolean {
    return this.entities.get(entity)?.has(type) ?? false;
  }

  // ─── Query ────────────────────────────────────────────────────────────────────

  /**
   * Returns all entities that have ALL of the specified component types.
   * Results are cached; cache is invalidated whenever components are added/removed.
   */
  query(...componentTypes: string[]): Entity[] {
    const key = [...componentTypes].sort().join("|");

    if (!this.cacheDirty) {
      const cached = this.queryCache.get(key);
      if (cached) return cached;
    }

    if (this.cacheDirty) {
      this.queryCache.clear();
      this.cacheDirty = false;
    }

    const result: Entity[] = [];
    for (const [entity, store] of this.entities) {
      if (componentTypes.every((t) => store.has(t))) {
        result.push(entity);
      }
    }
    this.queryCache.set(key, result);
    return result;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private invalidateCache(): void {
    this.cacheDirty = true;
  }
}
