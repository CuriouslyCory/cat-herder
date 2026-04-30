import { CatType } from "../../types";
import type { CatDefinition } from "../CatDefinition";

/**
 * Loaf Cat — becomes a solid static platform that the player can stand on.
 * Terrain cat: no duration, persists until manually dismissed.
 */
export const LoafDefinition: CatDefinition = {
  type: CatType.Loaf,
  name: "Loaf Cat",
  description: "Becomes a solid platform. Stack multiple Loafs to reach higher areas.",
  yarnCost: 1,
  effectType: "terrain",
  meshConfig: {
    geometry: "box",
    dims: [1.2, 1.5, 1.2],
    color: "#e07a30", // warm orange
    castShadow: true,
    receiveShadow: true,
  },
  behavior: {
    // No duration — stays until dismissed.
    params: {
      colliderWidth: 1.2,
      colliderHeight: 1.5,
      colliderDepth: 1.2,
    },
  },
};
