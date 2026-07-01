import { describe, it, expect } from "vitest";

import { resolvePlayCta } from "./play-cta";

describe("resolvePlayCta", () => {
  it("reports loading while auth is resolving (regardless of user)", () => {
    expect(resolvePlayCta({ user: null, loading: true })).toEqual({
      kind: "loading",
    });
    expect(resolvePlayCta({ user: { id: "u_1" }, loading: true })).toEqual({
      kind: "loading",
    });
  });

  it("links a signed-in user straight to /play", () => {
    expect(resolvePlayCta({ user: { id: "u_1" }, loading: false })).toEqual({
      kind: "play",
      href: "/play",
    });
  });

  it("asks a signed-out visitor to sign in", () => {
    expect(resolvePlayCta({ user: null, loading: false })).toEqual({
      kind: "signin",
    });
    expect(resolvePlayCta({ user: undefined, loading: false })).toEqual({
      kind: "signin",
    });
  });
});
