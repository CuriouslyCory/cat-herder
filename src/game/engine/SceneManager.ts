import * as THREE from "three";
import type { Vec3 } from "../types";
import { PostProcessingManager } from "./PostProcessingManager";
import type { VisualConfig } from "../config";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GeometryKind = "box" | "sphere" | "cylinder" | "plane";

export type OutlineCategory = "player" | "cat" | "pickup" | "resource" | "none";

export interface RimLightConfig {
  color: string | number;
  power: number;
  intensity: number;
}

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
  /** Emissive color for self-glow. Default: no emission. */
  emissive?: string | number;
  /** Emissive intensity [0-1]. Default: 0. */
  emissiveIntensity?: number;
  /** Rim/Fresnel light effect via shader injection. */
  rimLight?: RimLightConfig;
  /** Category for selective post-processing outlines. Default: "none". */
  outlineCategory?: OutlineCategory;
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
  private postProcessing: PostProcessingManager | null = null;
  private visualConfig: VisualConfig | null = null;

  /** Camera is settable so CameraController can swap it in. */
  camera: THREE.Camera;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    visualConfig?: VisualConfig,
  ) {
    this.visualConfig = visualConfig ?? null;

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
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(5, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);

    // Post-processing (deferred until camera is set via initPostProcessing)
    // Resize handling
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  initPostProcessing(): void {
    if (!this.visualConfig?.postProcessing) return;
    this.postProcessing = new PostProcessingManager(
      this.renderer,
      this.scene,
      this.camera,
      this.visualConfig,
    );
  }

  /** Notify post-processing of a camera change. */
  syncPostProcessingCamera(): void {
    this.postProcessing?.setCamera(this.camera);
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

    if (config.emissive !== undefined) {
      material.emissive = new THREE.Color(config.emissive as string);
      material.emissiveIntensity = config.emissiveIntensity ?? 0.3;
    }

    if (config.rimLight) {
      const rimColor = new THREE.Color(config.rimLight.color as string);
      const rimPower = config.rimLight.power;
      const rimIntensity = config.rimLight.intensity;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.rimColor = { value: rimColor };
        shader.uniforms.rimPower = { value: rimPower };
        shader.uniforms.rimIntensity = { value: rimIntensity };
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          `#include <common>
uniform vec3 rimColor;
uniform float rimPower;
uniform float rimIntensity;`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          `#include <dithering_fragment>
float rimDot = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
gl_FragColor.rgb += rimColor * pow(rimDot, rimPower) * rimIntensity;`,
        );
      };
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = config.castShadow ?? false;
    mesh.receiveShadow = config.receiveShadow ?? false;

    this.scene.add(mesh);

    const handle: SceneHandle = Symbol("SceneHandle");
    this.meshes.set(handle, mesh);

    const category = config.outlineCategory;
    if (category && category !== "none" && this.postProcessing) {
      this.postProcessing.addToOutline(mesh, category);
    }

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

  /** Update the emissive color and intensity of an existing mesh. */
  setMeshEmissive(
    handle: SceneHandle,
    color: string | number,
    intensity: number,
  ): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.emissive.set(color as string);
    mat.emissiveIntensity = intensity;
  }

  /** Returns the underlying Three.js mesh for a handle. Used by PostProcessingManager. */
  getMesh(handle: SceneHandle): THREE.Object3D | null {
    return this.meshes.get(handle) ?? null;
  }

  /** Returns the Three.js scene. Used by PostProcessingManager. */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /** Returns the WebGL renderer. Used by PostProcessingManager. */
  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  removeMesh(handle: SceneHandle): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;

    this.postProcessing?.removeFromOutline(mesh);

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
    if (this.postProcessing) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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
    this.postProcessing?.resize(w, h);
  }

  // ---------------------------------------------------------------------------
  // Picking
  // ---------------------------------------------------------------------------

  /**
   * Casts a ray from the given screen-space pixel through the scene and
   * returns the first hit point in world space, or null if nothing is hit.
   */
  screenToWorld(
    screenX: number,
    screenY: number,
    excludeHandles?: ReadonlySet<SceneHandle>,
  ): Vec3 | null {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return null;

    const ndcX = (screenX / w) * 2 - 1;
    const ndcY = -(screenY / h) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    let targets: THREE.Mesh[];
    if (excludeHandles && excludeHandles.size > 0) {
      targets = [];
      for (const [handle, mesh] of this.meshes) {
        if (!excludeHandles.has(handle)) targets.push(mesh);
      }
    } else {
      targets = [...this.meshes.values()];
    }
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
    this.postProcessing?.dispose();
    this.postProcessing = null;

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
