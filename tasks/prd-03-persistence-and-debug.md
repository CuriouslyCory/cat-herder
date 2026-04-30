# PRD: Persistence & Debug Menu (Phase 3)

## Introduction

Add full game state persistence (save/load/auto-save) and a comprehensive debug menu so player progress survives sessions and developers can rapidly test and tune gameplay. This phase transforms the prototype from "fun to play once" to "a game you can return to" and gives the team tools to iterate on balance without code changes.

**Depends on:** PRD-01 (Engine Foundation) — `gameRouter` (`getCharacter` / `upsertCharacter` / `getSave` / `upsertSave` / `deleteSave`) and the `gameSaves` Drizzle table already exist; PRD-02 (Core Gameplay) — all gameplay state to save is in place.

## Goals

- Game state persists across sessions — close tab, reopen, pick up exactly where you left off.
- Auto-save runs silently every 30 seconds without gameplay interruption.
- Debug menu provides comprehensive developer controls for rapid iteration on feel and balance.
- Save format is versioned so future changes don't break existing saves.
- All persistence flows through tRPC `protectedProcedure` — the browser never opens a direct connection to Postgres, and `ctx.user.id` is the only authorization signal.

## User Stories

### US-201: GameState full implementation
**Description:** As a developer, I need a central state store that tracks all game data with change detection so UI updates reactively and serialization captures everything.

**Acceptance Criteria:**
- [ ] `src/game/state/GameState.ts` exposes `get<T>(path: string): T`, `set<T>(path: string, value: T)`, `onChange<T>(path: string, callback: (newVal: T, oldVal: T) => void): Unsubscribe`, `serialize(): SaveData`, `restore(data: SaveData)`.
- [ ] State shape:
  ```
  player: { appearance, position, stats.level, stats.health, stats.maxHealth, yarn, oxygen, abilities, inventory }
  world: { currentMapId, activeCats[], hiddenTerrain[], resourceNodes[] }
  session: { totalPlaytimeMs, isSwimming, isDiving }
  ```
- [ ] `set()` triggers registered `onChange()` callbacks for that path.
- [ ] `serialize()` excludes transient state (session data, debug overrides) and returns a JSON-safe object.
- [ ] `restore()` hydrates all state from a saved snapshot and triggers change callbacks.
- [ ] State validation: `set()` rejects invalid values (e.g., negative health, yarn below 0).
- [ ] `pnpm typecheck` passes.

---

### US-202: Save data format & versioning
**Description:** As a developer, I need a versioned save format so future schema changes don't break existing saves.

**Acceptance Criteria:**
- [ ] `src/game/state/SaveData.ts` defines a `SaveData` interface and a Zod schema for runtime validation:
  ```typescript
  interface SaveData {
    version: string;  // "0.1"
    character: { appearance, stats, inventory, position };
    world: { activeCats, resourceNodeCooldowns };
    session: { totalPlaytimeMs };
  }
  ```
- [ ] `src/game/state/migrations.ts` implements `migrateIfNeeded(data: unknown): SaveData`.
- [ ] Migration pattern: `"0.1"` → `"0.2"` → … each as a transform function.
- [ ] If version is current: no-op. Older: chain migrations. Unknown: throw with a user-presentable error.
- [ ] Stub migration `"0.1" → "0.2"` included as a template.
- [ ] **The same `SaveData` Zod schema is also used to validate the `saveData` input on `gameRouter.upsertSave`** — schema lives in a shared module so client and server agree.
- [ ] `pnpm typecheck` passes.

---

### US-203: Persistence module (save/load via tRPC)
**Description:** As a player, I want my game to auto-save so I never lose progress.

**Acceptance Criteria:**
- [ ] `src/game/state/Persistence.ts` exposes `save(): Promise<void>`, `load(): Promise<SaveData | null>`, `startAutoSave(intervalMs: number)`, `stopAutoSave()`, `forceSave(): Promise<void>`.
- [ ] Persistence depends on the `GameTrpcAdapter` introduced in PRD-01 — calls `trpc.upsertSave({ version, saveData })` and `trpc.getSave()`. **No direct `fetch()` to Neon, no PostgREST.**
- [ ] `save()`: calls `gameState.serialize()`, runs the `SaveData` Zod schema as a client-side guard, sends through the adapter.
- [ ] `load()`: calls `trpc.getSave()`, runs `migrateIfNeeded()`, returns `SaveData | null`.
- [ ] `startAutoSave(30000)`: timer that calls `save()` only if state is dirty (changed since last save).
- [ ] Dirty tracking: `isDirty` flag set by `GameState.set()`, cleared after successful save.
- [ ] Position updates only mark dirty every 5 seconds (prevents excessive saves from movement jitter).
- [ ] `forceSave()`: immediate save regardless of dirty flag — used by the manual save button.
- [ ] `window.beforeunload` handler calls a fire-and-forget save: prefer `navigator.sendBeacon()` against a dedicated Next.js route handler `POST /api/game/beacon-save` that re-uses the same upsert logic with WorkOS session validation. **Fall back gracefully if `sendBeacon` is unavailable** (e.g., some browsers in private mode).
- [ ] `isSaving` state and `lastSavedAt` timestamp exposed for HUD.
- [ ] Save errors surface as `SAVE_FAILED` events on `EventBus` (HUD shows the indicator from US-209) — they never crash the game loop.
- [ ] `pnpm typecheck` passes.

---

### US-204: Load & restore flow
**Description:** As a returning player, I want to resume where I left off when I open the game.

**Acceptance Criteria:**
- [ ] On `/play` mount (after the auth + character check from PRD-01): `Persistence.load()` is called.
- [ ] If no save exists AND no character: redirect to Character Creator (PRD-01 US-015).
- [ ] If character exists but no save: start new game at map spawn point with default state (10 yarn, full health).
- [ ] If save exists: `gameState.restore(saveData)` → player entity spawned at saved position with saved stats, inventory, yarn.
- [ ] Active cats from save: re-summoned at saved positions (validated against terrain — invalid → silently dismissed at restore time).
- [ ] Resource node cooldowns from save: restored (mid-cooldown nodes remain mid-cooldown with remaining time).
- [ ] Loading state shown while fetching (loading screen or spinner from `GameCanvas`).
- [ ] If load fails (network / `TRPCError`): show retry option, allow starting new game as fallback. **Never silently fall back to a default game** — users must consent to losing a save.
- [ ] `pnpm typecheck` passes.

---

### US-205: Debug Menu — Player tab
**Description:** As a developer, I want to modify player stats in real-time so I can test different progression states.

**Acceptance Criteria:**
- [ ] `src/game/ui/DebugMenu.ts` opens on `Ctrl+D` **only when `process.env.NODE_ENV === "development"`** — the menu code itself is gated behind the env check at construction time so it tree-shakes out of production bundles.
- [ ] Semi-transparent dark panel overlaying the game (does NOT pause the game).
- [ ] Player tab contains:
  - Level selector: dropdown / number input (0–10).
  - Health setter: slider (0 to maxHealth).
  - Yarn setter: number input (0–99).
  - Teleport: X and Z coordinate inputs + "Teleport" button.
  - Speed multiplier: slider (0.5×–3.0×) — modifies `runtimeConfig.movement.walkSpeed`.
  - God mode toggle: prevents health loss.
- [ ] All changes apply immediately via `GameState.set()` or `runtimeConfig` mutation.
- [ ] Changes emit `DEBUG_VALUE_CHANGED` events on `EventBus`.
- [ ] Debug values are session-only — never written to the save file.
- [ ] `Ctrl+D` toggles menu closed.
- [ ] `pnpm typecheck` passes.

---

### US-206: Debug Menu — Cats tab
**Description:** As a developer, I want to test cat abilities without resource constraints so I can iterate on cat behavior rapidly.

**Acceptance Criteria:**
- [ ] Cats tab contains:
  - Force-summon buttons: one per cat type (ignores yarn cost and cat limit).
  - Yarn override: number input to set yarn to any amount.
  - Cat limit override: number input (1–10).
  - Dismiss all: button that dismisses all active cats.
  - Cat behavior state display: shows state (Idle/Active/Expired) for each active cat.
- [ ] Force-summoned cats appear at player's current position + 2u offset.
- [ ] All changes apply immediately.
- [ ] `pnpm typecheck` passes.

---

### US-207: Debug Menu — World tab
**Description:** As a developer, I want to manipulate world state so I can test edge cases and balance.

**Acceptance Criteria:**
- [ ] World tab contains:
  - Time scale: slider (0.25×–4.0×) — affects `dt` passed to all systems EXCEPT `InputManager` (input must remain real-time).
  - Reload map: button → `MapManager.loadMap(TestMap)`.
  - Show collision wireframes: toggle that renders all colliders as wireframe overlays.
  - Show entity count: total entity count + breakdown by component type.
  - Resource controls: "Fill all nodes" (resets cooldowns), "Empty all nodes" (max cooldown).
  - Spawn resource node: dropdown (type) + position inputs + "Spawn" button.
- [ ] Collision wireframes render as a separate Three.js layer (toggled via `SceneManager`).
- [ ] `pnpm typecheck` passes.

---

### US-208: Debug Menu — Session tab
**Description:** As a developer, I want to control save/load and view session diagnostics.

**Acceptance Criteria:**
- [ ] Session tab contains:
  - Force Save: button → `Persistence.forceSave()`, shows success/failure.
  - Force Load: button → `Persistence.load()` + `gameState.restore()`.
  - Reset All State: button → calls `gameRouter.deleteSave` (PRD-01 US-014), reloads game with default state (keeps character).
  - Last saved: timestamp display, updates reactively.
  - FPS counter: real-time frames per second.
  - Entity count: total entities in `World`.
  - Session time: total time this session.
  - Auto-save status: "Enabled (every 30s)" / "Disabled" with toggle.
- [ ] Reset All State requires confirmation dialog ("Are you sure? This deletes your save.").
- [ ] `pnpm typecheck` passes.

---

### US-209: HUD save indicator
**Description:** As a player, I want subtle save feedback so I know my progress is being saved without being interrupted.

**Acceptance Criteria:**
- [ ] Small save icon (disk/cloud) appears briefly in corner when auto-save completes successfully.
- [ ] Icon shows for 2s then fades.
- [ ] On save failure: icon shows with red X, persists for 5s, surfaces the underlying error in a tooltip.
- [ ] Indicator does not block gameplay or cover HUD elements.
- [ ] `pnpm typecheck` passes.

## Functional Requirements

- FR-1: `GameState` must track ALL mutable game data — player stats, position, inventory, yarn, active cats, resource node cooldowns.
- FR-2: `serialize()` must produce a JSON-safe object with no circular references, no Three.js objects, no function references.
- FR-3: `restore()` must fully hydrate the game world from serialized data, including re-creating entities.
- FR-4: Auto-save fires every 30s ONLY when state has changed since last save.
- FR-5: `beforeunload` save must work even when the tab is closing — uses `navigator.sendBeacon()` against a Next.js route handler that re-uses the same upsert logic and WorkOS session.
- FR-6: Save format version checked on load — incompatible versions trigger the migration chain; unrecognized versions throw a user-presentable error.
- FR-7: Debug menu must be dead-code-eliminated from production bundles. Gating happens at construction (`process.env.NODE_ENV === "development"`); `next dev` enables it, `next build` strips it.
- FR-8: Debug value changes apply immediately (same frame or next frame).
- FR-9: Debug values must never be written to save files.
- FR-10: All debug controls emit `DEBUG_VALUE_CHANGED` events for system integration.
- FR-11: All persistence I/O goes through `gameRouter` (or its beacon route handler equivalent). No direct DB access from the browser.

## Non-Goals (Out of Scope)

- No multiple save slots (single save per user in MVP).
- No undo/redo for debug changes.
- No save file export/import to local filesystem.
- No active multi-device conflict reconciliation (saves live in Postgres so a user can technically resume on another device, but MVP is last-write-wins).
- No replay system.
- No performance profiling tools beyond the FPS counter.
- No leveling or ability progression (deferred to post-MVP).

## Technical Considerations

- **No browser-direct DB access.** Persistence calls `gameRouter` over tRPC — never `fetch()` to Neon. Authorization is enforced server-side by `protectedProcedure` scoping to `ctx.user.id` (no JWT validation in DB, no RLS).
- **`beforeunload` beacon endpoint.** `navigator.sendBeacon` cannot piggyback on the tRPC client cleanly. Add a thin Next.js route handler at `src/app/api/game/beacon-save/route.ts` that resolves the WorkOS session via `withAuth()`, validates the body with the same `SaveData` Zod schema, and calls the same Drizzle upsert logic as `gameRouter.upsertSave`. Keep the schema and DB call in a shared helper so the two entry points cannot drift apart.
- **Dirty tracking granularity.** Position changes happen 60×/s but only mark dirty every 5s (quantized). Resource/yarn/health changes mark dirty immediately. Prevents 2 saves/minute from position jitter alone.
- **`sendBeacon` payload limit.** 64KB. Current save data should be well under 1KB. If it grows, consider compression.
- **Save validation on load.** Use the Zod schema (US-202) to reject corrupted saves gracefully rather than crashing the game loop.
- **Debug menu z-index.** Renders above the Three.js canvas and above the HUD via a separate DOM layer with high z-index.
- **Time scale in debug.** Multiply `dt` at the `Game` loop level before passing to systems. `InputManager` is NOT scaled — input must remain real-time.
- **Dev-only gating.** Use `process.env.NODE_ENV === "development"` (Next.js convention). `import.meta.env.DEV` does not exist on Next.js. Construction-time check lets the bundler tree-shake debug code from production builds.

## Success Metrics

- Save/load round-trip preserves all visible state (position, inventory, yarn, active cats, health).
- Auto-save adds <5ms frame-time overhead (negligible at 60 FPS).
- Debug menu opens in <100ms; changes apply within 1 frame.
- Returning player resumes exactly where they left off (no "lost progress" reports).
- Developer can reproduce any game state within 30s using the debug menu.

## Open Questions

- Should auto-save be paused while the debug menu is open? (Prevents saving debug-modified state.)
- Should there be a "save before debug" snapshot so developers can restore pre-debug state?
- What happens if two browser tabs are open simultaneously? Last-write-wins for MVP, or add a `revision` column for optimistic concurrency?
