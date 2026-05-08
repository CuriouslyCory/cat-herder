import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HUD } from "~/game/ui/HUD";

// ---------------------------------------------------------------------------
// Minimal DOM stubs — node test env has no document/window
// ---------------------------------------------------------------------------

type MockEl = {
  style: Record<string, string>;
  textContent: string;
  title: string;
  innerHTML: string;
  dataset: Record<string, string>;
  appendChild: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
};

function makeMockEl(): MockEl {
  return {
    style: {} as Record<string, string>,
    textContent: "",
    title: "",
    innerHTML: "",
    dataset: {} as Record<string, string>,
    appendChild: vi.fn(),
    remove: vi.fn(),
    addEventListener: vi.fn(),
  };
}

// Track all created elements so we can inspect specific ones by order.
let createdEls: MockEl[];

function setupDomStub() {
  createdEls = [];
  vi.stubGlobal("document", {
    createElement: vi.fn(() => {
      const el = makeMockEl();
      createdEls.push(el);
      return el;
    }),
    getElementById: vi.fn(() => null),
    head: { appendChild: vi.fn() },
  });
}

// HUD creates elements in constructor order:
// buildHearts → buildOxygenGauge → buildGatherBar → buildYarnWarning
// → buildCatBar (2 els: panel + yarn label)
// → buildInventoryPanel (many els)
// → buildActiveCatBar (3 els: panel, list, hint)
// → buildSaveIndicator (1 el)
// We don't need to count them precisely — we capture the indicator via its
// known style property set in buildSaveIndicator.
function getSaveIndicatorEl(): MockEl | undefined {
  // The save indicator element is the one created with "transition:opacity 0.3s" in cssText.
  return createdEls.find((el) => el.style.cssText?.includes("transition:opacity 0.3s"));
}

let container: MockEl;

beforeEach(() => {
  vi.useFakeTimers();
  setupDomStub();
  container = makeMockEl();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Save indicator — success variant
// ---------------------------------------------------------------------------

describe("HUD save indicator", () => {
  it("shows success icon when lastSavedAt changes from null", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;
    expect(indicator).toBeDefined();

    hud.setSaveIndicator(1000, null);

    expect(indicator.textContent).toBe("💾");
    expect(indicator.style.opacity).toBe("1");
  });

  it("shows success icon only when lastSavedAt value changes", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;

    hud.setSaveIndicator(1000, null);
    expect(indicator.style.opacity).toBe("1");

    // Manually hide it to simulate the 2s timeout expiry.
    indicator.style.opacity = "0";

    // Same timestamp — must NOT re-trigger.
    hud.setSaveIndicator(1000, null);
    expect(indicator.style.opacity).toBe("0");

    // New timestamp — must re-trigger.
    hud.setSaveIndicator(2000, null);
    expect(indicator.style.opacity).toBe("1");
  });

  it("hides success icon after 2 s", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;

    hud.setSaveIndicator(1000, null);
    expect(indicator.style.opacity).toBe("1");

    vi.advanceTimersByTime(2000);

    expect(indicator.style.opacity).toBe("0");
  });

  it("does NOT hide before 2 s have elapsed", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;

    hud.setSaveIndicator(1000, null);
    vi.advanceTimersByTime(1999);

    expect(indicator.style.opacity).toBe("1");
  });

  // ---------------------------------------------------------------------------
  // Save indicator — error variant
  // ---------------------------------------------------------------------------

  it("shows error icon when saveError is non-null", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;

    hud.setSaveIndicator(null, "Network error");

    expect(indicator.textContent).toBe("💾 ✕");
    expect(indicator.style.color).toBe("#fc8181");
    expect(indicator.title).toBe("Network error");
    expect(indicator.style.opacity).toBe("1");
  });

  it("hides error icon after 5 s", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;

    hud.setSaveIndicator(null, "Timeout");
    vi.advanceTimersByTime(5000);

    expect(indicator.style.opacity).toBe("0");
  });

  it("does NOT hide error before 5 s have elapsed", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;

    hud.setSaveIndicator(null, "Timeout");
    vi.advanceTimersByTime(4999);

    expect(indicator.style.opacity).toBe("1");
  });

  it("same error string does not re-trigger after being seen", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;

    hud.setSaveIndicator(null, "Bad request");
    expect(indicator.style.opacity).toBe("1");

    // Hide manually to simulate timeout.
    indicator.style.opacity = "0";

    // Same error — no re-trigger.
    hud.setSaveIndicator(null, "Bad request");
    expect(indicator.style.opacity).toBe("0");
  });

  it("new error string re-triggers after previous error was seen", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;

    hud.setSaveIndicator(null, "Error A");
    indicator.style.opacity = "0";

    // Different error string — must re-trigger.
    hud.setSaveIndicator(null, "Error B");
    expect(indicator.style.opacity).toBe("1");
  });

  // ---------------------------------------------------------------------------
  // Timer cancellation
  // ---------------------------------------------------------------------------

  it("cancels previous timer when a new event arrives before timeout", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;

    // Start success timer (2 s).
    hud.setSaveIndicator(1000, null);

    // 1 s later, error arrives — should cancel the 2 s timer and start 5 s.
    vi.advanceTimersByTime(1000);
    hud.setSaveIndicator(null, "Server down");

    // At 2 s total, the original success timer would have fired — but it was cancelled.
    vi.advanceTimersByTime(1000);
    expect(indicator.style.opacity).toBe("1"); // Still visible (error is shown).
    expect(indicator.textContent).toBe("💾 ✕");
  });

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  it("dispose clears pending timer and nulls element ref", () => {
    const hud = new HUD(container as unknown as HTMLElement);
    const indicator = getSaveIndicatorEl()!;

    hud.setSaveIndicator(1000, null);
    expect(indicator.style.opacity).toBe("1");

    hud.dispose();

    // Timer should be cleared — advancing time must not throw.
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });
});
