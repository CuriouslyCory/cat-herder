import * as THREE from "three";
import type { Entity } from "../ecs/Entity";
import type { Transform } from "../ecs/components/Transform";
import type { World } from "../ecs/World";
import type { SceneManager } from "./SceneManager";
import { runtimeConfig } from "../config";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CameraMode = "follow" | "free";

export interface MapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// ---------------------------------------------------------------------------
// CameraController
// ---------------------------------------------------------------------------

/**
 * Manages an isometric OrthographicCamera that follows a target entity.
 *
 * Camera angles are sourced from runtimeConfig (azimuth 45°, elevation 60°).
 * The follow mode adds a smooth leading offset in the player's facing direction.
 * Free mode lets the Game orchestrator pan the focus via panBy().
 *
 * Only this file and SceneManager may import from "three".
 */
export class CameraController {
  private readonly camera: THREE.OrthographicCamera;

  private targetEntity: Entity | null = null;
  private mode: CameraMode = "follow";

  // Camera focus point in world space — smoothly interpolated each frame.
  private focusX = 0;
  private focusY = 0;
  private focusZ = 0;

  // Lead offset (world-space) — lerped toward player's facing direction.
  private leadX = 0;
  private leadZ = 0;

  // Orthographic zoom — half the number of world units visible vertically.
  private zoom = 10;
  private readonly minZoom = 5;
  private readonly maxZoom = 25;

  // Optional map boundary clamping for focus point.
  private mapBounds: MapBounds | null = null;

  // Precomputed isometric angles (read once from runtimeConfig on construction).
  private readonly azimuthRad: number;
  private readonly elevationRad: number;
  private readonly orbitDistance = 20;

  // Bound event handler — stored for removeEventListener.
  private readonly onWheel: (e: WheelEvent) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly sceneManager: SceneManager,
    private readonly world: World,
  ) {
    this.azimuthRad = (runtimeConfig.cameraAzimuth * Math.PI) / 180;
    this.elevationRad = (runtimeConfig.cameraElevation * Math.PI) / 180;

    // Create the isometric orthographic camera.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.updateFrustum();

    // Install camera into SceneManager (replaces the default PerspectiveCamera).
    this.sceneManager.camera = this.camera;

    // Scroll-wheel zoom — adjust orthographic frustum.
    this.onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoom = Math.max(
        this.minZoom,
        Math.min(this.maxZoom, this.zoom * (e.deltaY > 0 ? 1.1 : 0.9)),
      );
      this.updateFrustum();
    };
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Switch to follow mode and set the entity to track. */
  follow(target: Entity): void {
    this.targetEntity = target;
    this.mode = "follow";
  }

  /** Switch between 'follow' and 'free' modes. */
  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  /** Set optional map bounds to clamp the focus point. */
  setMapBounds(bounds: MapBounds): void {
    this.mapBounds = bounds;
  }

  /**
   * Pan the camera focus by (dx, dz) world units.
   * Used by the Game orchestrator to implement free-mode WASD panning.
   */
  panBy(dx: number, dz: number): void {
    this.focusX = this.clampX(this.focusX + dx);
    this.focusZ = this.clampZ(this.focusZ + dz);
  }

  /** Call once per frame from the game loop. */
  update(dt: number): void {
    if (this.mode === "follow" && this.targetEntity !== null) {
      this.updateFollowMode(dt);
    }
    // Free mode: focus is driven externally via panBy(); just render current pos.
    this.applyCamera();
  }

  dispose(): void {
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private updateFollowMode(dt: number): void {
    const transform = this.world.getComponent<Transform>(
      this.targetEntity!,
      "Transform",
    );
    if (!transform) return;

    // Project the lead distance along the player's current facing direction.
    const leadTargetX =
      Math.sin(transform.rotationY) * runtimeConfig.cameraLeadDistance;
    const leadTargetZ =
      Math.cos(transform.rotationY) * runtimeConfig.cameraLeadDistance;

    // Lerp the lead offset toward the target (per-frame lerp from runtimeConfig).
    const lerpK = runtimeConfig.cameraLeadLerp;
    this.leadX += (leadTargetX - this.leadX) * lerpK;
    this.leadZ += (leadTargetZ - this.leadZ) * lerpK;

    // Desired focus = entity position + smoothed lead offset.
    const desiredX = transform.x + this.leadX;
    const desiredY = transform.y;
    const desiredZ = transform.z + this.leadZ;

    // Smooth follow — convergence rate ~5 units/s regardless of frame rate.
    const followK = Math.min(1, 5 * dt);
    this.focusX = this.clampX(this.focusX + (desiredX - this.focusX) * followK);
    this.focusY += (desiredY - this.focusY) * followK;
    this.focusZ = this.clampZ(this.focusZ + (desiredZ - this.focusZ) * followK);
  }

  /** Apply the current focus point to the Three.js camera. */
  private applyCamera(): void {
    const cosEl = Math.cos(this.elevationRad);
    const sinEl = Math.sin(this.elevationRad);
    const sinAz = Math.sin(this.azimuthRad);
    const cosAz = Math.cos(this.azimuthRad);

    const camX = this.focusX + this.orbitDistance * cosEl * sinAz;
    const camY = this.focusY + this.orbitDistance * sinEl;
    const camZ = this.focusZ + this.orbitDistance * cosEl * cosAz;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(this.focusX, this.focusY, this.focusZ);
  }

  /** Recompute the orthographic frustum from current zoom and canvas aspect ratio. */
  private updateFrustum(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return;

    const aspect = w / h;
    this.camera.left = -this.zoom * aspect;
    this.camera.right = this.zoom * aspect;
    this.camera.top = this.zoom;
    this.camera.bottom = -this.zoom;
    this.camera.updateProjectionMatrix();
  }

  private clampX(x: number): number {
    if (!this.mapBounds) return x;
    return Math.max(this.mapBounds.minX, Math.min(this.mapBounds.maxX, x));
  }

  private clampZ(z: number): number {
    if (!this.mapBounds) return z;
    return Math.max(this.mapBounds.minZ, Math.min(this.mapBounds.maxZ, z));
  }
}
