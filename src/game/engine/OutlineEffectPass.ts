import * as THREE from "three";
import { Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";

/**
 * Wraps three.js `OutlineEffect` — which is a renderer wrapper, not a `Pass` —
 * so its inverted-hull ink outlines can live inside the EffectComposer chain
 * ahead of bloom/output.
 *
 * Modeled on the stock `RenderPass`: it renders the beauty pass into `readBuffer`
 * with `needsSwap = false`, and the only substantive change is calling
 * `effect.render()` (scene + ink outline) instead of `renderer.render()`.
 * `OutlineEffect.render()` honors whichever render target is currently bound and
 * never rebinds it (verified in the addon source), so binding `readBuffer` first
 * lands both the scene and the outline there for the next pass to consume.
 */
export class OutlineEffectPass extends Pass {
  private readonly scene: THREE.Scene;
  private camera: THREE.Camera;
  private readonly effect: OutlineEffect;

  constructor(effect: OutlineEffect, scene: THREE.Scene, camera: THREE.Camera) {
    super();
    this.effect = effect;
    this.scene = scene;
    this.camera = camera;
    this.clear = true;
    this.needsSwap = false;
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.clear) {
      renderer.clear(
        renderer.autoClearColor,
        renderer.autoClearDepth,
        renderer.autoClearStencil,
      );
    }

    this.effect.render(this.scene, this.camera);

    renderer.autoClear = oldAutoClear;
  }

  dispose(): void {
    // OutlineEffect owns a transient outline-material cache that it prunes each
    // frame; this pass allocates no render targets of its own, so there is
    // nothing further to release here.
  }
}
