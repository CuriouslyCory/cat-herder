import { withAuth } from "@workos-inc/authkit-nextjs";

import { NavAuth } from "~/app/_components/nav-auth";

/**
 * Protected game page. Middleware (`src/middleware.ts`) already redirects
 * unauthenticated users to WorkOS hosted sign-in before they reach this
 * component, so by the time we render here the user is guaranteed to exist.
 *
 * `ensureSignedIn: true` is a belt-and-suspenders type narrowing — it tells the
 * SDK to throw a redirect if somehow the user is missing, and narrows the
 * return type so `user` is non-null.
 */
export default async function PlayPage() {
  const { user } = await withAuth({ ensureSignedIn: true });

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-[#15162c] to-[#000] text-white">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-xl font-bold">Cat Herder · Play</span>
        <NavAuth />
      </header>
      <div className="container mx-auto flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16">
        <h1 className="text-3xl font-bold">
          Welcome, {user.firstName ?? user.email}
        </h1>
        <p className="opacity-70">
          The three.js canvas will mount here once the game is wired up.
        </p>
      </div>
    </main>
  );
}
