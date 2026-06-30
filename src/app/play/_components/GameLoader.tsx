"use client";

import dynamic from "next/dynamic";
import type { GameUser } from "~/game/engine/Game";
import type { MapData } from "~/game/maps/MapData";

// next/dynamic with ssr: false must live in a Client Component in Next.js 16+.
// This thin wrapper satisfies that constraint while keeping Three.js off the server.
const GameCanvas = dynamic(
  () =>
    import("./GameCanvas").then((mod) => ({
      default: mod.GameCanvas,
    })),
  { ssr: false },
);

interface GameLoaderProps {
  user: GameUser;
  initialMap?: MapData;
}

export function GameLoader({ user, initialMap }: GameLoaderProps) {
  return <GameCanvas user={user} initialMap={initialMap} />;
}
