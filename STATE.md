# Orchestration State: Map Editor & Library (#12–#17)

**Last updated**: 2026-06-29 (Wave 1 COMPLETE; Wave 2 next)  
**Current wave**: 2 (Wave 1 fully merged)  
**Merge count**: 2 items merged (#12, #13)

### Integration re-verify log
| After merge | test | lint | typecheck | build |
| --- | --- | --- | --- | --- |
| #12 | ✅ 742 | ✅ | ✅ | ✅ |
| #13 | ✅ 750 | ✅ | ✅ | ✅ |

### DB schema applied to dev Neon (db:push, project convention — no migrations dir)
- #13: `cat-herder_user` (userId PK, email, isAdmin, createdAt, updatedAt) — additive CREATE TABLE, verified present. Admin bootstrap (cory@curiouslycory.com) happens on first play-page load via upsertUser.

**Baseline (main @ 5533da0)**: ✅ test 724 pass · lint clean · typecheck clean · build OK. Integration branch `feat/map-library` exists & pushed (tip 473fdff = STATE tracker).

**Planning method note**: `/bulletproof-plan` is interactive (plan-mode approval) and unsuitable for this autonomous run; per-item planning is delegated to a dedicated planning agent that applies the same rigor (validate vs CLAUDE.md / docs / ADRs, explicit review + verification steps) and writes `plans/<item>.md`.

## Wave 1: Parallel setup

- **#12** `feat/12-coord-helpers` — Prefactor: shared cell↔world coordinate helpers
  - Status: ✅ Merged (commit 4ba636f; +198/-13; 18 new coords tests; gates green)
  - Branch: `feat/12-coord-helpers`
  - Merged: YES → feat/map-library
  
- **#13** `feat/13-admin-role` — Admin role foundation (`users.isAdmin` + `adminProcedure`)
  - Status: ✅ Merged (commit b6417c5; +370; 8 admin tests; gates green; users table pushed to DB)
  - Branch: `feat/13-admin-role`
  - Merged: YES → feat/map-library

**Wave 1 shared-surface check**: Clean. Coordinate math (#12) vs auth/tRPC (#13) do not overlap.

## Wave 2: Sequential

- **#14** `feat/14-terrain-format` — Canonical `terrain[][]` format + map-driven spawning
  - Status: ⏳ Blocked (waiting for Wave 1 merge)
  - Dependencies: #12
  - Branch: (pending)
  - Merged: no

## Wave 3: Parallel (conditional on shared-surface check)

- **#15** `feat/15-map-editor` — Cell-aware map editor (fixes alignment)
  - Status: ⏳ Blocked (waiting for Wave 2 merge)
  - Dependencies: #12, #14
  - Branch: (pending)
  - Merged: no
  
- **#16** `feat/16-db-map-library` — DB map library + default-map-at-boot
  - Status: ⏳ Blocked (waiting for Wave 2 merge)
  - Dependencies: #14, #13
  - Branch: (pending)
  - Merged: no

**Wave 3 shared-surface check**: ⚠️ FLAGGED. Both #15 and #16 consume #14's `terrain[][]` format. Possible collision: map state / terrain initialization. Will inspect after Wave 2; if conflict found, split wave (merge #16 first, then branch #15).

## Wave 4: Sequential

- **#17** `feat/17-editor-persistence` — Editor DB persistence UI
  - Status: ⏳ Blocked (waiting for Wave 3 merge)
  - Dependencies: #15, #16
  - Branch: (pending)
  - Merged: no

## Decisions (ADR tracking)

| Item | Decision | Status | Reference |
|------|----------|--------|-----------|
| #13  | Admin-role model (isAdmin, adminProcedure) | ✅ Recorded | docs/adr/0001-admin-role-model.md |
| #14  | Canonical `terrain[][]` format spec | ⏳ TBD | plans/14.md |

## Integration branch

- Base: `main`
- Integration: `feat/map-library`
- Status: 🟡 Setting up

## Notes

- Worktrees created on-demand per item, branched from integration tip
- Plans stored in `plans/<item>.md`
- Merge model: local merge to integration, no PR until all items merged
- Verification gates: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` + acceptance criteria per item
