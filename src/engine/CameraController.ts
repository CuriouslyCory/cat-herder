import * as THREE from "three";
import type { World } from "../ecs/World";
import type { Entity } from "../ecs/Entity";
import type { Transform } from "../ecs/components/Transform";
import { TRANSFORM } from "../ecs/components/Transform";
import { runtimeConfig } from "../config";
import type { SceneManager } from "./SceneManager";

export type CameraMode = "follow" | "free";

// Convert degrees to radians
const DEG = Math.PI / 180;

export class CameraController {
  private readonly camera: THREE.OrthographicCamera;
  private target: Entity | null = null;
  private mode: CameraMode = "follow";

  // Camera state
  private cameraPos = new THREE.Vector3(0, 0, 0);
  private leadOffset = new THREE.Vector3(0, 0, 0);
  private zoom = 20; // frustum size in world units

  // Map boundary clamping (set after map loads)
  private mapBounds = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity };

  constructor(private readonly sceneManager: SceneManager) {
    this.camera = this.sceneManager.getCamera();
    this.setupScrollZoom();
  }

  follow(target: Entity): void {
    this.target = target;
    this.mode = "follow";
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  setMapBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.mapBounds = { minX, maxX, minZ, maxZ };
  }

  update(world: World, dt: number): void {
    if (this.mode === "follow" && this.target !== null) {
      this.updateFollowMode(world, dt);
    }
    // Free mode movement handled by InputManager → Game
    this.applyCamera();
  }

  private updateFollowMode(world: World, dt: number): void {
    if (this.target === null) return;
    const transform = world.getComponent<Transform>(this.target, TRANSFORM);
    if (!transform) return;

    const config = runtimeConfig;
    const { position, rotation } = transform;

    // Compute lead direction from facing angle
    const facingX = Math.sin(rotation.y);
    const facingZ = Math.cos(rotation.y);
    const targetLead = new THREE.Vector3(
      facingX * config.cameraLeadDistance,
      0,
      facingZ * config.cameraLeadDistance,
    );

    // Lerp lead offset smoothly
    const lerpAlpha = 1 - Math.exp(-config.cameraLeadLerpFactor * dt);
    this.leadOffset.lerp(targetLead, lerpAlpha);

    // Target world position with lead
    const targetX = position.x + this.leadOffset.x;
    const targetZ = position.z + this.leadOffset.z;

    // Clamp to map bounds
    const frustumAspect = this.camera.right / this.camera.top;
    const halfW = (this.zoom * frustumAspect) / 2;
    const halfH = this.zoom / 2;
    const clampedX = Math.max(this.mapBounds.minX + halfW, Math.min(targetX, this.mapBounds.maxX - halfW));
    const clampedZ = Math.max(this.mapBounds.minZ + halfH, Math.min(targetZ, this.mapBounds.maxZ - halfH));

    // Smooth follow
    const followLerp = 1 - Math.exp(-8 * dt);
    this.cameraPos.x += (clampedX - this.cameraPos.x) * followLerp;
    this.cameraPos.z += (clampedZ - this.cameraPos.z) * followLerp;
  }

  private applyCamera(): void {
    // Isometric offset: 45° azimuth, 60° elevation
    const azimuth = runtimeConfig.cameraAzimuth * DEG;
    const elevation = runtimeConfig.cameraElevation * DEG;
    const dist = this.zoom * 1.2; // camera pull-back distance

    const cx = Math.sin(azimuth) * Math.cos(elevation) * dist;
    const cy = Math.sin(elevation) * dist;
    const cz = Math.cos(azimuth) * Math.cos(elevation) * dist;

    this.camera.position.set(
      this.cameraPos.x + cx,
      this.cameraPos.z + cy, // intentional: y uses height
      this.cameraPos.z + cz,
    );

    // Actually use the correct lookAt
    this.camera.position.set(
      this.cameraPos.x + cx,
      cy,
      this.cameraPos.z + cz,
    );
    this.camera.lookAt(this.cameraPos.x, 0, this.cameraPos.z);
    this.updateFrustum();
  }

  private updateFrustum(): void {
    const aspect = window.innerWidth / window.innerHeight;
    const half = this.zoom / 2;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  private setupScrollZoom(): void {
    window.addEventListener("wheel", (e) => {
      this.zoom = Math.max(5, Math.min(50, this.zoom + e.deltaY * 0.05));
    });
  }
}
