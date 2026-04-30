import { withAuth } from "@workos-inc/authkit-nextjs";

import { GameLoader } from "./_components/GameLoader";

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

  // Pass only a safe subset — no tokens or sensitive fields to the client
  const safeUser = {
    id: user.id,
    firstName: user.firstName,
    email: user.email,
  };

  return (
    <main style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <GameLoader user={safeUser} />
    </main>
  );
}
