// ---------------------------------------------------------------------------
// Pure helpers for the hand-drawn toon rendering style.
//
// Deliberately free of any `three` import so they run in the node test
// environment (vitest, no DOM/WebGL). SceneManager wraps the raw outputs into
// Three.js objects (DataTexture, Color, BufferAttribute).
// ---------------------------------------------------------------------------

/**
 * Build a toon gradient ramp as raw luminance bytes. MeshToonMaterial samples
 * its `gradientMap` by the surface's lighting factor and reads the red channel,
 * so an ascending 1×N ramp with NearestFilter yields hard cel banding.
 *
 * Values are spread across [64, 255] so even the darkest band keeps some tone
 * (fully-black shadowed faces read as holes in an isometric view). Returns
 * `bands` clamped to a minimum of 2 (a single band has no gradient to sample).
 */
export function buildGradientRamp(bands: number): {
  data: Uint8Array;
  width: number;
} {
  const width = Math.max(2, Math.floor(bands));
  const data = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    data[i] = Math.round(64 + (191 * i) / (width - 1));
  }
  return { data, width };
}

/**
 * Derive an ink-outline color from a fill color: the same hue, scaled toward
 * black. Mirrors the reference sketch, where each object's outline is a much
 * darker version of its own fill. Operates in 0xRRGGBB integer space.
 *
 * @param hex    Fill color as 0xRRGGBB.
 * @param factor Per-channel scale toward black (0 = black, 1 = unchanged).
 */
export function darkenForOutline(hex: number, factor = 0.15): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const dr = Math.round(r * factor);
  const dg = Math.round(g * factor);
  const db = Math.round(b * factor);
  return (dr << 16) | (dg << 8) | db;
}

/**
 * Deterministically displace vertex positions for a hand-drawn "lumpy" look.
 *
 * The offset is seeded by each vertex's POSITION (not its array index), so
 * coincident vertices — e.g. the shared corners/edges of a BoxGeometry, which
 * appear once per adjoining face — receive identical offsets and the mesh stays
 * watertight instead of tearing at the seams.
 *
 * Pure and stable: no `Math.random`, so the same `(positions, amp, seed)` always
 * produces the same result (important for tests and frame-to-frame stability).
 * Mutates and returns the given array. Each component moves by at most `amp`.
 */
export function jitterPositions(
  positions: Float32Array,
  amp: number,
  seed: number,
): Float32Array {
  if (amp === 0) return positions;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    positions[i] = x + hashNoise(x, y, z, seed) * amp;
    positions[i + 1] = y + hashNoise(x, y, z, seed + 1) * amp;
    positions[i + 2] = z + hashNoise(x, y, z, seed + 2) * amp;
  }
  return positions;
}

/**
 * Deterministic hash → pseudo-random value in [-1, 1). Inputs are quantized so
 * two vertices at the "same" position (down to 1e-4) hash identically, keeping
 * shared box corners welded after jitter.
 */
function hashNoise(x: number, y: number, z: number, seed: number): number {
  const qx = Math.round(x * 1e4) / 1e4;
  const qy = Math.round(y * 1e4) / 1e4;
  const qz = Math.round(z * 1e4) / 1e4;
  const h = Math.sin(qx * 127.1 + qy * 311.7 + qz * 74.7 + seed * 13.13) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}
