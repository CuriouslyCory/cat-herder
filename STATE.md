# Orchestration State: feat/map-library

Source of truth for this run. Update after every state change (plan saved, agent dispatched, gate passed, branch merged). If the run is interrupted, read this file first to resume.

- Integration branch: `feat/map-library`
- Base branch / final PR target: `main`
- PR model: `single`
- Tracking context: GitHub Issues CuriouslyCory/cat-herder #12 to #17
- Last updated: 2026-06-29 by orchestration builder

## Status legend

- `not-started` no worktree yet
- `planning` running the per-item planning step
- `planned` plan file written, ready for agents
- `in-progress` specialist agents executing
- `review` review steps running
- `fixing` applying review fixes
- `verified` build, lint, tests, and acceptance criteria all green in the worktree
- `merged` merged into integration and integration re-verified
- `blocked` waiting on a dependency or a failed gate (see Notes)

## Wave 1 (parallel): branch from the integration tip (fresh from main)

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #12 | `feat/12-coord-helpers` | `../wt-12` | #12 | none | `plans/12.md` | not-started | no |
| #13 | `feat/13-admin-role` | `../wt-13` | #13 | none | `plans/13.md` | not-started | no |

## Wave 2 (sequential): branch from the post-Wave-1 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #14 | `feat/14-terrain-format` | `../wt-14` | #14 | #12 | `plans/14.md` | not-started | no |

## Wave 3 (parallel): branch from the post-Wave-2 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #15 | `feat/15-map-editor` | `../wt-15` | #15 | #12, #14 | `plans/15.md` | not-started | no |
| #16 | `feat/16-db-map-library` | `../wt-16` | #16 | #14, #13 | `plans/16.md` | not-started | no |

## Wave 4 (sequential): branch from the post-Wave-3 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #17 | `feat/17-editor-persistence` | `../wt-17` | #17 | #15, #16 | `plans/17.md` | not-started | no |

## Verification gates

Record pass/fail and date when each item clears its gate in-worktree, before merge. Gate = `pnpm test` + `pnpm lint` + `pnpm typecheck` + `pnpm build` all green, plus acceptance criteria.

| Item | Test | Lint | Typecheck | Build | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| #12 | — | — | — | — | — |
| #13 | — | — | — | — | — |
| #14 | — | — | — | — | — |
| #15 | — | — | — | — | — |
| #16 | — | — | — | — | — |
| #17 | — | — | — | — | — |

## Integration re-verification log

After each merge, re-run test, lint, typecheck, and build on the integration branch and log the result.

| Date | After merging | Test | Lint | Typecheck | Build | Conflicts resolved | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Decisions / ADRs to confirm

| Decision | Item | Recorded | Confirmed at PR review |
| --- | --- | --- | --- |
| Admin-role model (`users.isAdmin` flag + `adminProcedure` guard) | #13 | no | no |
| Canonical `terrain[][]` map format + map-driven spawning | #14 | no | no |

## Finalization checklist

- [ ] All items show `merged`
- [ ] Final full test, lint, typecheck, and build suite green on `feat/map-library`
- [ ] PR opened into `main` (single-PR model)
- [ ] PR body includes `Closes #12` through `Closes #17`
- [ ] PR body summarizes every decision/ADR for sign-off
- [ ] All worktrees removed; merged item branches deleted
- [ ] Final PR left for human review (orchestrator does not self-merge)

## Notes and blockers

- **Wave 3 shared surface (#15 + #16):** both consume #14's `terrain[][]` format and may touch shared map state / terrain initialization. Parallel execution is safe across separate worktrees, but if they edit the same map-loading / serialization module (e.g. a common `MapManager` or spawn logic), the conflict surfaces at merge. Mitigation: merge #16 first, re-verify integration, then either branch #15 from the new tip (if not yet started) or rebase the #15 worktree before its merge. Confirm shared-file overlap with the user before launching both in parallel.
- **Branch naming:** integration branch `feat/map-library` is intentionally distinct from item #16's branch `feat/16-db-map-library` (renamed from `map-library` to avoid confusion).
