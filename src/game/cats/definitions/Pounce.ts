import { CatType } from "../../types";
import type { CatDefinition } from "../CatDefinition";

/**
 * Pounce Cat — launches the player upward when walked over.
 * Terrain cat: persists until dismissed (yarn returned on dismiss).
 */
export const PounceDefinition: CatDefinition = {
  type: CatType.Pounce,
  name: "Pounce Cat",
  description: "Launches you upward (3.5 u impulse) when walked over. Stays until dismissed.",
  yarnCost: 3,
  effectType: "launch",
  meshConfig: {
    geometry: "box",
    dims: [1.8, 0.5, 1.8],  // wide and low
    color: "#e74c3c",        // red
    castShadow: true,
    receiveShadow: true,
  },
  behavior: {
    // No duration — stays until dismissed.
    params: {
      launchImpulse: 3.5,    // upward velocity applied to player (u/s)
      airControlFactor: 0.7, // player retains 70 % air control after launch
      triggerWidth: 1.8,
      triggerDepth: 1.8,
      triggerHeight: 0.3,
    },
  },
};
