/**
 * Pure resolution of the primary "Play" call-to-action state from auth.
 *
 * Kept free of React/WorkOS imports so it can be unit-tested in the node
 * vitest environment. PlayCta.tsx renders these three states.
 */

export type PlayCtaState =
  | { readonly kind: "loading" }
  | { readonly kind: "play"; readonly href: "/play" }
  | { readonly kind: "signin" };

export interface AuthLike {
  /** Truthy when a signed-in user exists. */
  readonly user: unknown;
  /** True while auth is still resolving on the client. */
  readonly loading: boolean;
}

export function resolvePlayCta({ user, loading }: AuthLike): PlayCtaState {
  if (loading) return { kind: "loading" };
  if (user) return { kind: "play", href: "/play" };
  return { kind: "signin" };
}
