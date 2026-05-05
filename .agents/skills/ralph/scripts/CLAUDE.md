# Ralph Agent Instructions

You are an autonomous coding agent working on a software project.

## Your Task

1. Read the PRD at `prd.json` (in the same directory as this file)
2. Read the progress log at `progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch. The PRD `branchName` field contains the feature branch name (e.g., `feat/my-feature`).
   - If the branch doesn't exist: create it from `main` (`git checkout main && git checkout -b <branchName>`)
   - If the branch exists: check it out and ensure it's up to date with main
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks (e.g., typecheck, lint, test - use whatever your project requires)
7. Update CLAUDE.md files if you discover reusable patterns (see below)
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD to set `passes: true` for the completed story
10. Append your progress to `progress.txt`
11. **STOP.** Check story states.
   - If ALL stories have `passes: true` -> reply with `<promise>COMPLETE</promise>`
   - If ANY stories have `passes: false` => output "Iteration  complete: [Story ID] done. X stories remaining." and END YOUR RESPONSE IMMEDIATELY. Do not continue. Do NOT pick the next story. Another itteration will handle it.

Note: Branch names use the `feat/` prefix (e.g., `feat/task-status`), not `ralph/`. This follows standard enterprise git flow where feature branches are PRed into `main`.

## Progress Report Format

APPEND to progress.txt (never replace, always append):

```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the evaluation panel is in component X")
---
```

The learnings section is critical - it helps future iterations avoid repeating mistakes and understand the codebase better.

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of progress.txt (create it if it doesn't exist). This section should consolidate the most important learnings:

```
## Codebase Patterns
- Example: Use `sql<number>` template for aggregations
- Example: Always use `IF NOT EXISTS` for migrations
- Example: Export types from actions.ts for UI components
```

Only add patterns that are **general and reusable**, not story-specific details.

## Update CLAUDE.md Files

Before committing, check if any edited files have learnings worth preserving in nearby CLAUDE.md files:

1. **Identify directories with edited files** - Look at which directories you modified
2. **Check for existing CLAUDE.md** - Look for CLAUDE.md in those directories or parent directories
3. **Add valuable learnings** - If you discovered something future developers/agents should know:
   - API patterns or conventions specific to that module
   - Gotchas or non-obvious requirements
   - Dependencies between files
   - Testing approaches for that area
   - Configuration or environment requirements

**Examples of good CLAUDE.md additions:**

- "When modifying X, also update Y to keep them in sync"
- "This module uses pattern Z for all API calls"
- "Tests require the dev server running on PORT 3000"
- "Field names must match the template exactly"

**Do NOT add:**

- Story-specific implementation details
- Temporary debugging notes
- Information already in progress.txt

Only update CLAUDE.md if you have **genuinely reusable knowledge** that would help future work in that directory.

## Quality Requirements

- ALL commits must pass your project's quality checks: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns

## Testing Requirements (MANDATORY)

Every story implementation MUST include tests. A story is NOT complete without them.

### How to write tests

1. **Check the PRD's `testingDirectives` section** — it describes which test patterns to use for that story type.
2. **Use existing test helpers** — never import Three.js or DOM in tests:
   - `src/game/__tests__/helpers/entityFactories.ts` — `spawnPlayer()`, `spawnCat()`, `spawnResourceNode()`, etc.
   - `src/game/__tests__/helpers/mockInputManager.ts` — stub with `pressAction()`, `holdAction()`, `setMovementIntent()`
   - `src/game/__tests__/helpers/mockSceneManager.ts` — stub with `setMeshOpacity()`, `createHandle()`
   - `src/game/__tests__/helpers/mockMapManager.ts` — stub with `getTerrainAt()`, `getHeightAt()`
3. **Place tests in the matching directory**: `src/game/__tests__/{ecs,engine,systems,cats,integration}/`
4. **Run `pnpm test` before committing** — if tests fail, fix the implementation, not the tests.

### What to test

- **New modules**: all public API methods, edge cases, error paths
- **State changes**: verify reactive callbacks fire, invalid inputs rejected
- **Systems**: create entities with required components, call `system.update(world, dt)`, assert state changes
- **Cross-system**: put in `integration/` — instantiate multiple real systems sharing a World
- **Config changes**: write regression tests proving the new value produces expected outcomes

### Anti-patterns (DO NOT)

- Do NOT mark a story as `passes: true` without `pnpm test` succeeding
- Do NOT write tests that require a browser, canvas, or Three.js — use the mock helpers
- Do NOT disable or skip tests to make CI green
- Do NOT write tests that test private implementation details — test behavior through public APIs

## Browser Testing (If Available)

For any story that changes UI, verify it works in the browser if you have browser testing tools configured (e.g., via MCP):

1. Navigate to the relevant page
2. Verify the UI changes work as expected
3. Take a screenshot if helpful for the progress log

If no browser tools are available, note in your progress report that manual browser verification is needed.

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.txt before starting
