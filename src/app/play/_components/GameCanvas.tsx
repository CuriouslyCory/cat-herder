"use client";

import { useEffect, useRef } from "react";

import { Game, type GameUser } from "~/game/engine/Game";

interface GameCanvasProps {
  user: GameUser;
}

/**
 * Client-only component that owns the Three.js canvas.
 * Loaded via next/dynamic with ssr: false so Three.js never runs on the server.
 */
export function GameCanvas({ user }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create a canvas that fills the container
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);

    // Size canvas to container before first render
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const game = new Game(canvas, { user });
    gameRef.current = game;
    void game.start();

    return () => {
      game.destroy();
      gameRef.current = null;
      canvas.remove();
    };
  }, [user]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
    />
  );
}
