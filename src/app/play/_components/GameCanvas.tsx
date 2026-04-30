"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Game,
  type GameTrpcAdapter,
  type GameUser,
  type PlayerCharacterConfig,
} from "~/game/engine/Game";
import { api } from "~/trpc/react";

import { CharacterCreator } from "./CharacterCreator";

interface GameCanvasProps {
  user: GameUser;
}

/**
 * Client-only component that owns the Three.js canvas.
 * Loaded via next/dynamic with ssr: false so Three.js never runs on the server.
 *
 * Flow:
 *  1. Query getCharacter on mount.
 *  2. If no character exists → render CharacterCreator overlay (game not yet started).
 *  3. Once a character is confirmed (DB or newly created) → start the game.
 *  4. If the game is already running and a new character is set → call spawnPlayer().
 */
export function GameCanvas({ user }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  // Local character state: populated from DB query or from CharacterCreator submit
  const [character, setCharacter] = useState<PlayerCharacterConfig | null>(null);

  const { data: savedCharacter, isLoading } = api.game.getCharacter.useQuery();

  // ── tRPC adapter ────────────────────────────────────────────────────────────
  // The Game engine never imports from ~/trpc; GameCanvas builds a thin adapter
  // that closes over the mutation functions and injects it at construction time.

  const { mutateAsync: upsertSaveMutateAsync } =
    api.game.upsertSave.useMutation();

  // Keep a stable ref to mutateAsync so the adapter object never needs to change
  const upsertSaveRef = useRef(upsertSaveMutateAsync);
  upsertSaveRef.current = upsertSaveMutateAsync;

  // Stable adapter — created once; always delegates to the latest mutateAsync
  const trpcAdapter = useMemo<GameTrpcAdapter>(
    () => ({
      upsertSave: (input) => upsertSaveRef.current(input),
    }),
    [], // stable for the lifetime of this component mount
  );

  // ── DB hydration ────────────────────────────────────────────────────────────
  // When the DB query resolves with an existing character, hydrate local state
  useEffect(() => {
    if (isLoading || !savedCharacter) return;
    const { shape, colorHex, sizeScale } = savedCharacter;
    // Shape stored as varchar in DB; cast to the literal union (values are Zod-validated on write)
    const validShape = (["box", "sphere", "cylinder"] as const).includes(
      shape as PlayerCharacterConfig["shape"],
    )
      ? (shape as PlayerCharacterConfig["shape"])
      : "box";
    setCharacter({ shape: validShape, colorHex, sizeScale });
  }, [savedCharacter, isLoading]);

  // ── Game lifecycle ──────────────────────────────────────────────────────────
  // Start (or update) the game whenever a character becomes available
  useEffect(() => {
    if (!character) return;

    const container = containerRef.current;
    if (!container) return;

    // If the game is already running, just update the player mesh in-place
    if (gameRef.current) {
      gameRef.current.spawnPlayer(character);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const game = new Game(canvas, { user, character, trpc: trpcAdapter });
    gameRef.current = game;
    void game.start();

    return () => {
      game.destroy();
      gameRef.current = null;
      canvas.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);
  // `user` and `trpcAdapter` intentionally omitted: both are stable for the
  // lifetime of this mount. Including them would trigger an unnecessary restart.

  const handleCharacterCreated = useCallback((config: PlayerCharacterConfig) => {
    setCharacter(config);
  }, []);

  const showCreator = !isLoading && character === null;

  return (
    <>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      />
      {showCreator && <CharacterCreator onComplete={handleCharacterCreated} />}
    </>
  );
}
