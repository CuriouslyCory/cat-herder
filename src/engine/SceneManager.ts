import * as THREE from "three";
import type { Vector3 } from "../types";

// ─── Public Types ─────────────────────────────────────────────────────────────

export type GeometryType = "box" | "sphere" | "cylinder" | "plane";

export interface MeshConfig {
  geometry: GeometryType;
  /** For box: [w, h, d]; sphere: [radius]; cylinder: [radiusTop, radiusBottom, height]; plane: [w, h] */
  size: [number, number?, number?];
  color: string; // hex string, e.g. "#ff5722"
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** Opaque handle — callers cannot access the underlying THREE.Object3D. */
export type SceneHandle = symbol;

// ─── SceneManager ─────────────────────────────────────────────────────────────

export class SceneManager {
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.OrthographicCamera;
  private readonly meshes = new Map<SceneHandle, THREE.Mesh>();

  // Ground plane raycast target for screenToWorld
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // Isometric orthographic camera
    const frustumSize = 20;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000,
    );
    this.camera.position.set(10, 10, 10);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    window.addEventListener("resize", this.handleResize);
  }

  addMesh(config: MeshConfig): SceneHandle {
    const geometry = this.buildGeometry(config);
    const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(config.color) });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = config.castShadow ?? false;
    mesh.receiveShadow = config.receiveShadow ?? false;
    this.scene.add(mesh);

    const handle: SceneHandle = Symbol();
    this.meshes.set(handle, mesh);
    return handle;
  }

  removeMesh(handle: SceneHandle): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    this.meshes.delete(handle);
  }

  updateTransform(
    handle: SceneHandle,
    position: Vector3,
    rotation: Vector3,
    scale: Vector3,
  ): void {
    const mesh = this.meshes.get(handle);
    if (!mesh) return;
    mesh.position.set(position.x, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.scale.set(scale.x, scale.y, scale.z);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    const frustumSize = 20;
    const aspect = width / height;
    this.camera.left = (-frustumSize * aspect) / 2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  screenToWorld(screenX: number, screenY: number): Vector3 | null {
    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const target = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
    if (!hit) return null;
    return { x: target.x, y: target.y, z: target.z };
  }

  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.renderer.dispose();
  }

  private readonly handleResize = (): void => {
    this.resize(window.innerWidth, window.innerHeight);
  };

  private buildGeometry(config: MeshConfig): THREE.BufferGeometry {
    const [a = 1, b = 1, c = 1] = config.size;
    switch (config.geometry) {
      case "box":
        return new THREE.BoxGeometry(a, b, c);
      case "sphere":
        return new THREE.SphereGeometry(a, 16, 16);
      case "cylinder":
        return new THREE.CylinderGeometry(a, b, c, 16);
      case "plane":
        return new THREE.PlaneGeometry(a, b);
    }
  }
}
