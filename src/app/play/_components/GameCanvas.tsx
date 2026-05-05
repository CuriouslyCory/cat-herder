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

type StartState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "running" };

/**
 * Client-only component that owns the Three.js canvas.
 * Loaded via next/dynamic with ssr: false so Three.js never runs on the server.
 *
 * Flow:
 *  1. Query getCharacter on mount.
 *  2. If no character exists → render CharacterCreator overlay (game not yet started).
 *  3. Once a character is confirmed (DB or newly created) → start the game.
 *     - show loading indicator while Persistence.load() is in flight.
 *     - on error → show retry / start-new-game options (user consents to save loss).
 *  4. If the game is already running and a new character is set → call spawnPlayer().
 */
export function GameCanvas({ user }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [startState, setStartState] = useState<StartState>({ phase: "idle" });

  // Character explicitly set by CharacterCreator (takes priority over DB row)
  const [createdCharacter, setCreatedCharacter] =
    useState<PlayerCharacterConfig | null>(null);

  const { data: savedCharacter, isLoading } = api.game.getCharacter.useQuery();

  // ── tRPC adapter ────────────────────────────────────────────────────────────
  // The Game engine never imports from ~/trpc; GameCanvas builds a thin adapter
  // that closes over the mutation functions and injects it at construction time.

  const { mutateAsync: upsertSaveMutateAsync } =
    api.game.upsertSave.useMutation();
  const { refetch: refetchSave } = api.game.getSave.useQuery(undefined, {
    enabled: false,
    staleTime: Infinity,
  });

  // Refs are initialized once; synced after every commit so the game loop always
  // calls the latest function without needing to recreate the stable adapter.
  const upsertSaveRef = useRef(upsertSaveMutateAsync);
  const refetchSaveRef = useRef(refetchSave);
  useEffect(() => {
    upsertSaveRef.current = upsertSaveMutateAsync;
    refetchSaveRef.current = refetchSave;
  });

  // Stable adapter — created once; always delegates to the latest functions
  const trpcAdapter = useMemo<GameTrpcAdapter>(
    () => ({
      upsertSave: (input) => upsertSaveRef.current(input),
      getSave: async () => {
        const result = await refetchSaveRef.current({ throwOnError: false });
        if (!result.data) return null;
        return result.data as { version: string; saveData: Record<string, unknown> };
      },
    }),
    [], // stable for the lifetime of this component mount
  );

  // ── DB hydration ────────────────────────────────────────────────────────────
  // Derive config directly from the query result — no effect or setState needed.
  const savedCharacterConfig = useMemo<PlayerCharacterConfig | null>(() => {
    if (isLoading || !savedCharacter) return null;
    const { shape, colorHex, sizeScale } = savedCharacter;
    // Shape stored as varchar in DB; validated on write via Zod, but cast safely here.
    const validShape = (["box", "sphere", "cylinder"] as const).includes(
      shape as PlayerCharacterConfig["shape"],
    )
      ? (shape as PlayerCharacterConfig["shape"])
      : "box";
    return { shape: validShape, colorHex, sizeScale };
  }, [savedCharacter, isLoading]);

  // Effective character: prefer creator output over DB row
  const character = createdCharacter ?? savedCharacterConfig;

  // ── Helpers for retry / start-fresh ─────────────────────────────────────────
  const handleRetry = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    setStartState({ phase: "loading" });
    game
      .start()
      .then(() => setStartState({ phase: "running" }))
      .catch((err: unknown) =>
        setStartState({
          phase: "error",
          message:
            err instanceof Error ? err.message : "Failed to load save data.",
        }),
      );
  }, []);

  const handleStartFresh = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    try {
      game.startFresh();
      setStartState({ phase: "running" });
    } catch (err: unknown) {
      setStartState({
        phase: "error",
        message:
          err instanceof Error ? err.message : "Failed to start new game.",
      });
    }
  }, []);

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

    let cancelled = false;

    setStartState({ phase: "loading" });
    game
      .start()
      .then(() => {
        if (!cancelled) setStartState({ phase: "running" });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStartState({
            phase: "error",
            message:
              err instanceof Error ? err.message : "Failed to load save data.",
          });
        }
      });

    return () => {
      cancelled = true;
      game.destroy();
      gameRef.current = null;
      canvas.remove();
      setStartState({ phase: "idle" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);
  // `user` and `trpcAdapter` intentionally omitted: both are stable for the
  // lifetime of this mount. Including them would trigger an unnecessary restart.

  const handleCharacterCreated = useCallback((config: PlayerCharacterConfig) => {
    setCreatedCharacter(config);
  }, []);

  const showCreator = !isLoading && character === null;

  return (
    <>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      />

      {/* Loading overlay — visible while Persistence.load() is in flight */}
      {startState.phase === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: "1.25rem",
            zIndex: 20,
          }}
        >
          Loading save data…
        </div>
      )}

      {/* Error overlay — load failed; player must choose retry or start fresh */}
      {startState.phase === "error" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            background: "rgba(0,0,0,0.85)",
            color: "#fff",
            zIndex: 20,
          }}
        >
          <p style={{ margin: 0, fontSize: "1.1rem" }}>
            Failed to load save: {startState.message}
          </p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={handleRetry}
              style={{
                padding: "0.5rem 1.25rem",
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Retry
            </button>
            <button
              onClick={handleStartFresh}
              style={{
                padding: "0.5rem 1.25rem",
                background: "#6b7280",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Start New Game
            </button>
          </div>
        </div>
      )}

      {showCreator && <CharacterCreator onComplete={handleCharacterCreated} />}
    </>
  );
}
