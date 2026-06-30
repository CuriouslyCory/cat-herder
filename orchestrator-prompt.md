Effort: Map editor + DB-backed map library (GitHub Issues CuriouslyCory/cat-herder #12 to #17).

| Item | Slice | Tracker key | Blocked by |
| --- | --- | --- | --- |
| #12 | Prefactor: shared cell↔world coordinate helpers | #12 | none |
| #13 | Admin role foundation (`users.isAdmin` + `adminProcedure`) | #13 | none |
| #14 | Canonical `terrain[][]` format + map-driven spawning | #14 | #12 |
| #15 | Cell-aware map editor (fixes alignment) | #15 | #12, #14 |
| #16 | DB map library + default-map-at-boot | #16 | #14, #13 |
| #17 | Editor DB persistence UI | #17 | #15, #16 |

You are the **orchestrator**. Drive all items below to completion autonomously, fanning out Sonnet specialist agents to do the implementation. Preserve your own context window: delegate implementation, keep plans and run state in files on disk rather than in context, and read those files back when you need them.

## Configuration

- Base branch: `main`
- Integration branch: `feat/map-library`
- PR model: `single`
- Per-item planning: the `/bulletproof-plan` skill (one issue per invocation)

## Branching and worktree model

There is exactly one long-lived integration branch for this effort.

1. Create the integration branch from the latest base:
   ```
   git switch main && git pull
   git switch -c feat/map-library
   git push -u origin feat/map-library
   ```
2. Implement every item in its own git worktree on its own branch, branched from the current tip of the integration branch. Separate worktrees are what let parallel items proceed without sharing a working tree:
   ```
   git worktree add ../wt-<item> -b feat/<item-slug> feat/map-library
   ```
3. Branch each wave's worktrees from the integration tip only after the previous wave has merged, so dependent items inherit their dependencies' code with nothing to reconcile.

## Waves

Run items wave by wave. Within a wave, run items in parallel. Merge a wave fully (and re-verify integration) before branching the next wave.

### Wave 1 (parallel): branch from the integration tip (fresh from `main`)
- #12 Prefactor: shared cell↔world coordinate helpers. Depends on: none. Slug `12-coord-helpers`.
- #13 Admin role foundation (`users.isAdmin` + `adminProcedure`). Depends on: none. Slug `13-admin-role`.
- Shared-surface check: clean. Coordinate math (#12) vs auth/tRPC procedures (#13) do not overlap.

### Wave 2 (sequential): branch from the post-Wave-1 integration tip
- #14 Canonical `terrain[][]` format + map-driven spawning. Depends on: #12. Slug `14-terrain-format`. Inherits the coordinate helpers from #12.

### Wave 3 (parallel): branch from the post-Wave-2 integration tip
- #15 Cell-aware map editor (fixes alignment). Depends on: #12, #14. Slug `15-map-editor`.
- #16 DB map library + default-map-at-boot. Depends on: #14, #13. Slug `16-db-map-library`.
- Shared-surface check: POTENTIAL OVERLAP, confirm before parallelizing. Both consume #14's `terrain[][]` format and may touch shared map state / terrain initialization. #15 edits editor UI/rendering; #16 edits DB schema + boot-time map loading. If either touches a shared map-loading or terrain (de)serialization module (e.g. a common `MapManager` or spawn logic), they can collide. Separate worktrees contain the conflict until merge; if you find a shared file, split this wave: merge #16 first, then branch #15 from the new tip.

### Wave 4 (sequential): branch from the post-Wave-3 integration tip
- #17 Editor DB persistence UI. Depends on: #15, #16. Slug `17-editor-persistence`. Inherits both the editor (#15) and the DB map library (#16).

## Per-item loop

For each item, in wave order:

1. **Plan.** Run `/bulletproof-plan` against the item to produce an implementation plan. Save it to `plans/<item>.md` rather than holding it in context. The plan must include explicit review and verification steps.
2. **Execute.** Fan out one or more Sonnet specialist agents inside that item's worktree to implement the plan. Give each agent only the scope it needs: the item, its plan file, and the relevant paths.
3. **Review and fix.** Follow the review process defined in the plan. Apply any fixes it surfaces.
4. **Verification gate (must pass before merge).** In the item's worktree, all four project gates must be green: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` (the project's minimum bar for "done" per CLAUDE.md), plus the item's acceptance criteria met. Honor any item-specific budget or guard noted in the plan. New behavior must ship with tests (CLAUDE.md requires it).
5. **Decision/ADR checkpoint.** For items carrying a decision flag, record the chosen decision in the worktree (file/commit, e.g. a `docs/adr/` entry) before merging, and list it for sign-off at PR review. Tracked decisions: #13 admin-role model, #14 canonical `terrain[][]` format. See the Decisions table in STATE.md.
6. **Commit hygiene.** Conventional commits that reference the item, e.g. `feat(<area>): <change> (#<id>)`.
7. **Record progress** to `STATE.md` (status, branch, merged yes/no) so the run is resumable if interrupted.

## Merge to integration (single-PR model)

When an item passes its verification gate, merge locally and re-verify:
```
git switch feat/map-library && git pull
git merge --no-ff feat/<item-slug>
# run pnpm test + lint + typecheck + build on integration; fix any merge fallout before continuing
git push
git worktree remove ../wt-<item>
```
Open no PR until every item has merged into integration.

## Finalization (once all items have merged)

1. Run the full `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` suite one final time on `feat/map-library`.
2. Open one PR: `feat/map-library` into `main`. In the body, include `Closes #12`, `Closes #13`, `Closes #14`, `Closes #15`, `Closes #16`, and `Closes #17` so they auto-close on merge, and summarize every decision/ADR for reviewer confirmation.
3. Remove any remaining worktrees and delete merged item branches.
4. Do not merge the final PR yourself; leave it for human review.

## Guardrails

- One item per worktree; never run two agents against the same working tree.
- Re-verify integration after every merge, not just at the end, so conflicts surface early against a known-green baseline.
- If a verification gate fails and an agent cannot resolve it after a reasonable attempt, stop and report rather than merging broken work.
- Keep `plans/` files and `STATE.md` current; treat them as the source of truth so you can resume after a restart.
- Never disable a lint rule or test to make a gate pass (CLAUDE.md). Fix in the spirit of the rule.
- Mark unknowns explicitly; do not invent keys, dependencies, or decisions.
