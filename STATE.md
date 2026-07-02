# Orchestration State: feat/architecture-deepening

Source of truth for this run. Update after every state change (plan saved, agent dispatched, gate passed, branch merged). If the run is interrupted, read this file first to resume.

- Integration branch: `feat/architecture-deepening`
- Base branch / final PR target: `main`
- PR model: `single`
- Tracking context: GitHub Issues CuriouslyCory/cat-herder #25, #26, #27, #28, #29 (architecture deepening, from the 2026-07-02 architecture review)
- Last updated: 2026-07-02 (Wave 1 execution: agents dispatched, worktrees ready) by orchestration-builder

## Status legend

- `not-started` no worktree yet
- `planning` running the per-item planning step
- `planned` plan file written, ready for agents
- `in-progress` specialist agents executing
- `review` review steps running
- `fixing` applying review fixes
- `verified` build, lint, typecheck, tests, and acceptance criteria all green in the worktree
- `merged` merged into integration and integration re-verified
- `blocked` waiting on a dependency or a failed gate (see Notes)

## Wave 1 (parallel): branch from the initial `feat/architecture-deepening` tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #25 | `feat/25-entity-prefabs` | `../wt-25` | #25 | none | `plans/25.md` | merged | yes |
| #27 | `feat/27-map-persistence-controller` | `../wt-27` | #27 | none | `plans/27.md` | merged | yes |
| #28 | `feat/28-save-codec` | `../wt-28` | #28 | none | `plans/28.md` | merged | yes |

Wave 1 shared-surface flag: #25 and #28 may both touch the load-restore integration test (both assert save-restore behavior). Keep edits additive; reconcile at merge.

## Wave 2 (parallel): branch from the post-Wave-1 integration tip

| Item | Slug / branch | Worktree | Tracker key | Depends on | Plan file | Status | Merged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #26 | `feat/26-cat-lifecycle` | `../wt-26` | #26 | #25 | `plans/26.md` | merged | yes |
| #29 | `feat/29-map-mutation-core` | `../wt-29` | #29 | #27 | `plans/29.md` | merged | yes |

Wave 2 shared-surface check: clean. Cat systems (#26) and maps (#29) do not overlap.

## Verification gates

Record pass/fail and date when each item clears its gate in-worktree, before merge.

| Item | Build | Lint | Typecheck | Tests | Acceptance criteria | Item-specific check |
| --- | --- | --- | --- | --- | --- | --- |
| #25 | | | | | | MovementSystem runs over a prefab-built player (would catch Velocity drift); `node_${x}_${z}` ids preserved; no parallel recipes left in test helpers |
| #26 | | | | | | Lifecycle unit test passes without wiring 4 systems; Curiosity fade-before-despawn integration test green; save restore of active cats unchanged |
| #27 | | | | | | Controller unit tests run with only a fake tRPC adapter, no jsdom; delete guards (default map, last map) behave as before |
| #28 | | | | | | Round-trip decode(encode(state)) test; existing save fixtures load unchanged; position vs non-position dirty throttling identical |
| #29 | | | | | | Core module has no DOM/Three.js imports; core tests run without jsdom; MapData round-trip validates against schema; jsdom test surface shrinks |

## Integration re-verification log

After each merge, re-run build, lint, typecheck, and tests on the integration branch and log the result.

| Date | After merging | Build | Lint | Typecheck | Tests | Conflicts resolved | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-02 | #28 | pass | pass | pass | 898 pass | none | ADR-0003; byte-compat proven |
| 2026-07-02 | #27 | pass | pass | pass | 921 pass | none | controller testable without jsdom |
| 2026-07-02 | #25 | pass | pass | pass | 931 pass | none | node id centralized; MovementSystem drift test added |
| 2026-07-02 | #29 | pass | pass | pass | 942 pass | none | DOM-free core; row=Z/col=X orientation-lock test; moveCell edge case preserved |
| 2026-07-02 | #26 | pass | pass | pass | 947 pass | none (load-restore edits additive) | exact-tick despawn preserved (held+holdless); ADR-0004; CatAISystem folded into lifecycle owner |

## Decisions / ADRs to confirm

| Decision | Item | Recorded | Confirmed at PR review |
| --- | --- | --- | --- |
| ADR-0002 compliance: prefab spawning stays MapData-driven; `node_${x}_${z}` cooldown-id convention preserved for save compat | #25 | yes — `resourceNodeId()` in `src/game/ecs/prefabs.ts` is sole owner of template; grep-confirmed; commit 9347791 | no |
| Behavior preservation: per-cat systems become effects; no gameplay change to zoomies/curiosity/pounce; active-cat save restore (including yarn accounting) unchanged | #26 | yes — exact-tick despawn test (held+holdless), ADR-0004 two-phase driver; break-it-to-verify confirmed hold-guard; commit ca35791 | no |
| Behavior preservation: editor save/load/list/set-default/delete flows unchanged after extraction | #27 | yes — exact message strings + delete guards preserved in `MapPersistenceController`; commit f74e92f | no |
| External save-data shape stays byte-compatible; existing saves load without migration | #28 | yes — ADR-0003 + `SaveCodec.test.ts` byte-compat (JSON.stringify key-order) assertions; commit 470d711 | no |
| ADR-0002 compliance: core operates on canonical `terrain[][]` (row=Z, col=X); serialized output validates against MapData schema | #29 | yes — `MapMutationCore` has zero DOM/Three.js imports; orientation-lock + mapDataSchema round-trip tests; commit a843a1f | no |

## Finalization checklist

- [ ] All items show `merged`
- [ ] Final full build, lint, typecheck, and test suite green on `feat/architecture-deepening`
- [ ] PR opened into `main` per the single-PR model
- [ ] PR body includes `Closes #25` `Closes #26` `Closes #27` `Closes #28` `Closes #29`
- [ ] PR body summarizes every decision/ADR for sign-off
- [ ] All worktrees removed; merged item branches deleted
- [ ] Final PR left for human review (orchestrator does not self-merge)

## Notes and blockers

Use this space for anything that affected the run: a failed gate and how it was resolved, a conflict during integration, a decision rationale, or a reason an item is `blocked`.

- Previous run's files (Map Editor & Library, #12 to #17, all merged via PR #19) were replaced by this run; history is in git. Old plan files remain at `plans/12.md` to `plans/17.md`.
- Planning method carried over from the previous run: `/bulletproof-plan` is interactive (plan-mode approval) and unsuitable for autonomous orchestration; use a dedicated planning agent with equivalent rigor per item.
