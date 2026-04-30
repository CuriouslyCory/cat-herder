import * as THREE from "three";

export interface GameUser {
  id: string;
  firstName?: string | null;
  email?: string | null;
}

export interface PlayerCharacterConfig {
  shape: "box" | "sphere" | "cylinder";
  colorHex: string;
  sizeScale: number;
}

export interface GameOpts {
  user: GameUser;
  character?: PlayerCharacterConfig;
}

/**
 * Top-level game orchestrator.
 *
 * US-001 stub: creates a Three.js scene with a colored box on a ground plane.
 * Full implementation in US-017 will wire in ECS, systems, physics, etc.
 *
 * US-015 additions: accepts a PlayerCharacterConfig and exposes spawnPlayer()
 * so the CharacterCreator overlay can update the in-scene mesh after creation.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver;
  private playerMesh: THREE.Mesh | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: GameOpts,
  ) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 0, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(5, 10, 5);
    sun.castShadow = true;
    this.scene.add(sun);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Spawn player mesh (character config or default placeholder)
    if (opts.character) {
      this.spawnPlayer(opts.character);
    } else {
      this.spawnDefaultPlayer();
    }

    // Handle resize
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);
    this.handleResize();
  }

  /**
   * Replace the player mesh with one matching the given character config.
   * Called once on start (if character exists) and after CharacterCreator submits.
   */
  spawnPlayer(config: PlayerCharacterConfig): void {
    if (this.playerMesh) {
      this.scene.remove(this.playerMesh);
      this.playerMesh.geometry.dispose();
      (this.playerMesh.material as THREE.Material).dispose();
      this.playerMesh = null;
    }

    const s = config.sizeScale;
    let geo: THREE.BufferGeometry;
    switch (config.shape) {
      case "sphere":
        geo = new THREE.SphereGeometry(0.5 * s, 16, 16);
        break;
      case "cylinder":
        geo = new THREE.CylinderGeometry(0.4 * s, 0.4 * s, s, 12);
        break;
      default:
        geo = new THREE.BoxGeometry(s, s, s);
    }

    const mat = new THREE.MeshStandardMaterial({ color: config.colorHex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.5 * s;
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.playerMesh = mesh;
  }

  async start(): Promise<void> {
    this.loop();
  }

  pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  resume(): void {
    if (this.rafId === null) {
      this.loop();
    }
  }

  destroy(): void {
    this.pause();
    this.resizeObserver.disconnect();
    this.renderer.dispose();
  }

  private loop(): void {
    this.rafId = requestAnimationFrame(() => this.loop());
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private spawnDefaultPlayer(): void {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff6b35 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.5;
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.playerMesh = mesh;
  }
}
