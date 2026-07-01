"use client";

import { useEffect, useRef, useState } from "react";

interface RevealProps {
  children: React.ReactNode;
  /** Stagger the entrance, in ms. */
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section";
}

/**
 * Fades + rises its children into view once, on first intersection. The
 * static end-state is baked into the .ch-reveal CSS, so with reduced motion
 * (or before hydration) the content is simply visible.
 */
export function Reveal({ children, delay = 0, className = "", as = "div" }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as;
  // A callback ref accepts the widest element type, so it is assignable across
  // every intrinsic tag `as` can be — no `as never` escape hatch needed.
  const setRef = (el: HTMLElement | null) => {
    ref.current = el;
  };
  return (
    <Tag
      ref={setRef}
      className={`ch-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
