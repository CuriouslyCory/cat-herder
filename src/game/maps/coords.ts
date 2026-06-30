// ---------------------------------------------------------------------------
// coords.ts — Pure cell↔world coordinate helpers for the MapManager grid.
//
// No imports from Three.js, ECS (World/Entity/Component), or any engine module.
// All functions are pure (no side effects, no external state).
// ---------------------------------------------------------------------------

/** Visual thickness of flat terrain slabs below their surface (world units).
 *  Extracted from MapManager.ts — must remain numerically identical. */
export const FLOOR_THICKNESS = 0.2;

/**
 * Convert a grid (col, row) to the world-space center of that cell.
 *
 * Formula: the map origin is centered at world (0,0,0), so the left edge of
 * column 0 is at x = -mapWidth/2 and the top edge of row 0 is at z = -mapDepth/2.
 * The center of cell (col, row) is then:
 *   x = -mapWidth/2 + col * cellSize + cellSize/2
 *   z = -mapDepth/2 + row * cellSize + cellSize/2
 */
export function cellToWorld(
  col: number,
  row: number,
  cellSize: number,
  mapWidth: number, // data.size.width
  mapDepth: number, // data.size.depth
): { x: number; z: number } {
  const x = -(mapWidth / 2) + col * cellSize + cellSize / 2;
  const z = -(mapDepth / 2) + row * cellSize + cellSize / 2;
  return { x, z };
}

/**
 * Convert world (x, z) to grid (col, row). This is the inverse of cellToWorld
 * for the per-cell grid.
 *
 * Formula: the inverse of cellToWorld — shift by half the map width/depth to
 * make (0,0) map to the NW corner, then divide by cellSize.
 */
export function worldToCell(
  x: number,
  z: number,
  cellSize: number,
  mapWidth: number,
  mapDepth: number,
): { col: number; row: number } {
  const col = Math.floor((x + mapWidth / 2) / cellSize);
  const row = Math.floor((z + mapDepth / 2) / cellSize);
  return { col, row };
}

/**
 * Return the box height and center-Y for a terrain entity mesh.
 *
 * Rule:
 *   - Elevated cell (height > 0): a box from y=0 to y=height, centered at height/2.
 *   - Flat cell (height = 0): a thin slab whose top face is at y=0, centered at
 *     -floorThickness/2 (so the slab sits just below the surface).
 *
 * @param cellHeight    The cell's height value from MapData.
 * @param floorThickness  Override for the slab thickness (defaults to FLOOR_THICKNESS).
 */
export function cellMeshGeometry(
  cellHeight: number,
  floorThickness: number = FLOOR_THICKNESS,
): { boxHeight: number; centerY: number } {
  if (cellHeight > 0) {
    return { boxHeight: cellHeight, centerY: cellHeight / 2 };
  }
  return { boxHeight: floorThickness, centerY: -floorThickness / 2 };
}
