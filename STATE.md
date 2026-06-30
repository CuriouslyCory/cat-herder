# Orchestration State: Map Editor & Library (#12–#17)

**Last updated**: 2026-06-29 (session start)  
**Current wave**: 1 (Wave 1 setup in progress)  
**Merge count**: 0 items complete

## Wave 1: Parallel setup

- **#12** `feat/12-coord-helpers` — Prefactor: shared cell↔world coordinate helpers
  - Status: 🟡 Planning
  - Branch: (pending)
  - Merged: no
  
- **#13** `feat/13-admin-role` — Admin role foundation (`users.isAdmin` + `adminProcedure`)
  - Status: 🟡 Planning
  - Branch: (pending)
  - Merged: no

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
| #13  | Admin-role model (isAdmin, adminProcedure) | ⏳ TBD | plans/13.md |
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
