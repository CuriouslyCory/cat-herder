import type { GameEvent } from "../types";

// ---------------------------------------------------------------------------
// EventBus — typed pub/sub built on the GameEvent discriminated union
// ---------------------------------------------------------------------------

/** A function that removes a specific listener when called. */
export type Unsubscribe = () => void;

/** Narrow a GameEvent to the variant matching the given type tag. */
type EventOfType<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;

/** Handler signature for a specific event type. */
type Handler<T extends GameEvent["type"]> = (event: EventOfType<T>) => void;

// Internal storage uses the widest safe function type so Set ops are sound.
type AnyHandler = (event: GameEvent) => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<AnyHandler>>();

  /**
   * Subscribe to events of a specific type.
   * Returns an `Unsubscribe` function that removes this listener.
   * Multiple listeners for the same type are all called in insertion order.
   */
  on<T extends GameEvent["type"]>(type: T, handler: Handler<T>): Unsubscribe {
    let bucket = this.listeners.get(type);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(type, bucket);
    }
    // The handler only ever receives EventOfType<T>, which is a subtype of
    // GameEvent, so this widening is safe at runtime.
    const anyHandler = handler as unknown as AnyHandler;
    bucket.add(anyHandler);
    return () => this.off(type, handler);
  }

  /**
   * Unsubscribe a specific handler from an event type.
   * No-op if the handler was never registered.
   */
  off<T extends GameEvent["type"]>(type: T, handler: Handler<T>): void {
    this.listeners.get(type)?.delete(handler as unknown as AnyHandler);
  }

  /**
   * Emit an event. All registered handlers for `event.type` are called
   * synchronously in insertion order.
   */
  emit(event: GameEvent): void {
    const bucket = this.listeners.get(event.type);
    if (!bucket) return;
    // Snapshot before iterating so handlers added during dispatch don't run
    // in the current cycle.
    for (const handler of [...bucket]) {
      handler(event);
    }
  }

  /** Remove all listeners — call during module teardown to prevent leaks. */
  clear(): void {
    this.listeners.clear();
  }
}
