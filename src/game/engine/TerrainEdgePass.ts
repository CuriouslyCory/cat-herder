import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform vec3 edgeColor;
uniform float normalThreshold;
uniform float depthThreshold;

varying vec2 vUv;

void main() {
  vec2 texel = 1.0 / resolution;

  // Roberts Cross on depth
  float d00 = texture2D(tDepth, vUv).x;
  float d10 = texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x;
  float d01 = texture2D(tDepth, vUv + vec2(0.0, texel.y)).x;
  float d11 = texture2D(tDepth, vUv + texel).x;

  float de1 = d00 - d11;
  float de2 = d10 - d01;
  float depthEdge = sqrt(de1 * de1 + de2 * de2);

  // Roberts Cross on normals
  vec3 n00 = texture2D(tNormal, vUv).rgb;
  vec3 n10 = texture2D(tNormal, vUv + vec2(texel.x, 0.0)).rgb;
  vec3 n01 = texture2D(tNormal, vUv + vec2(0.0, texel.y)).rgb;
  vec3 n11 = texture2D(tNormal, vUv + texel).rgb;

  float ne1 = length(n00 - n11);
  float ne2 = length(n10 - n01);
  float normalEdge = sqrt(ne1 * ne1 + ne2 * ne2);

  float edge = max(
    step(depthThreshold, depthEdge),
    step(normalThreshold, normalEdge)
  );

  vec4 color = texture2D(tDiffuse, vUv);
  gl_FragColor = mix(color, vec4(edgeColor, 1.0), edge);
}`;

export class TerrainEdgePass extends Pass {
  private readonly normalTarget: THREE.WebGLRenderTarget;
  private readonly normalOverride = new THREE.MeshNormalMaterial({
    flatShading: true,
  });
  private readonly fsQuad: FullScreenQuad;
  private readonly resolution: THREE.Vector2;

  constructor(
    private readonly scene: THREE.Scene,
    private camera: THREE.Camera,
    width: number,
    height: number,
  ) {
    super();

    this.resolution = new THREE.Vector2(width, height);

    this.normalTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.normalTarget.depthTexture = new THREE.DepthTexture(width, height);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: this.normalTarget.texture },
        tDepth: { value: this.normalTarget.depthTexture },
        resolution: { value: this.resolution },
        edgeColor: { value: new THREE.Color(0x000000) },
        normalThreshold: { value: 0.3 },
        depthThreshold: { value: 0.001 },
      },
      vertexShader,
      fragmentShader,
    });

    this.fsQuad = new FullScreenQuad(material);
  }

  setCamera(cam: THREE.Camera): void {
    this.camera = cam;
  }

  setSize(width: number, height: number): void {
    this.normalTarget.setSize(width, height);
    this.resolution.set(width, height);
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    // Hide transparent meshes so hidden terrain doesn't produce false edges
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.visible) {
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat.transparent && mat.opacity < 0.5) {
          obj.visible = false;
          hidden.push(obj);
        }
      }
    });

    // Render normals + depth to our target
    const prevOverride = this.scene.overrideMaterial;
    const prevBackground = this.scene.background;
    this.scene.overrideMaterial = this.normalOverride;
    this.scene.background = null;
    renderer.setRenderTarget(this.normalTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = prevOverride;
    this.scene.background = prevBackground;

    // Restore hidden meshes
    for (const obj of hidden) {
      obj.visible = true;
    }

    // Edge detection composite
    const mat = this.fsQuad.material as THREE.ShaderMaterial;
    mat.uniforms.tDiffuse!.value = readBuffer.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }

    this.fsQuad.render(renderer);
  }

  dispose(): void {
    this.normalTarget.dispose();
    this.normalOverride.dispose();
    (this.fsQuad.material as THREE.ShaderMaterial).dispose();
    this.fsQuad.dispose();
  }
}
