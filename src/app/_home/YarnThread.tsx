"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  catmullRomPath,
  dashOffset,
  scrollDrawFraction,
  verticalGradientStops,
  type Point,
} from "./yarn-thread";

const EMBER = "#f2b04a";

/** Order the thread visits its anchors, top to bottom. */
const ANCHOR_ORDER = [
  "wordmark",
  "hero",
  "cat-0",
  "cat-1",
  "cat-2",
  "cat-3",
  "step-0",
  "step-1",
  "step-2",
  "ball",
] as const;

interface ThreadModel {
  d: string;
  width: number;
  height: number;
  stops: { offset: number; color: string }[];
}

/**
 * The signature: one continuous strand of yarn that leaves the hero cat, winds
 * down through the four cat beads and the three how-it-plays knots, and coils
 * into the ball of yarn behind the final Play button — drawing ahead of the
 * reader as they scroll, washing through each cat's color on the way down.
 *
 * Decorative and aria-hidden. With reduced motion it renders fully drawn and
 * static, so its meaning (the through-line + color coding) survives with no
 * motion and no scroll listeners.
 */
export function YarnThread() {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [model, setModel] = useState<ThreadModel | null>(null);
  const reducedRef = useRef(false);

  const measure = useCallback((): ThreadModel | null => {
    if (typeof document === "undefined") return null;
    const doc = document.documentElement;
    const height = doc.scrollHeight;
    const width = doc.clientWidth;

    const found = new Map<string, { point: Point; color: string }>();
    document.querySelectorAll<HTMLElement>("[data-thread-anchor]").forEach((el) => {
      const id = el.dataset.threadAnchor;
      if (!id) return;
      const r = el.getBoundingClientRect();
      found.set(id, {
        point: { x: r.left + window.scrollX + r.width / 2, y: r.top + window.scrollY + r.height / 2 },
        color: el.dataset.threadColor ?? EMBER,
      });
    });

    const ordered = ANCHOR_ORDER.map((id) => found.get(id)).filter(
      (a): a is { point: Point; color: string } => a !== undefined,
    );
    if (ordered.length < 2) return null;

    const points = ordered.map((a) => a.point);
    const stops = verticalGradientStops(
      ordered.map((a) => ({ y: a.point.y, color: a.color })),
      height,
      EMBER,
    );
    return { d: catmullRomPath(points), width, height, stops };
  }, []);

  const rebuild = useCallback(() => {
    const next = measure();
    if (next) setModel(next);
  }, [measure]);

  // Build on mount, and whenever layout can change. Scheduling uses setTimeout
  // (not requestAnimationFrame) so the initial build still runs when the page
  // loads in a hidden/background tab, where rAF callbacks are paused. Deferring
  // also avoids a synchronous setState inside the effect body.
  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let timer = window.setTimeout(rebuild, 0);
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(rebuild, 120);
    };

    // Fonts change text metrics → section heights → anchor positions.
    document.fonts?.ready.then(schedule).catch(() => undefined);

    window.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      clearTimeout(timer);
    };
  }, [rebuild]);

  // Draw-on-scroll: mutate the path directly (no React re-render per frame).
  useEffect(() => {
    const path = pathRef.current;
    if (!path || !model) return;

    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;

    if (reducedRef.current) {
      path.style.strokeDashoffset = "0"; // fully drawn, static
      return;
    }

    let raf = 0;
    const apply = () => {
      raf = 0;
      const frac = scrollDrawFraction(
        window.scrollY,
        document.documentElement.scrollHeight,
        window.innerHeight,
      );
      path.style.strokeDashoffset = `${dashOffset(length, frac)}`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [model]);

  if (!model) return null;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-0"
      width={model.width}
      height={model.height}
      viewBox={`0 0 ${model.width} ${model.height}`}
      fill="none"
    >
      <defs>
        <linearGradient
          id="yarn-grad"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={0}
          y2={model.height}
        >
          {model.stops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <path
        ref={pathRef}
        d={model.d}
        stroke="url(#yarn-grad)"
        strokeWidth={3}
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}
      />
    </svg>
  );
}
