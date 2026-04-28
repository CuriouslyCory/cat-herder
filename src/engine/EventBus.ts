import type { GameEvent } from "../types";

type EventType = GameEvent["type"];
type EventByType<T extends EventType> = Extract<GameEvent, { type: T }>;
type Handler<T extends EventType> = (event: EventByType<T>) => void;
type AnyHandler = Handler<EventType>;

export type Unsubscribe = () => void;

export class EventBus {
  private readonly listeners = new Map<EventType, Set<AnyHandler>>();

  emit<T extends EventType>(event: EventByType<T>): void {
    const handlers = this.listeners.get(event.type);
    if (!handlers) return;
    // Snapshot to allow handlers to safely unsubscribe during dispatch
    for (const handler of [...handlers]) {
      (handler as Handler<T>)(event);
    }
  }

  on<T extends EventType>(type: T, handler: Handler<T>): Unsubscribe {
    let handlers = this.listeners.get(type);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(type, handlers);
    }
    handlers.add(handler as AnyHandler);
    return () => this.off(type, handler);
  }

  off<T extends EventType>(type: T, handler: Handler<T>): void {
    this.listeners.get(type)?.delete(handler as AnyHandler);
  }

  /** Remove all listeners — call when tearing down the bus. */
  clear(): void {
    this.listeners.clear();
  }
}
