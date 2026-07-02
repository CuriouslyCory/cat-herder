import * as THREE from "three";
import type { Vec3 } from "../types";
import { PostProcessingManager } from "./PostProcessingManager";
import type { VisualConfig } from "../config";
import {
  buildGradientRamp,
  darkenForOutline,
  jitterPositions,
} from "./toonStyle";
import { generateSurfaceTexture } from "./proceduralTexture";

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
  /**
   * Cosmetic hand-drawn vertex jitter amplitude in world units. When omitted,
   * the global `handDrawnJitter` visual config applies; set to 0 to opt out
   * (e.g. terrain/walls, which must stay grid-aligned). Purely visual — never
   * affects ECS colliders.
   */
  jitter?: number;
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
 * Unit direction the sunlight travels FROM (i.e. the light sits along this
 * vector, shining down toward the play area at the origin).
 */
const SUN_DIRECTION = new THREE.Vector3(-0.5, 1, -0.3).normalize();

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
  private _grid: THREE.GridHelper | null = null;
  /** Shared cel-shading ramp for every MeshToonMaterial. Built once, reused. */
  private readonly toonGradient: THREE.DataTexture;
  /**
   * Raw RGBA bytes for the procedural surface pattern. Shared across every
   * mesh's per-material DataTexture (each needs its own `repeat`, but they all
   * reference this single pixel buffer — no per-mesh pixel duplication).
   */
  private readonly surfaceTexels: { data: Uint8Array; size: number };
  /** Monotonic per-mesh seed so each jittered mesh gets a distinct lumpiness. */
  private jitterSeed = 0;
  /** Warm directional "sun" — its shadow frustum is sized to the loaded map. */
  private readonly sun: THREE.DirectionalLight;
  /**
   * Fired after every resize with the new canvas dimensions. CameraController
   * registers here to recompute its orthographic frustum for the new aspect
   * ratio — without this, resizing the window stretches the isometric view.
   */
  private onResizeHook: ((w: number, h: number) => void) | null = null;

  /** Camera is settable so CameraController can swap it in. */
  camera: THREE.Camera;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    visualConfig?: VisualConfig,
  ) {
    this.visualConfig = visualConfig ?? null;

    // Cel-shading gradient ramp shared by every toon material.
    this.toonGradient = buildToonGradient(visualConfig?.toonBands ?? 3);
    // Procedural surface pattern (shared pixel buffer; per-mesh texture wraps it).
    this.surfaceTexels = generateSurfaceTexture(64);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // Clamp DPR to 2: the post-processing composer allocates a dozen full-size
    // render targets, so an unclamped 3x device ratio triples fragment work
    // across all of them for no visible gain.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Explicit color-management intent for the direct-render fallback path.
    // (The composer path ends in OutputPass, which handles this itself.)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Default camera (CameraController will replace this)
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

    // Lights — soft ambient fill + a warm directional "sun".
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambient);

    // Sun: a warm directional light angled to reveal form on entity/terrain
    // sides and cast readable diagonal shadows. Its shadow camera is a tiny ±5
    // box by default (covers almost none of the map), so sizeSunShadow() — called
    // from setTerrainGrid on map load — widens the frustum to the whole area.
    this.sun = new THREE.DirectionalLight(0xfff2e0, 1.15);
    this.sun.position.copy(SUN_DIRECTION).multiplyScalar(93);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target); // defaults to origin; kept in the graph

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

  /**
   * Register a callback invoked on every resize with the new canvas size.
   * Used by CameraController to keep the orthographic frustum in sync with
   * the aspect ratio. Passing null clears it.
   */
  setResizeHook(hook: ((w: number, h: number) => void) | null): void {
    this.onResizeHook = hook;
  }

  // ---------------------------------------------------------------------------
  // Mesh management
  // ---------------------------------------------------------------------------

  addMesh(config: MeshConfig): SceneHandle {
    const geometry = buildGeometry(config);

    // Cosmetic hand-drawn jitter (render-only; colliders are unaffected).
    const jitterAmp = config.jitter ?? this.visualConfig?.handDrawnJitter ?? 0;
    if (jitterAmp > 0) {
      const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
      jitterPositions(posAttr.array as Float32Array, jitterAmp, this.jitterSeed++);
      posAttr.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    const opacity = config.opacity ?? 1;
    const material = new THREE.MeshToonMaterial({
      color: config.color ?? 0xffffff,
      gradientMap: this.toonGradient,
      transparent: opacity < 1,
      opacity,
    });

    // Procedural grain/hatch surface texture, tiled in ~world-uniform density so
    // large terrain and small entities read at a consistent scale. Reveals the
    // seams between adjacent flat-colored surfaces (transition legibility).
    if (this.visualConfig?.proceduralTexture !== false) {
      material.map = this.buildSurfaceTexture(config);
    }

    // Per-object dark "ink" outline (drawn by OutlineEffect). Color = darkened
    // fill hue; hidden (opacity < 1) meshes suppress the outline so invisible
    // terrain doesn't leave a floating hull.
    const fillHex = new THREE.Color(config.color ?? 0xffffff).getHex();
    material.userData.outlineParameters = {
      thickness: this.visualConfig?.outlineThickness ?? 0.004,
      color: new THREE.Color(darkenForOutline(fillHex)).toArray(),
      alpha: 1,
      visible: opacity >= 1,
    };

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

    return handle;
  }

  /**
   * Build a per-mesh surface-pattern texture. All meshes share the same pixel
   * buffer (`surfaceTexels`) but get their own DataTexture so `repeat` can be set
   * per-axis from the mesh's actual world dimensions. That fixes one tile = a
   * fixed number of world units in BOTH axes, so texel density and hatch
   * orientation stay identical across tiles of any size or aspect ratio.
   */
  private buildSurfaceTexture(config: MeshConfig): THREE.DataTexture {
    const { data, size } = this.surfaceTexels;
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace; // color-modulation map
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;

    const scale = this.visualConfig?.textureScale ?? 2;
    const [rx, rz] = surfaceRepeat(config, scale);
    tex.repeat.set(rx, rz);

    tex.needsUpdate = true;
    return tex;
  }

  /** Update the color of an existing mesh's material (and its ink outline). */
  setMeshColor(handle: SceneHandle, color: string | number): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshToonMaterial;
    mat.color.set(color as string);
    const params = mat.userData.outlineParameters as
      | { color: number[] }
      | undefined;
    if (params) {
      const inkHex = darkenForOutline(new THREE.Color(color as string).getHex());
      params.color = new THREE.Color(inkHex).toArray();
    }
  }

  /** Update the opacity of an existing mesh's material. */
  setMeshOpacity(handle: SceneHandle, opacity: number): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshToonMaterial;
    mat.transparent = opacity < 1;
    mat.opacity = opacity;
    // Keep the ink outline in step with visibility so opacity-0 (hidden)
    // terrain never draws a floating outline hull.
    const params = mat.userData.outlineParameters as
      | { visible: boolean }
      | undefined;
    if (params) params.visible = opacity >= 1;
  }

  /** Update the emissive color and intensity of an existing mesh. */
  setMeshEmissive(
    handle: SceneHandle,
    color: string | number,
    intensity: number,
  ): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshToonMaterial;
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

    this.scene.remove(mesh);
    mesh.geometry.dispose();
    // Material.dispose() does not free textures — release the per-mesh surface
    // map explicitly. (The shared toon gradient is disposed once in dispose().)
    const disposeMat = (m: THREE.Material) => {
      (m as THREE.MeshToonMaterial).map?.dispose();
      m.dispose();
    };
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(disposeMat);
    } else {
      disposeMat(mesh.material);
    }
    this.meshes.delete(handle);
  }

  /** Toggle wireframe rendering on all registered meshes. Used by the debug menu. */
  toggleWireframes(enabled: boolean): void {
    for (const mesh of this.meshes.values()) {
      (mesh.material as THREE.MeshToonMaterial).wireframe = enabled;
    }
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
    }
    // Orthographic cameras are owned by CameraController, which recomputes the
    // frustum from the new aspect ratio via the resize hook below. A bare
    // updateProjectionMatrix() here would only re-bake the stale frustum.
    this.onResizeHook?.(w, h);

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
  // ---------------------------------------------------------------------------
  // Terrain grid
  // ---------------------------------------------------------------------------

  /**
   * Add a subtle grid overlay to the scene matching the terrain's cell grid.
   * Positioned at y=0.01 (just above the terrain surface) so it's visible
   * without z-fighting. Replaces any existing grid.
   */
  setTerrainGrid(totalWidth: number, totalDepth: number, cellSize: number): void {
    // Map dimensions are known here — also size the sun's shadow to cover it.
    this.sizeSunShadow(totalWidth, totalDepth);

    this.removeTerrainGrid();
    const divisions = Math.max(1, Math.round(totalWidth / cellSize));
    const size = Math.max(totalWidth, totalDepth);
    this._grid = new THREE.GridHelper(size, divisions, 0x333344, 0x333344);
    this._grid.position.y = 0.01;
    this.scene.add(this._grid);
  }

  /**
   * Size the sun's orthographic shadow frustum — and push the light back far
   * enough — to cover a map of the given dimensions centered on the origin, so
   * shadows blanket the whole play area instead of a small default region. The
   * map is bounded and static, so a frustum centered at the origin covers it
   * wherever the camera roams (no per-frame light following needed).
   */
  private sizeSunShadow(width: number, depth: number): void {
    const maxDim = Math.max(width, depth);
    const radius = maxDim * 0.8 + 8; // + margin for oblique projection & walls
    const dist = maxDim * 1.5 + 40;

    this.sun.position.copy(SUN_DIRECTION).multiplyScalar(dist);
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();

    const cam = this.sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 1;
    cam.far = dist * 2;
    cam.updateProjectionMatrix();
  }

  /** Remove the terrain grid from the scene and release GPU resources. */
  removeTerrainGrid(): void {
    if (!this._grid) return;
    this.scene.remove(this._grid);
    this._grid.geometry.dispose();
    const mat = this._grid.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else {
      (mat as THREE.Material).dispose();
    }
    this._grid = null;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.resizeObserver.disconnect();
    this.onResizeHook = null;
    this.postProcessing?.dispose();
    this.postProcessing = null;

    this.removeTerrainGrid();

    for (const handle of [...this.meshes.keys()]) {
      this.removeMesh(handle);
    }

    this.toonGradient.dispose();
    this.renderer.dispose();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a raw cel ramp (from toonStyle.buildGradientRamp) into a 1×N red-channel
 * DataTexture with NearestFilter — the hard-stepped gradient MeshToonMaterial
 * samples for flat cel banding.
 */
function buildToonGradient(bands: number): THREE.DataTexture {
  const { data, width } = buildGradientRamp(bands);
  const tex = new THREE.DataTexture(data, width, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Per-axis surface-texture repeat, derived (un-rounded) from a mesh's world
 * dimensions so one tile spans exactly `scale` world units in each axis. This
 * keeps texel density and hatch orientation constant across meshes of any size
 * or aspect ratio — the top face is what dominates the isometric view, so we
 * map the two horizontal extents to the texture's U and V.
 */
function surfaceRepeat(config: MeshConfig, scale: number): [number, number] {
  const size = config.size ?? 1;
  const [d0 = size, d1 = size, d2 = size] = config.dims ?? [];
  let wx: number;
  let wz: number;
  switch (config.geometry) {
    case "box":
      wx = d0; // width
      wz = d2; // depth
      break;
    case "plane":
      wx = d0;
      wz = d1;
      break;
    case "sphere":
      wx = wz = size * 2; // diameter
      break;
    case "cylinder":
      wx = wz = Math.max(d0, d1) * 2; // diameter
      break;
  }
  const rep = (w: number) => Math.max(0.25, w / scale);
  return [rep(wx), rep(wz)];
}

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
