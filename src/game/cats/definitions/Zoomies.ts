import { CatType } from "../../types";
import type { CatDefinition } from "../CatDefinition";

/**
 * Zoomies Cat — creates a speed-boost trail in the player's facing direction.
 * Duration cat: auto-dismisses after 8 s (yarn consumed).
 */
export const ZoomiesDefinition: CatDefinition = {
  type: CatType.Zoomies,
  name: "Zoomies Cat",
  description: "Leaves a speed trail (2× speed). Lasts 8 s — yarn is consumed on expiry.",
  yarnCost: 2,
  effectType: "movement",
  meshConfig: {
    geometry: "cylinder",
    dims: [0.3, 0.3, 0.8],
    color: "#ffe066",
    castShadow: false,
    receiveShadow: false,
    emissive: "#ffe066",
    emissiveIntensity: 0.3,
    outlineCategory: "cat",
  },
  behavior: {
    duration: 8,
    params: {
      trailLength: 6,        // units long
      speedMultiplier: 2.0,
    },
  },
};
