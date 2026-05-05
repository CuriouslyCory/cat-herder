import { CatType } from "../types";
import type { Vec3 } from "../types";
import type { World } from "../ecs/World";
import type { SceneHandle } from "../engine/SceneManager";
import type { SceneManager } from "../engine/SceneManager";
import type { InputManager } from "../engine/InputManager";
import type { CatCompanionManager } from "../cats/CatCompanionManager";
import type { MapManager } from "../maps/MapManager";
import type { Transform } from "../ecs/components/Transform";
import { CAT_REGISTRY } from "../cats/definitions";
import { getCatHalfHeight } from "../cats/CatCompanionManager";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ordered mapping of number keys 1–4 to CatType. */
const CAT_SLOTS: readonly CatType[] = [
  CatType.Loaf,
  CatType.Zoomies,
  CatType.CuriosityCat,
  CatType.Pounce,
];

const GHOST_OPACITY = 0.5;
/** Ghost tint when placement is valid (pale green). */
const GHOST_VALID_COLOR = 0x88ff88;
/** Ghost tint when placement is invalid (red). */
const GHOST_INVALID_COLOR = 0xff4444;
/** Maximum XZ distance (world units) for right-click dismissal to hit a companion. */
const DISMISS_RADIUS_SQ = 1.5 * 1.5;

// ---------------------------------------------------------------------------
// CatPlacementSystem
// ---------------------------------------------------------------------------

/**
 * Handles the cat placement workflow:
 *  - Number keys 1–4 select / deselect a cat type.
 *  - A semi-transparent ghost mesh follows the mouse and turns red on invalid ground.
 *  - Left-click on valid ground summons the selected cat.
 *  - Right-click near an active companion dismisses it.
 *
 * Updated in the variable-rate render pass (once per render frame), not inside
 * the fixed-step loop, so click events are processed exactly once per frame.
 */
export class CatPlacementSystem {
  private selectedCatType: CatType | null = null;
  private ghostHandle: SceneHandle | null = null;
  private ghostIsValid = false;
  /** True when a cat type is selected but the player cannot afford it. */
  private _insufficientYarn = false;

  constructor(
    private readonly inputManager: InputManager,
    private readonly sceneManager: SceneManager,
    private readonly catCompanionManager: CatCompanionManager,
    private readonly mapManager: MapManager,
    private readonly world: World,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Returns the currently selected cat type, or null if none. */
  getSelectedCatType(): CatType | null {
    return this.selectedCatType;
  }

  /**
   * True when a cat type is selected but the player cannot afford the yarn cost.
   * Used by Game.ts to pass `insufficientYarn` into HUDState for the warning tooltip.
   */
  getInsufficientYarn(): boolean {
    return this._insufficientYarn;
  }

  /**
   * Process one render frame: selection, ghost update, summon, dismiss.
   * Takes `world` as a parameter to stay consistent with the System interface,
   * even though it already holds a reference from the constructor.
   */
  update(_dt: number): void {
    this.handleCatSelection();
    this.updateGhost();
    this.handleLeftClick();
    this.handleRightClick();
  }

  /** Remove the ghost mesh and clean up. */
  dispose(): void {
    this.clearGhost();
  }

  // ---------------------------------------------------------------------------
  // Private — selection
  // ---------------------------------------------------------------------------

  private handleCatSelection(): void {
    const slot = this.inputManager.getPressedCatSlot();
    if (slot === null) return;

    const catType = CAT_SLOTS[slot - 1];
    if (!catType) return;

    // Toggle: pressing the same key again deselects.
    if (this.selectedCatType === catType) {
      this.clearSelection();
    } else {
      this.selectCatType(catType);
    }
  }

  private selectCatType(catType: CatType): void {
    this.clearGhost();
    this.selectedCatType = catType;

    const def = CAT_REGISTRY.get(catType);
    if (!def) return;

    // Create a ghost mesh matching the cat's geometry but semi-transparent.
    this.ghostHandle = this.sceneManager.addMesh({
      ...def.meshConfig,
      color: GHOST_VALID_COLOR,
      opacity: GHOST_OPACITY,
      castShadow: false,
      receiveShadow: false,
    });
    this.ghostIsValid = false;
  }

  private clearSelection(): void {
    this.clearGhost();
    this.selectedCatType = null;
    this._insufficientYarn = false;
  }

  private clearGhost(): void {
    if (this.ghostHandle !== null) {
      this.sceneManager.removeMesh(this.ghostHandle);
      this.ghostHandle = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private — ghost preview
  // ---------------------------------------------------------------------------

  private getWorldPosExcludingGhost(): Vec3 | null {
    const screen = this.inputManager.getMouseScreenPosition();
    const exclude = this.ghostHandle
      ? new Set([this.ghostHandle])
      : undefined;
    return this.sceneManager.screenToWorld(screen.x, screen.y, exclude);
  }

  private updateGhost(): void {
    if (this.selectedCatType === null || this.ghostHandle === null) return;

    const mousePos = this.getWorldPosExcludingGhost();
    if (!mousePos) {
      this._insufficientYarn = false;
      return;
    }

    const isAffordable = this.catCompanionManager.canAfford(this.selectedCatType);
    this._insufficientYarn = !isAffordable;

    // Ghost is valid only when the player can afford it AND the position is walkable.
    const isValid = isAffordable && this.catCompanionManager.isValidPosition(mousePos);

    // Only update color when validity changes to avoid per-frame material writes.
    if (isValid !== this.ghostIsValid) {
      this.ghostIsValid = isValid;
      this.sceneManager.setMeshColor(
        this.ghostHandle,
        isValid ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR,
      );
    }

    // Position the ghost so its bottom face rests on the surface under the
    // cursor — mirrors how CatCompanionManager.summon() places the actual cat.
    // Without the +halfHeight offset, the box mesh is centered on the terrain
    // (half-buried), making the ghost appear half as tall as the placed cat.
    const def = CAT_REGISTRY.get(this.selectedCatType);
    const halfHeight = def ? getCatHalfHeight(def) : 0;
    const surfaceY = isValid
      ? this.mapManager.getHeightAt(mousePos.x, mousePos.z)
      : mousePos.y;
    const y = surfaceY + halfHeight;

    this.sceneManager.updateTransform(
      this.ghostHandle,
      { x: mousePos.x, y, z: mousePos.z },
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    );
  }

  // ---------------------------------------------------------------------------
  // Private — input handling
  // ---------------------------------------------------------------------------

  private handleLeftClick(): void {
    if (!this.inputManager.wasLeftClickThisFrame()) return;
    if (this.selectedCatType === null) return;

    const mousePos = this.getWorldPosExcludingGhost();
    if (!mousePos) return;

    this.catCompanionManager.summon(this.selectedCatType, mousePos);
  }

  private handleRightClick(): void {
    if (!this.inputManager.wasRightClickThisFrame()) return;

    const mousePos = this.getWorldPosExcludingGhost();
    if (!mousePos) return;

    const nearest = this.findNearestCompanion(mousePos);
    if (nearest !== null) {
      this.catCompanionManager.dismiss(nearest);
    }
  }

  /**
   * Finds the active companion entity closest to `pos` within DISMISS_RADIUS.
   * Returns null if none is near enough.
   */
  private findNearestCompanion(pos: Vec3): number | null {
    const companions = this.catCompanionManager.getActiveCompanions();
    let nearest: number | null = null;
    let nearestDistSq = DISMISS_RADIUS_SQ;

    for (const entity of companions) {
      const transform = this.world.getComponent<Transform>(entity, "Transform");
      if (!transform) continue;

      const dx = transform.x - pos.x;
      const dz = transform.z - pos.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = entity;
      }
    }

    return nearest;
  }
}
