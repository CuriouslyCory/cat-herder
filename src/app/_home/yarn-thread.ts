/**
 * Pure geometry for the signature yarn thread. No DOM/React here so it can be
 * unit-tested in the node vitest environment; YarnThread.tsx supplies the real
 * anchor positions measured from the page.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A smooth cubic-bezier path through the given points using a centripetal-ish
 * Catmull-Rom spline. Endpoints are duplicated so the curve starts/ends exactly
 * on the first/last point. Returns an SVG path `d` string.
 */
export function catmullRomPath(points: readonly Point[], tension = 0.5): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${fmt(points[0]!.x)} ${fmt(points[0]!.y)}`;

  const p = points;
  const d: string[] = [`M ${fmt(p[0]!.x)} ${fmt(p[0]!.y)}`];

  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[i + 2] ?? p2;

    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;

    d.push(
      `C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`,
    );
  }
  return d.join(" ");
}

/**
 * How much of the thread should be drawn given the current scroll. The thread
 * intentionally leads the reader (draws slightly ahead of the scroll position)
 * and starts partly drawn so the hero already shows a strand.
 */
export function scrollDrawFraction(
  scrollY: number,
  scrollHeight: number,
  viewportHeight: number,
  { lead = 1.15, base = 0.06 }: { lead?: number; base?: number } = {},
): number {
  const scrollable = Math.max(1, scrollHeight - viewportHeight);
  const progress = scrollY / scrollable;
  return clamp01(progress * lead + base);
}

/** stroke-dashoffset for a path of `length`, given a 0..1 drawn fraction. */
export function dashOffset(length: number, drawFraction: number): number {
  return length * (1 - clamp01(drawFraction));
}

/**
 * Gradient stops (offset 0..1 + color) placed at each anchor's vertical
 * position, so the vertical thread washes through each cat's color as it
 * descends. `ember` bookends the run (hero strand → ball of yarn).
 */
export function verticalGradientStops(
  anchors: readonly { y: number; color: string }[],
  height: number,
  ember: string,
): { offset: number; color: string }[] {
  if (height <= 0) return [{ offset: 0, color: ember }];
  const mid = anchors
    .map((a) => ({ offset: clamp01(a.y / height), color: a.color }))
    .sort((a, b) => a.offset - b.offset);
  return [{ offset: 0, color: ember }, ...mid, { offset: 1, color: ember }];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function fmt(n: number): number {
  // Trim sub-pixel noise for a stable, cache-friendly path string.
  return Math.round(n * 100) / 100;
}
