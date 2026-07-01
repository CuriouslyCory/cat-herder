import { describe, it, expect } from "vitest";

import {
  HOME_CATS,
  HOW_IT_PLAYS,
  HOME_COPY,
  INITIAL_YARN,
  costLabel,
  type HomeCat,
} from "./cats";
import { CAT_REGISTRY } from "~/game/cats/definitions";
import { CatType } from "~/game/types";
import { GameState } from "~/game/engine/GameState";

/**
 * The honesty guard.
 *
 * The homepage copy in cats.ts must describe the REAL game. These tests wire
 * every mechanic claim back to the authoritative game definitions so the
 * marketing can't silently drift from what actually ships.
 */

describe("HOME_CATS — faithful to game definitions", () => {
  it("covers exactly the four real cat types", () => {
    const ids = HOME_CATS.map((c) => c.id).sort();
    const registryTypes = [...CAT_REGISTRY.keys()].sort();
    expect(ids).toEqual(registryTypes);
    expect(HOME_CATS).toHaveLength(4);
  });

  it.each(HOME_CATS.map((c) => [c.id, c] as const))(
    "%s matches its game definition",
    (_id, cat: HomeCat) => {
      const def = CAT_REGISTRY.get(cat.id as CatType);
      expect(def, `no game definition for ${cat.id}`).toBeDefined();
      if (!def) return;

      // Cost is the single most important honesty claim.
      expect(cat.yarnCost).toBe(def.yarnCost);

      // Identity color must match the in-game mesh color verbatim.
      expect(cat.colorHex.toLowerCase()).toBe(String(def.meshConfig.color).toLowerCase());

      // Lifecycle: a duration in the definition means the cat is consumed on
      // expiry; no duration means it persists (yarn refunded on dismiss).
      const hasDuration = def.behavior.duration !== undefined;
      expect(cat.lifecycle).toBe(hasDuration ? "consumed" : "permanent");

      if (hasDuration) {
        expect(cat.durationSeconds).toBe(def.behavior.duration);
      } else {
        expect(cat.durationSeconds).toBeUndefined();
      }
    },
  );

  it("cost labels read naturally", () => {
    const byId = Object.fromEntries(HOME_CATS.map((c) => [c.id, c]));
    expect(costLabel(byId.Loaf!)).toBe("1 yarn · permanent");
    expect(costLabel(byId.Zoomies!)).toBe("2 yarn · lasts 8s");
    expect(costLabel(byId.CuriosityCat!)).toBe("2 yarn · lasts 20s");
    expect(costLabel(byId.Pounce!)).toBe("3 yarn · permanent");
  });
});

describe("starting yarn matches the game", () => {
  it("INITIAL_YARN equals the GameState default", () => {
    expect(new GameState().yarn).toBe(INITIAL_YARN);
  });
});

describe("copy tells the truth — no fictional-prototype terms leak in", () => {
  // Vocabulary the prototype invented for a game that does not exist.
  const FORBIDDEN = [
    "commander",
    "clowder",
    "raid",
    "recipe",
    "craft",
    "smelt",
    "biome",
    "gem",
    "coin",
    "elemental",
    "pyro",
    "frost",
    "thunder",
    "harvest",
    "potion",
    "200+",
  ];

  const allCopy = [
    ...Object.values(HOME_COPY),
    ...HOME_CATS.flatMap((c) => [c.name, c.blurb, costLabel(c)]),
    ...HOW_IT_PLAYS.flatMap((s) => [s.title, s.body]),
  ]
    .join(" \n ")
    .toLowerCase();

  it.each(FORBIDDEN)("never mentions %s", (term) => {
    expect(allCopy).not.toContain(term);
  });
});
