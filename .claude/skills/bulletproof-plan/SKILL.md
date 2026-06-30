---
name: bulletproof-plan
description: Produces a bulletproof implementation plan for a GitHub issue by collaborating with three specialist subagents — senior engineer, game/application architect, and technical writer — in parallel, validating every claim against CLAUDE.md, CONTEXT.md (when it exists), and the ADRs, then presenting the plan in plan mode for approval before any code is written. Every plan carries the full standard SDLC envelope (branch → implement → test → commit → review + self-review → fix → commit → PR → retrospective) so it lands a PR for sign-off. Use when the user wants to plan or spec out a GitHub issue, runs /bulletproof-plan with an issue number or URL, or asks for a rigorous multi-specialist implementation plan.
---

# Bulletproof Plan

Turn a GitHub issue into a battle-tested implementation plan: three specialists analyze it in parallel, you reconcile and red-team their findings, then present the plan for approval before writing a line of code.

This whole skill is read-only research, so run it in **plan mode**. If you're not already in plan mode when invoked, enter it (`EnterPlanMode`) at the start — every phase here is plan-mode-safe.

## Invocation

`/bulletproof-plan <issue-number-or-url>` — e.g. `/bulletproof-plan 8`.
No argument? Ask which issue (or whether to plan the current conversation's context instead).

## Workflow

### Phase 0 — Ground yourself

1. Read the issue: `gh issue view <number> --comments` (see `docs/agents/issue-tracker.md`). Capture title, body, and comments.
2. **Map the scope boundary against sibling issues.** Plans over-reach by silently absorbing work that belongs to other issues. Build an explicit out-of-scope list before briefing specialists:
   - `gh issue list --state open --limit 100` — skim every open title for adjacent work.
   - Pull every issue the target references (`blocks #X`, `blocked by #X`, `see #X`, `part of #X`, `epic #X`) and every issue sharing a label or milestone: `gh issue view <n> --json title,body,labels,milestone,number`.
   - For each adjacent open issue that touches the same files, domain term, or feature surface, record a one-line **"#NN — owns: <thing>"** entry. These are off-limits — the plan must stop at the seams between them.
   - If the target issue is silent on a capability that an adjacent issue clearly owns, that capability is **out of scope** here, even when bundling would be convenient. Record it as a dependency or follow-up instead.
   - If the issue's own scope is ambiguous, ask the user "Does this include X?" before continuing — narrow the slice to exactly what _this_ issue owns.
3. Read the grounding docs so your specialist briefs are precise:
   - `CLAUDE.md` — the project's standing guidance. Load-bearing for planning: **always verify your work** (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` are the minimum bar for "done"), **write tests proactively** (every new module/system/behavior change MUST have tests, matching `src/game/__tests__/{ecs,engine,systems,cats,integration}/`), **never disable a rule to make a check pass**, **RTFM** (check official/library docs while planning), and **delight the user**.
   - `CONTEXT.md` — the binding glossary, **if it exists**. Per `docs/agents/domain.md`, if it (or `CONTEXT-MAP.md`) is absent, **proceed silently** — don't flag the absence or propose creating it upfront. When present, note which domain terms the issue touches and use them verbatim.
   - `docs/adr/` — skim titles and pull any ADRs in the issue's area, **if any exist** (the directory may be empty). Proceed silently when there are none.
4. Locate the code the issue touches (Glob/Grep) so briefs can cite real `file:line` anchors. For game work this is usually under `src/game/` (ECS, engine, systems, cats); for app-shell/auth/db work it's the Next.js routes, server code, and Drizzle schema.

### Phase 1 — Parallel specialist analysis

Spawn **all three subagents in one message** for true parallelism. Each starts fresh with zero context, so every brief MUST be self-contained: paste the issue text inline, list the exact doc paths to read, name the files to inspect, **and paste the Phase 0 out-of-scope list verbatim with the directive: "Do not propose work that belongs to any of these sibling issues — call the seam out as a dependency instead."**

| Role                  | `subagent_type`                                                                                                                          | Lens                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Senior engineer       | `general-purpose` (swap to `Frontend Developer` for canvas/Three.js/UI issues, `Game Designer` for mechanics/systems issues)            | Implementation path, edge cases, failure modes, and **test strategy**: which existing tests cover the area, what new `__tests__/{ecs,engine,systems,cats,integration}` tests to add, which helpers (`entityFactories`, `mockInputManager`, `mockSceneManager`, `mockMapManager`) and the `window.__catHerderDebug` `tick(n)` bridge to use for deterministic verification. |
| Game/app architect    | `Software Architect`                                                                                                                     | System fit: where logic belongs in the ECS (entity vs component vs system vs cat behavior), engine tick/update ordering, cross-system interactions (e.g. swimming + oxygen); for app-shell work, Next.js route/server/Drizzle and WorkOS auth boundaries. Pattern choices, trade-offs, ADR alignment.       |
| Technical writer      | `Technical Writer`                                                                                                                       | Terminology vs the `CONTEXT.md` glossary (when it exists), naming, which docs/ADRs must change, user-facing clarity.                                                                              |

Direct each specialist to **challenge assumptions** and return: findings, assumptions questioned, doc/ADR validations (conflicts called out), risks, and their recommended slice with `file:line` pointers.

### Phase 2 — Synthesize and red-team

1. Reconcile the three into one plan; where they disagree, decide and say why.
2. **Flag ADR conflicts explicitly**, in the `docs/agents/domain.md` format: _"Contradicts ADR-XXXX (title) — but worth reopening because…"_ Never silently override an ADR.
3. Use the glossary's exact words when `CONTEXT.md` exists. A concept the glossary lacks (or the absence of a glossary altogether) is a signal — note it for `/domain-modeling`.
4. Red-team your own plan: name the single weakest assumption, the riskiest step, and what would make this fail — then resolve each. If specialists conflicted on something load-bearing, spawn one focused critique subagent rather than hand-wave.
5. **Scope-creep check.** Walk the ordered steps and ask of each: "does this belong to any sibling issue on the Phase 0 out-of-scope list?" If yes, cut it from the plan and record it as a dependency on that issue. If a step _touches_ a sibling's surface but is genuinely required here, state the seam explicitly: what this plan changes vs. what the sibling will change.

### Phase 3 — Present to build

Write the finalized plan to the plan file, then call `ExitPlanMode` to gate on approval before implementing (it reads the plan from the file — no plan content is passed as an argument). Pre-declare the build commands you'll need as `allowedPrompts` (e.g. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm db:migrate` if the slice touches the schema) to cut prompts later.

Structure the plan: **goal · the vertical slice · ordered steps (each naming its files) · risks + mitigations · assumptions & open questions · docs to update.**

**Every plan ships the full SDLC, not just the implementation.** Unless the user explicitly says otherwise, the ordered steps MUST open with branch creation and close with the review → fix → PR → retrospective envelope, so that running this skill against an issue produces everything needed to land a PR the user signs off on. Wrap the issue-specific work in this scaffold:

1. **First step — create the feature branch.** Branch off `main` before any code is written (e.g. `git checkout main && git pull && git checkout -b <type>/<issue-#>-<slug>`). Never implement on `main`.
2. _(…the issue-specific ordered steps go here — each naming its files, and each landing with its tests, per CLAUDE.md "write tests proactively"…)_
3. **When acceptance criteria are met — run the checks, commit, and kick off review.** All work must pass `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` (CLAUDE.md's bar for "done"), plus any feature-specific tests — never disable a rule to make a check pass. Commit the work, push the branch, then run `/code-review` for an automated review of the diff. For a deeper pass on larger changes, note that the user can trigger `/code-review ultra` (multi-agent cloud review) — you can't launch it yourself.
4. **Self-review in parallel.** Don't block on the automated review — run your own review concurrently, looking for the things `/code-review` won't: scope creep vs. Phase 0, missing tests, terminology drift from the glossary, and CLAUDE.md violations.
5. **After review — apply fixes.** Triage the review findings and apply them with `/code-review --fix` (or `/simplify` for clarity-only cleanups), with per-change judgment. Re-run the four checks after fixing.
6. **After fixes — commit, push, and open the PR.** Commit the fixes, push, and open the pull request for the user's final sign-off.
7. **After the PR — run a retrospective and improve the process.** Before declaring done, look back over the whole run and answer, in writing: **What was missed?** (scope gaps, late discoveries) · **What bugs had to be solved?** (and what earlier check would have caught them) · **Which assumptions turned out invalid?** (where the plan diverged from reality) · **What would make the SDLC better going forward?** Then _act on at least one finding_ — don't just record it: open a follow-up issue, seed/amend `CONTEXT.md` or an ADR, tighten this skill or a sibling skill, or add a missing test/check. A retrospective that changes nothing is a missed step.

State these as real, numbered steps in the plan (not a footnote), so the implementing agent treats branch/tests/commit/review/fix/PR/retrospective as first-class deliverables.

## Quality bar

- **Plan ends in a PR, then a retrospective.** The ordered steps open with feature-branch creation and close with the test → commit → review → fix → commit → PR → retrospective envelope. Running this skill against an issue should produce everything needed to land a PR for the user's sign-off, with no manual scaffolding left implicit.
- **Every run feeds the next.** The plan's final step is reflective: what was missed, what bugs were caught, which assumptions broke, and what would make the SDLC better — and it commits to at least one concrete improvement (issue, doc/ADR edit, skill tweak, or new check). Process improvement is a deliverable, not an afterthought.
- **Tests are part of the slice, not after it.** Per CLAUDE.md, every new module, system, or behavior change ships with tests in the matching `src/game/__tests__/` directory, written alongside the code — and verified to catch a real bug (break the code, confirm the test fails, fix). Reviews run concurrently: self-review never blocks on the automated `/code-review`.
- **All work passes the four checks.** `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` are green (plus any feature tests) unless the user explicitly overrides — and a rule is never disabled to make a check pass.
- **Plan scope is explicitly bounded.** Related work in other issues is called out by name; if overlap exists, the plan states what it excludes and why.
- **Logic lives in the right ECS seam.** The plan places behavior deliberately (entity vs component vs system vs cat), respects engine tick/update ordering, and aligns with any ADR in `docs/adr/`.
- Honors `CLAUDE.md` — especially proactive testing, RTFM while planning, delight, and never disabling a lint/test rule to make it pass.
- Treats imported/user-authored content (e.g. map data from the map editor) as untrusted.

## Handoffs

- Too big for one issue → `/to-issues` to split into tracer-bullet slices (per the seams found in Phase 0).
- Want to stress-test the plan interactively first → `/grill-with-docs`.
- Terminology gaps, or no `CONTEXT.md`/ADRs yet → `/domain-modeling` to resolve the term or decision lazily, as `docs/agents/domain.md` prescribes.
- Async/AFK handoff → offer to post the plan via `gh issue comment` and apply `ready-for-agent` (see `docs/agents/triage-labels.md`).
