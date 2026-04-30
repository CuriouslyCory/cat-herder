import * as THREE from "three";

export interface GameUser {
  id: string;
  firstName?: string | null;
  email?: string | null;
}

export interface GameOpts {
  user: GameUser;
}

/**
 * Top-level game orchestrator.
 *
 * US-001 stub: creates a Three.js scene with a colored box on a ground plane.
 * Full implementation in US-017 will wire in ECS, systems, physics, etc.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver;

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

    // Player box
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xff6b35 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = 0.5;
    box.castShadow = true;
    this.scene.add(box);

    // Handle resize
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);
    this.handleResize();
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
}
