import * as THREE from "three";
import type { Vec3 } from "../types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GeometryKind = "box" | "sphere" | "cylinder" | "plane";

export interface MeshConfig {
  geometry: GeometryKind;
  /** Uniform size (radius for sphere, radius for cylinder). For box/plane this is the half-extent on each axis. */
  size?: number;
  /** Width, height, depth override for box; top-radius, bottom-radius, height for cylinder; width, height for plane. */
  dims?: [number, number, number?];
  /** CSS hex string e.g. "#ff6b35" or a numeric hex e.g. 0xff6b35 */
  color?: string | number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Opacity [0-1]. Values below 1 enable transparency. Default: 1. */
  opacity?: number;
}

/**
 * Opaque handle returned by addMesh().
 * Callers cannot access the underlying THREE.Object3D.
 */
export type SceneHandle = symbol;

export interface RaycastHit {
  point: Vec3;
  distance: number;
}

// ---------------------------------------------------------------------------
// SceneManager
// ---------------------------------------------------------------------------

/**
 * Isolates Three.js behind a single module boundary.
 * Only SceneManager and CameraController may import from "three".
 */
export class SceneManager {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly raycaster = new THREE.Raycaster();
  private readonly meshes = new Map<SceneHandle, THREE.Mesh>();
  private readonly resizeObserver: ResizeObserver;

  /** Camera is settable so CameraController can swap it in. */
  camera: THREE.Camera;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Default camera (CameraController will replace this)
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(5, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);

    // Resize handling
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  // ---------------------------------------------------------------------------
  // Mesh management
  // ---------------------------------------------------------------------------

  addMesh(config: MeshConfig): SceneHandle {
    const geometry = buildGeometry(config);
    const opacity = config.opacity ?? 1;
    const material = new THREE.MeshStandardMaterial({
      color: config.color ?? 0xffffff,
      transparent: opacity < 1,
      opacity,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = config.castShadow ?? false;
    mesh.receiveShadow = config.receiveShadow ?? false;

    this.scene.add(mesh);

    const handle: SceneHandle = Symbol("SceneHandle");
    this.meshes.set(handle, mesh);
    return handle;
  }

  /** Update the color of an existing mesh's material. */
  setMeshColor(handle: SceneHandle, color: string | number): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    (mesh.material as THREE.MeshStandardMaterial).color.set(color as string);
  }

  /** Update the opacity of an existing mesh's material. */
  setMeshOpacity(handle: SceneHandle, opacity: number): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.transparent = opacity < 1;
    mat.opacity = opacity;
  }

  removeMesh(handle: SceneHandle): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => m.dispose());
    } else {
      mesh.material.dispose();
    }
    this.meshes.delete(handle);
  }

  updateTransform(
    handle: SceneHandle,
    position: Vec3,
    rotation: Vec3,
    scale: Vec3,
  ): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    mesh.position.set(position.x, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.scale.set(scale.x, scale.y, scale.z);
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return;

    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    } else if (this.camera instanceof THREE.OrthographicCamera) {
      // CameraController manages its own projection — just signal it
      this.camera.updateProjectionMatrix();
    }

    this.renderer.setSize(w, h, false); // false = don't set CSS size
  }

  // ---------------------------------------------------------------------------
  // Picking
  // ---------------------------------------------------------------------------

  /**
   * Casts a ray from the given screen-space pixel through the scene and
   * returns the first hit point in world space, or null if nothing is hit.
   */
  screenToWorld(screenX: number, screenY: number): Vec3 | null {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return null;

    const ndcX = (screenX / w) * 2 - 1;
    const ndcY = -(screenY / h) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const targets = [...this.meshes.values()];
    const intersects = this.raycaster.intersectObjects(targets, false);

    if (intersects.length === 0) return null;

    const { point } = intersects[0]!;
    return { x: point.x, y: point.y, z: point.z };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.resizeObserver.disconnect();

    for (const handle of [...this.meshes.keys()]) {
      this.removeMesh(handle);
    }

    this.renderer.dispose();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGeometry(config: MeshConfig): THREE.BufferGeometry {
  const size = config.size ?? 1;
  const [d0 = size, d1 = size, d2 = size] = config.dims ?? [];

  switch (config.geometry) {
    case "box":
      return new THREE.BoxGeometry(d0, d1, d2);

    case "sphere":
      return new THREE.SphereGeometry(size, 32, 16);

    case "cylinder":
      // dims: [radiusTop, radiusBottom, height]
      return new THREE.CylinderGeometry(d0, d1, d2, 32);

    case "plane":
      // dims: [width, height]
      return new THREE.PlaneGeometry(d0, d1);
  }
}
