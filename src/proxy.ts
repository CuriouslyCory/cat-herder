import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

/**
 * AuthKit proxy (Next.js 16 — formerly `middleware`).
 *
 * `middlewareAuth.unauthenticatedPaths` is the allowlist — every other path that
 * matches `config.matcher` will redirect unauthenticated users to WorkOS hosted
 * sign-in. The tRPC HTTP endpoint is allowlisted because per-procedure auth is
 * enforced inside tRPC itself via `protectedProcedure`.
 *
 * Per Next.js 16 conventions, this file is named `proxy.ts` and the exported
 * function is `proxy` (even when re-exported as default). The `proxy` runtime
 * is `nodejs` — `edge` is not supported here.
 */
const proxy = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/", "/api/trpc/(.*)"],
  },
});

export default proxy;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
