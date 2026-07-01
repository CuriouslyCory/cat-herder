import { withAuth } from "@workos-inc/authkit-nextjs";

import { db } from "~/server/db";
import { upsertUser } from "~/server/game/upsertUser";
import { api } from "~/trpc/server";
import { GameLoader } from "./_components/GameLoader";
import type { MapData } from "~/game/maps/MapData";

/**
 * Protected game page. Middleware (`src/middleware.ts`) already redirects
 * unauthenticated users to WorkOS hosted sign-in before they reach this
 * component, so by the time we render here the user is guaranteed to exist.
 *
 * `ensureSignedIn: true` tells the SDK to throw a redirect if somehow the
 * user is missing, and narrows the return type so `user` is non-null.
 *
 * GameLoader is a 'use client' component that uses next/dynamic with ssr:false
 * to ensure Three.js never executes during server rendering.
 */
export default async function PlayPage() {
  const { user } = await withAuth({ ensureSignedIn: true });

  // Upsert the user row (creates on first visit, no-op on conflict).
  // Bootstrap flag is applied only if this is the first insert.
  // isAdmin is fetched server-side here — no extra client round-trip.
  const { isAdmin } = await upsertUser(db, user.id, user.email ?? "");

  // Fetch the default map server-side (seeds it from TestMap if the table is
  // empty). The game uses initialMap ?? TestMap as a synchronous fallback, so
  // a null here is safe — the client falls back to the built-in map.
  const defaultMapResult = await api.map.getDefaultMap();
  const initialMap: MapData | undefined = defaultMapResult
    ? (defaultMapResult.mapData as MapData)
    : undefined;

  // Pass only a safe subset — no tokens or sensitive fields to the client
  const safeUser = {
    id: user.id,
    firstName: user.firstName,
    email: user.email,
    isAdmin,
  };

  return (
    <main style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <GameLoader user={safeUser} initialMap={initialMap} />
    </main>
  );
}
