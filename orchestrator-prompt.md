Effort: Architecture deepening (GitHub Issues CuriouslyCory/cat-herder #25 to #29, from the 2026-07-02 architecture review: entity prefabs, cat lifecycle ownership, MapEditor split, save-codec).

| Item | Slice | Tracker key | Blocked by |
| --- | --- | --- | --- |
| #25 | Entity prefabs: one spawn recipe shared by production and tests | #25 | none |
| #26 | Give the Cat Companion a single lifecycle owner | #26 | #25 |
| #27 | Extract the map persistence controller from MapEditor | #27 | none |
| #28 | Save-codec: one owner for the save-data shape | #28 | none |
| #29 | Extract a DOM-free map-mutation core from MapEditor | #29 | #27 |

You are the **orchestrator**. Drive all items below to completion autonomously, fanning out Sonnet specialist agents to do the implementation. Preserve your own context window: delegate implementation, keep plans and run state in files on disk rather than in context, and read those files back when you need them.

## Configuration

- Base branch: `main`
- Integration branch: `feat/architecture-deepening`
- PR model: `single`
- Per-item planning: a dedicated planning agent per item (see Per-item loop step 1). Note: the `/bulletproof-plan` skill is interactive (plan-mode approval) and unsuitable for an autonomous run; the planning agent applies the same rigor instead. This mirrors what worked in the previous orchestration run (#12 to #17).

## Branching and worktree model

There is exactly one long-lived integration branch for this effort.

1. Create the integration branch from the latest base:
   ```
   git switch main && git pull
   git switch -c feat/architecture-deepening
   git push -u origin feat/architecture-deepening
   ```
2. Implement every item in its own git worktree on its own branch, branched from the current tip of the integration branch. Separate worktrees are what let parallel items proceed without sharing a working tree:
   ```
   git worktree add ../wt-<item> -b feat/<item-slug> feat/architecture-deepening
   ```
3. **Worktree setup (this repo, non-negotiable):** each new worktree needs a real `pnpm install` run inside it (do not symlink `node_modules`) and a copy of `.env` from the main checkout, or the build panics.
4. Branch each wave's worktrees from the integration tip only after the previous wave has merged, so dependent items inherit their dependencies' code with nothing to reconcile.

## Waves

Run items wave by wave. Within a wave, run items in parallel. Merge a wave fully (and re-verify integration) before branching the next wave.

### Wave 1 (parallel): branch from the initial `feat/architecture-deepening` tip

- #25 Entity prefabs: one spawn recipe shared by production and tests. Depends on: none. Shared-surface note: #25 and #28 both assert save-restore behavior and may both touch the load-restore integration test; keep those edits additive and expect a small merge reconciliation.
- #27 Extract the map persistence controller from MapEditor. Depends on: none.
- #28 Save-codec: one owner for the save-data shape. Depends on: none. Shared-surface note: see #25 above.

### Wave 2 (parallel): branch from the post-Wave-1 integration tip

- #26 Give the Cat Companion a single lifecycle owner. Depends on: #25 (cat assembly lives in the prefab module by then).
- #29 Extract a DOM-free map-mutation core from MapEditor. Depends on: #27 (sequenced so two refactors never edit the MapEditor monolith concurrently).

## Per-item loop

For each item, in wave order:

1. **Plan.** Dispatch a planning agent for the item: it must read the issue (`gh issue view <n> --comments`), validate the approach against CLAUDE.md, `docs/adr/` (especially ADR-0002 for #25 and #29), and the existing tests, and write an implementation plan with explicit review and verification steps to `plans/<item>.md`. Do not hold the plan in context.
2. **Execute.** Fan out one or more Sonnet specialist agents inside that item's worktree to implement the plan. Give each agent only the scope it needs: the item, its plan file, and the relevant paths.
3. **Review and fix.** Follow the review process defined in the plan. Apply any fixes it surfaces.
4. **Verification gate (must pass before merge).** In the item's worktree: `pnpm build` green, `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test` all passing, and the item's acceptance criteria met. Honor any item-specific budget or guard noted in the plan.
5. **Decision/ADR checkpoint.** For items carrying a decision flag (see the Decisions table in STATE.md: ADR-0002 compliance for #25 and #29, external save-shape byte-compatibility for #28), record how the constraint was honored in the worktree (file/commit) before merging, and list it for sign-off at PR review.
6. **Commit hygiene.** Conventional commits that reference the item, e.g. `refactor(entities): extract spawn prefabs (#25)`.
7. **Record progress** to `STATE.md` (status, branch, merged yes/no) so the run is resumable if interrupted.

## Merge to integration (single-PR model)

When an item passes its verification gate, merge locally and re-verify:
```
git switch feat/architecture-deepening && git pull
git merge --no-ff feat/<item-slug>
# run pnpm build + lint + typecheck + test on integration; fix any merge fallout before continuing
git push
git worktree remove ../wt-<item>
```
Open no PR until every item has merged into integration.

## Finalization (once all items have merged)

1. Run the full `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` suite one final time on `feat/architecture-deepening`.
2. Open one PR: `feat/architecture-deepening` into `main`. In the body, include `Closes #25`, `Closes #26`, `Closes #27`, `Closes #28`, `Closes #29` so they auto-close on merge, and summarize every decision/ADR constraint for reviewer confirmation.
3. Remove any remaining worktrees and delete merged item branches.
4. Do not merge the final PR yourself; leave it for human review.

## Guardrails

- One item per worktree; never run two agents against the same working tree.
- Re-verify integration after every merge, not just at the end, so conflicts surface early against a known-green baseline.
- If a verification gate fails and an agent cannot resolve it after a reasonable attempt, stop and report rather than merging broken work.
- Keep `plans/` files and `STATE.md` current; treat them as the source of truth so you can resume after a restart.
- Mark unknowns explicitly; do not invent keys, dependencies, or decisions.
- These are behavior-preserving refactors: no item may change game behavior, the external save-data shape, or the `node_${x}_${z}` cooldown-id convention. If a plan proposes a behavior change, stop and surface it instead of merging it.
