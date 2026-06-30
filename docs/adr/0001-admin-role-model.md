# ADR 0001 — Admin Role Model

**Status:** Accepted  
**Date:** 2026-06-29  
**Issue:** #13

## Context

The cat-herder game is adding map-authoring features that must be gated behind an admin
check. WorkOS (the auth provider) handles authentication; it does not own the authorisation
data for this application. We need a decision on where and how to store who is an admin.

Constraints:
- DB driver is neon-http (no interactive transactions).
- WorkOS user IDs (`user_01XXXXXXXX`) are the canonical identity key already used in
  `characters`, `gameSaves`, and `debugOverrides` tables.
- The project uses Drizzle ORM with pgTableCreator prefix `cat-herder_`.
- First-admin bootstrap must happen at row creation time only (so manual demotions persist).
- Schema is applied via `db:push` per project convention; no migrations dir exists.

## Decision

Add a `users` table with columns `userId` (PK, WorkOS user ID varchar 256), `email` (varchar
256, not null), and `isAdmin` (boolean, not null, default false). Upsert a row on the first
authenticated server touch (the play page `withAuth` call). Check `ADMIN_BOOTSTRAP_EMAILS`
(comma-separated) only when inserting a new row; use `.onConflictDoNothing()` on the upsert
so subsequent logins never flip the bit.

An `adminProcedure` extends `protectedProcedure` with a middleware that queries `users.isAdmin`
for the authenticated user, throws `FORBIDDEN` if false/absent, and passes through if true.

Schema is applied to the live database via `pnpm db:push` (project convention; no migrations
dir exists in this repo). This is an additive, non-destructive operation.

## Consequences

Positive:
- Simple, auditable: one column, one table, visible in `db:studio`.
- Bootstrappable via env var; fallback is a direct `db:studio` flip (documented).
- No extra client round-trip: `isAdmin` is fetched in the `PlayPage` server component
  alongside `withAuth` and threaded into the `GameUser` prop.
- Minimal schema surface — easy to extend to a full roles table later.

Negative:
- Boolean does not support multiple role tiers (e.g., moderator). Migration to a roles
  table would require a new column or a separate relation.
- Admin list in env var is only a convenience bootstrap, not a runtime source of truth.
- Email changes in WorkOS are not reflected after first insert (`.onConflictDoNothing()`
  skips the email column on conflict). Known trade-off; documented in `upsertUser.ts`.

## Alternatives considered

### A. `isAdmin` boolean on `users` table (chosen)

As described above. Lowest complexity, sufficient for current scope.

### B. Roles table (`users_roles` with role enum)

Supports multi-tier roles (admin, moderator, etc.). Overhead is high for a feature that
currently needs only a binary flag. Can be migrated to later if needed.

### C. WorkOS Organizations roles

WorkOS supports role assignments in Organizations. This would avoid a custom `users` table
for auth metadata, but couples the app's authorization model to WorkOS semantics, makes
local testing harder (real WorkOS org required), and adds latency (WorkOS API call per
check vs. local DB row).

### D. `isAdmin` on the existing per-user tables (characters/gameSaves)

Avoids a new table but mixes auth concerns with game data. Rejected: wrong abstraction layer.
