import { CatType } from "../../types";
import type { CatDefinition } from "../CatDefinition";

/**
 * Curiosity Cat — reveals hidden terrain within a radius for 20 s.
 * Duration cat: auto-dismisses after 20 s (yarn consumed).
 */
export const CuriosityCatDefinition: CatDefinition = {
  type: CatType.CuriosityCat,
  name: "Curiosity Cat",
  description: "Reveals hidden terrain within 5 u for 20 s. Yarn consumed on expiry.",
  yarnCost: 2,
  effectType: "utility",
  meshConfig: {
    geometry: "sphere",
    size: 0.5,
    color: "#9b59b6", // purple
    castShadow: false,
    receiveShadow: false,
  },
  behavior: {
    duration: 20,
    params: {
      revealRadius: 5,       // units
    },
  },
};
