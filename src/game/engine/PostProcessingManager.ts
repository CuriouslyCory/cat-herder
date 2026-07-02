import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { OutlineEffectPass } from "./OutlineEffectPass";
import type { VisualConfig } from "../config";

// ---------------------------------------------------------------------------
// PostProcessingManager
//
// Chain: OutlineEffectPass (scene + per-object ink outline) → UnrealBloomPass
// (subtle) → OutputPass (tone mapping + color-space output). The dark ink lines
// come from three.js OutlineEffect, whose thickness/color/alpha are driven
// per-mesh via material.userData.outlineParameters (set in SceneManager.addMesh).
// ---------------------------------------------------------------------------

export class PostProcessingManager {
  private readonly composer: EffectComposer;
  private readonly outlineEffect: OutlineEffect;
  private readonly outlinePass: OutlineEffectPass;
  private readonly bloomPass: UnrealBloomPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private camera: THREE.Camera,
    private config: VisualConfig,
  ) {
    const size = renderer.getSize(new THREE.Vector2());
    const pixelRatio = renderer.getPixelRatio();

    // EffectComposer's default render target has samples:0, so the renderer's
    // `antialias:true` is bypassed on the post-processing path — thin ink
    // outlines then alias and shimmer/smear as the camera pans. Hand the
    // composer a multisampled (MSAA) target to restore anti-aliasing. Match the
    // default HalfFloatType (HDR-linear, so bloom/OutputPass behave), and
    // setSize() preserves `samples` on resize.
    const msaaTarget = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(size.x * pixelRatio)),
      Math.max(1, Math.floor(size.y * pixelRatio)),
      { type: THREE.HalfFloatType, samples: 4 },
    );
    this.composer = new EffectComposer(renderer, msaaTarget);
    // Normalize the composer's internal size to CSS pixels (the constructor
    // records the target's device-pixel dimensions when a target is supplied).
    this.composer.setSize(Math.max(1, size.x), Math.max(1, size.y));

    // Global fallback ink; per-mesh userData.outlineParameters overrides these.
    this.outlineEffect = new OutlineEffect(renderer, {
      defaultThickness: config.outlineThickness,
      defaultColor: [0, 0, 0],
      defaultAlpha: 1,
    });
    this.outlinePass = new OutlineEffectPass(this.outlineEffect, scene, camera);
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

  // ── Camera sync ───────────────────────────────────────────────────────────

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
    this.outlinePass.setCamera(camera);
  }

  // ── Config ────────────────────────────────────────────────────────────────

  setConfig(config: Partial<VisualConfig>): void {
    Object.assign(this.config, config);

    // Outline thickness lives per-mesh (material.userData.outlineParameters),
    // so live thickness/toon-band tweaks are applied by SceneManager, not here.
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
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  dispose(): void {
    // EffectComposer.dispose() frees only its own render targets + copy pass;
    // it does NOT cascade to added passes. UnrealBloomPass owns several render
    // targets/materials that would otherwise leak on teardown.
    this.bloomPass.dispose();
    this.outlinePass.dispose();
    this.composer.dispose();
  }
}
