# Orchestration State: Map Editor & Library (#12–#17)

**Last updated**: 2026-06-30 (ALL WAVES COMPLETE — finalizing PR)  
**Current wave**: DONE (all 4 waves fully merged)  
**Merge count**: 6/6 items merged (#12, #13, #14, #16, #15, #17)

### Integration re-verify log
| After merge | test | lint | typecheck | build |
| --- | --- | --- | --- | --- |
| #12 | ✅ 742 | ✅ | ✅ | ✅ |
| #13 | ✅ 750 | ✅ | ✅ | ✅ |
| #14 | ✅ 782 | ✅ | ✅ | ✅ |
| #16 | ✅ 800 | ✅ | ✅ | ✅ |
| #15 | ✅ 811 | ✅ | ✅ | ✅ |
| #17 | ✅ 816 | ✅ | ✅ | ✅ |

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
  - Status: ✅ Merged (commit ecccf2e; +616/-267; 33 new tests; 15 cooldown ids cross-verified byte-identical; ADR 0002)
  - Dependencies: #12 ✅
  - Branch: `feat/14-terrain-format`
  - Merged: YES → feat/map-library

## Wave 3: Parallel (conditional on shared-surface check)

- **#15** `feat/15-map-editor` — Cell-aware map editor (fixes alignment)
  - Status: ✅ Merged (commit f6d0855; MapEditor.ts + tests only; 793→811 integration; editor absent from prod bundle)
  - Dependencies: #12 ✅, #14 ✅
  - Branch: `feat/15-map-editor`
  - Merged: YES → feat/map-library
  
- **#16** `feat/16-db-map-library` — DB map library + default-map-at-boot
  - Status: ✅ Merged (commit 4637049 + index fix; +790; 18 router tests; gates green)
  - Dependencies: #14 ✅, #13 ✅
  - Branch: `feat/16-db-map-library`
  - Merged: YES → feat/map-library
  - DB: `cat-herder_map` table pushed; partial unique index `map_single_default_idx` applied AFTER fixing predicate `is_default`→`"isDefault"` (orchestrator fix commit). Invariant verified live (2nd default → 23505). Table empty → getDefaultMap seeds TestMap on first boot.

**Wave 3 shared-surface check**: ✅ RESOLVED → PARALLEL. File sets are disjoint:
- #15: `src/game/maps/MapEditor.ts` + `src/game/__tests__/engine/MapEditor.test.ts` (and possibly other existing editor tests using getEditorBlocks). Does NOT touch Game.ts/MapManager/play/loaders/server.
- #16: `schema.ts`, `root.ts`, `play/page.tsx`, `GameLoader.tsx`, `GameCanvas.tsx`, `Game.ts` (`_boot`+`GameOpts`), new `routers/map.ts` + `__tests__/api/map-router.test.ts`. Does NOT touch MapEditor.ts.
- MapManager.ts untouched by both. New tests in different dirs (engine/ vs api/). No conflict expected at merge.

## Wave 4: Sequential

- **#17** `feat/17-editor-persistence` — Editor DB persistence UI
  - Status: ✅ Merged (commit d2a48f4; adapter + DB panel; JSON path removed; admin-gated; 816 tests; editor absent from prod bundle)
  - Dependencies: #15 ✅, #16 ✅
  - Branch: `feat/17-editor-persistence`
  - Merged: YES → feat/map-library

## Decisions (ADR tracking)

| Item | Decision | Status | Reference |
|------|----------|--------|-----------|
| #13  | Admin-role model (isAdmin, adminProcedure) | ✅ Recorded | docs/adr/0001-admin-role-model.md |
| #14  | Canonical `terrain[][]` format spec | ✅ Recorded | docs/adr/0002-canonical-terrain-format.md |

## Integration branch

- Base: `main`
- Integration: `feat/map-library`
- Status: 🟡 Setting up

## Notes

- Worktrees created on-demand per item, branched from integration tip
- Plans stored in `plans/<item>.md`
- Merge model: local merge to integration, no PR until all items merged
- Verification gates: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` + acceptance criteria per item
