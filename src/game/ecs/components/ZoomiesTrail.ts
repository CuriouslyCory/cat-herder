import type { Component } from "../Component";
import type { Entity } from "../Entity";

/**
 * ZoomiesTrail — attached to the elongated trigger zone entity spawned alongside
 * a Zoomies cat.
 *
 * ZoomiesSystem checks each frame whether the player's XZ position falls within
 * the oriented bounding rectangle described by this component, then adds or
 * removes SpeedBoost on the player accordingly.
 *
 * The trail is centered at the entity's Transform position and extends
 * halfLength units in each direction along (dirX, dirZ), and halfWidth units
 * perpendicular to that axis.
 */
export interface ZoomiesTrail extends Component {
  readonly type: "ZoomiesTrail";
  /** The Zoomies cat entity that owns this trail. */
  catEntity: Entity;
  /** Half the trail length along the trail axis (meters). Default: 3 (= 6u / 2). */
  halfLength: number;
  /** Half the trail width perpendicular to the axis (meters). Default: 0.75. */
  halfWidth: number;
  /** Normalized X component of the trail direction in the XZ plane. */
  dirX: number;
  /** Normalized Z component of the trail direction in the XZ plane. */
  dirZ: number;
}

export function createZoomiesTrail(
  catEntity: Entity,
  halfLength: number,
  halfWidth: number,
  dirX: number,
  dirZ: number,
): ZoomiesTrail {
  return {
    type: "ZoomiesTrail",
    catEntity,
    halfLength,
    halfWidth,
    dirX,
    dirZ,
  };
}
