import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

/**
 * AuthKit middleware.
 *
 * `middlewareAuth.unauthenticatedPaths` is the allowlist — every other path that
 * matches `config.matcher` will redirect unauthenticated users to WorkOS hosted
 * sign-in. The tRPC HTTP endpoint is allowlisted because per-procedure auth is
 * enforced inside tRPC itself via `protectedProcedure`.
 */
export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/", "/api/trpc/(.*)"],
  },
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
