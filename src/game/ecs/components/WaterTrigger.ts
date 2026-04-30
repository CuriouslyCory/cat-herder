import type { Component } from "../Component";

/**
 * Marker component placed on water terrain entities by MapManager.
 * Queried by WaterSystem to identify which trigger entities are water zones.
 */
export interface WaterTrigger extends Component {
  readonly type: "WaterTrigger";
  /** World Y coordinate of the water surface for buoyancy calculations. */
  surfaceY: number;
}

export function createWaterTrigger(surfaceY: number): WaterTrigger {
  return { type: "WaterTrigger", surfaceY };
}
