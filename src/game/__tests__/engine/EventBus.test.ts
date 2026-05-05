import { describe, it, expect, vi } from "vitest";
import { EventBus } from "~/game/engine/EventBus";
import { CatType } from "~/game/types";

describe("EventBus", () => {
  it("delivers events to matching listeners", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("cat:summoned", handler);

    const event = {
      type: "cat:summoned" as const,
      entity: 1,
      catType: CatType.Loaf,
      position: { x: 0, y: 0, z: 0 },
    };
    bus.emit(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("does not deliver events to non-matching listeners", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("cat:dismissed", handler);

    bus.emit({
      type: "cat:summoned",
      entity: 1,
      catType: CatType.Loaf,
      position: { x: 0, y: 0, z: 0 },
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribes via returned function", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.on("oxygen:warning", handler);
    unsub();

    bus.emit({ type: "oxygen:warning", entity: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("clears all listeners", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("oxygen:warning", handler);
    bus.clear();

    bus.emit({ type: "oxygen:warning", entity: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls multiple handlers in insertion order", () => {
    const bus = new EventBus();
    const order: number[] = [];
    bus.on("game:paused", () => order.push(1));
    bus.on("game:paused", () => order.push(2));

    bus.emit({ type: "game:paused" });
    expect(order).toEqual([1, 2]);
  });
});
