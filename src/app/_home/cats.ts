/**
 * Homepage content — the single source of truth for everything the title
 * screen says about the game.
 *
 * Every mechanic claim here is cross-checked against the actual game
 * definitions (src/game/cats/definitions/*.ts) by cats.test.ts, so the
 * marketing copy can never drift from what the game really does. If a value
 * below is wrong, the test fails — that is the point.
 *
 * NOTE: The original prototype invented a different game (elemental battle
 * cats, crafting recipes, resource farming, raids). None of that is real.
 * The real Cat-Herder is a zen puzzle-platformer where cats become terrain.
 */

/** Yarn the player starts with — GameState default (src/game/engine/GameState.ts). */
export const INITIAL_YARN = 10;

export type CatLifecycle = "permanent" | "consumed";

export interface HomeCat {
  /** Matches the game CatType enum value exactly. */
  readonly id: "Loaf" | "Zoomies" | "CuriosityCat" | "Pounce";
  /** Display name on the homepage (game "name" drops the "Cat" suffix here). */
  readonly name: string;
  /** Yarn cost to summon. */
  readonly yarnCost: number;
  /** Whether the cat stays (yarn refunded) or fades (yarn consumed). */
  readonly lifecycle: CatLifecycle;
  /** For consumed cats: seconds the effect lasts. */
  readonly durationSeconds?: number;
  /** CSS custom property holding this cat's identity color. */
  readonly colorVar: `--color-${string}`;
  /** The identity color's hex, mirrored for the honesty check. */
  readonly colorHex: string;
  /** One true line about what the cat does. */
  readonly blurb: string;
}

/** The four real companions, in summon-slot order (keys 1–4). */
export const HOME_CATS: readonly HomeCat[] = [
  {
    id: "Loaf",
    name: "Loaf",
    yarnCost: 1,
    lifecycle: "permanent",
    colorVar: "--color-loaf",
    colorHex: "#e07a30",
    blurb:
      "Settles into a solid platform. Stand on him; he stays. Yarn refunded when you pack him up.",
  },
  {
    id: "Zoomies",
    name: "Zoomies",
    yarnCost: 2,
    lifecycle: "consumed",
    durationSeconds: 8,
    colorVar: "--color-zoomies",
    colorHex: "#ffe066",
    blurb:
      "Lays a glowing trail that doubles your speed. Fades after 8 seconds; the yarn goes with it.",
  },
  {
    id: "CuriosityCat",
    name: "Curiosity",
    yarnCost: 2,
    lifecycle: "consumed",
    durationSeconds: 20,
    colorVar: "--color-curiosity",
    colorHex: "#9b59b6",
    blurb:
      "Reveals hidden terrain nearby for 20 seconds. Wonderful for finding the way up.",
  },
  {
    id: "Pounce",
    name: "Pounce",
    yarnCost: 3,
    lifecycle: "permanent",
    colorVar: "--color-pounce",
    colorHex: "#e74c3c",
    blurb:
      "A springy launch pad — boing, straight up. Stays put, yarn refunded when dismissed.",
  },
];

/** Short cost + lifecycle label for a cat's pill, e.g. "1 yarn · permanent". */
export function costLabel(cat: HomeCat): string {
  const cost = `${cat.yarnCost} yarn`;
  const life =
    cat.lifecycle === "permanent"
      ? "permanent"
      : `lasts ${cat.durationSeconds}s`;
  return `${cost} · ${life}`;
}

export interface HowItPlaysStep {
  readonly n: number;
  readonly title: string;
  readonly body: string;
}

export const HOW_IT_PLAYS: readonly HowItPlaysStep[] = [
  {
    n: 1,
    title: "Summon",
    body: `Spend yarn from your pouch of ${INITIAL_YARN} to call a cat into the world.`,
  },
  {
    n: 2,
    title: "Build",
    body: "Each cat becomes terrain — a platform, a launch pad, a speed trail, a glimpse of the hidden.",
  },
  {
    n: 3,
    title: "Wander",
    body: "Climb, dive, and explore the dusk to find the elevated and the hidden. Take your time.",
  },
];

/** Fixed narrative copy for the page. Kept here so the honesty test covers it too. */
export const HOME_COPY = {
  wordmark: "Cat-Herder",
  tagline: "Summon. Build. Wander.",
  heroSubhead:
    "A zen puzzle-platformer where your cats become the world. Spend yarn, call a cat, and stand on what you summon. No enemies. No clock. Just dusk, and somewhere to climb.",
  catsHeading: "Meet your cats",
  catsLede:
    "Four companions, one ball of yarn. Some stay for good; some blaze bright and unravel.",
  howHeading: "How it plays",
  ctaHeading: "Ready when you are.",
  ctaMicrocopy: "Free. No score. Just you, the cats, and the dusk.",
  footerLine: "Made with yarn. Cat-Herder is a quiet little game.",
} as const;
