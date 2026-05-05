import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { TerrainEdgePass } from "./TerrainEdgePass";
import type { VisualConfig } from "../config";
import type { OutlineCategory } from "./SceneManager";

// ---------------------------------------------------------------------------
// Outline color presets per category
// ---------------------------------------------------------------------------

const OUTLINE_COLORS: Record<Exclude<OutlineCategory, "none">, THREE.Color> = {
  player: new THREE.Color(0xffffff),
  cat: new THREE.Color(0xffe066),
  pickup: new THREE.Color(0xffd700),
  resource: new THREE.Color(0x88cc88),
};

// ---------------------------------------------------------------------------
// PostProcessingManager
// ---------------------------------------------------------------------------

export class PostProcessingManager {
  private readonly composer: EffectComposer;
  private readonly terrainEdgePass: TerrainEdgePass;
  private readonly outlinePass: OutlinePass;
  private readonly bloomPass: UnrealBloomPass;

  private readonly outlinedObjects = new Map<THREE.Object3D, OutlineCategory>();

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private camera: THREE.Camera,
    private config: VisualConfig,
  ) {
    const size = renderer.getSize(new THREE.Vector2());

    this.composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    this.terrainEdgePass = new TerrainEdgePass(
      scene,
      camera,
      size.x || 1,
      size.y || 1,
    );
    this.terrainEdgePass.enabled = config.edgeDetection;
    this.composer.addPass(this.terrainEdgePass);

    this.outlinePass = new OutlinePass(size, scene, camera);
    this.outlinePass.edgeStrength = config.outlineStrength;
    this.outlinePass.edgeThickness = config.outlineThickness;
    this.outlinePass.edgeGlow = config.outlineGlow;
    this.outlinePass.visibleEdgeColor.set(0xffffff);
    this.outlinePass.hiddenEdgeColor.set(0x000000);
    this.outlinePass.enabled = config.outlines;
    this.composer.addPass(this.outlinePass);

    this.bloomPass = new UnrealBloomPass(
      size,
      config.bloomStrength,
      config.bloomRadius,
      config.bloomThreshold,
    );
    this.bloomPass.enabled = config.bloom;
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  // ── Outline management ────────────────────────────────────────────────────

  addToOutline(mesh: THREE.Object3D, category: Exclude<OutlineCategory, "none">): void {
    this.outlinedObjects.set(mesh, category);
    this.rebuildOutlineSelection();
  }

  removeFromOutline(mesh: THREE.Object3D): void {
    this.outlinedObjects.delete(mesh);
    this.rebuildOutlineSelection();
  }

  private rebuildOutlineSelection(): void {
    const selected: THREE.Object3D[] = [];
    for (const [obj] of this.outlinedObjects) {
      selected.push(obj);
    }
    this.outlinePass.selectedObjects = selected;

    // Use the dominant category color (player > cat > pickup > resource)
    if (this.outlinedObjects.size > 0) {
      const categories = [...this.outlinedObjects.values()];
      const dominant =
        categories.find((c) => c === "player") ??
        categories.find((c) => c === "cat") ??
        categories.find((c) => c === "pickup") ??
        "resource";
      this.outlinePass.visibleEdgeColor.copy(
        OUTLINE_COLORS[dominant as Exclude<OutlineCategory, "none">],
      );
    }
  }

  // ── Camera sync ───────────────────────────────────────────────────────────

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.terrainEdgePass.setCamera(camera);
    this.outlinePass.renderCamera = camera;
    const renderPass = this.composer.passes[0] as RenderPass;
    if (renderPass) renderPass.camera = camera;
  }

  // ── Config ────────────────────────────────────────────────────────────────

  setConfig(config: Partial<VisualConfig>): void {
    Object.assign(this.config, config);

    if (config.edgeDetection !== undefined) {
      this.terrainEdgePass.enabled = config.edgeDetection;
    }
    if (config.outlines !== undefined) {
      this.outlinePass.enabled = config.outlines;
    }
    if (config.outlineStrength !== undefined) {
      this.outlinePass.edgeStrength = config.outlineStrength;
    }
    if (config.outlineThickness !== undefined) {
      this.outlinePass.edgeThickness = config.outlineThickness;
    }
    if (config.outlineGlow !== undefined) {
      this.outlinePass.edgeGlow = config.outlineGlow;
    }
    if (config.bloom !== undefined) {
      this.bloomPass.enabled = config.bloom;
    }
    if (config.bloomStrength !== undefined) {
      this.bloomPass.strength = config.bloomStrength;
    }
    if (config.bloomThreshold !== undefined) {
      this.bloomPass.threshold = config.bloomThreshold;
    }
    if (config.bloomRadius !== undefined) {
      this.bloomPass.radius = config.bloomRadius;
    }
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  render(): void {
    this.composer.render();
  }

  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.terrainEdgePass.setSize(width, height);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  dispose(): void {
    this.outlinedObjects.clear();
    this.composer.dispose();
  }
}
