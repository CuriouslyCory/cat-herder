"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";

export function NavAuth() {
  const { user, loading, refreshAuth, signOut } = useAuth();

  if (loading) return null;

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm opacity-80">
          {user.firstName ?? user.email}
        </span>
        <a href="/play" className="underline">
          Play
        </a>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded border px-3 py-1 text-sm"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void refreshAuth({ ensureSignedIn: true })}
      className="rounded border px-3 py-1 text-sm"
    >
      Sign in
    </button>
  );
}
