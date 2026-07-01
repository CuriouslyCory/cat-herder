"use client";

import { useMemo } from "react";

/**
 * A calm scatter of warm twinkling stars behind the hero. Dimmed and warmed
 * toward ember versus the prototype's brighter field — atmosphere, not sparkle.
 * Positions are deterministic per index so there is no hydration mismatch.
 */
export function Starfield({ count = 44 }: { count?: number }) {
  const stars = useMemo(() => {
    // Deterministic pseudo-random from a hash of the index — stable across SSR.
    const rand = (n: number, salt: number) => {
      const x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    // Fixed-precision strings so SSR and client markup match exactly.
    return Array.from({ length: count }, (_, i) => ({
      left: (rand(i, 1) * 100).toFixed(3),
      top: (rand(i, 2) * 70).toFixed(3), // upper 70% only — keep the horizon clear
      size: (1 + rand(i, 3) * 2).toFixed(3),
      delay: (rand(i, 4) * 3).toFixed(3),
      duration: (1.8 + rand(i, 5) * 1.6).toFixed(3),
      warm: rand(i, 6) > 0.7,
    }));
  }, [count]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s, i) => (
        <span
          key={i}
          className="ch-twinkle absolute rounded-full"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            background: s.warm ? "var(--color-ember)" : "var(--color-mist)",
            opacity: 0.5,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
