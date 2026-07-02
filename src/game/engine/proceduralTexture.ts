// ---------------------------------------------------------------------------
// Procedural surface texture — a subtle, tileable "hand-drawn fill" (grain +
// faint cross-hatch) used as the toon material's albedo map. It gives flat cel
// surfaces enough interior detail to read edges, slopes, and — because the
// pattern doesn't align across separate meshes — the seams between adjacent
// terrain zones, aiding transition legibility.
//
// Free of any `three` import so it runs in the node test environment; the raw
// RGBA bytes are wrapped into a THREE.DataTexture by SceneManager.
// ---------------------------------------------------------------------------

/**
 * Generate a tileable grayscale surface pattern as RGBA bytes (mostly white so
 * it modulates the base color only slightly when multiplied as a `.map`).
 *
 * Deterministic (no `Math.random`) so output is stable and unit-testable. The
 * hatch line periods divide `size`, so the pattern wraps seamlessly under
 * RepeatWrapping.
 *
 * @param size Texture edge length in texels (clamped to a minimum of 4).
 * @param seed Varies the grain without changing structure.
 */
export function generateSurfaceTexture(
  size = 64,
  seed = 1,
): { data: Uint8Array; size: number } {
  const s = Math.max(4, Math.floor(size));
  const data = new Uint8Array(s * s * 4);

  // Hatch lines every ~1/8 of the tile; periods chosen to divide s so they tile.
  const hatchPeriod = Math.max(2, Math.round(s / 8));
  const crossPeriod = hatchPeriod * 2;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let v = 255;

      // Faint speckle grain (up to ~7% darker).
      v -= Math.round(hash2(x, y, seed) * 18);

      // Primary diagonal hatch — thin, slightly darker lines.
      if ((x + y) % hatchPeriod === 0) v -= 28;
      // Sparser opposing diagonal — even fainter cross-hatch.
      if ((x - y + s) % crossPeriod === 0) v -= 16;

      if (v < 0) v = 0;

      const i = (y * s + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  return { data, size: s };
}

/** Deterministic hash → [0, 1). Quantization-free; inputs are integer texels. */
function hash2(x: number, y: number, seed: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return h - Math.floor(h);
}
