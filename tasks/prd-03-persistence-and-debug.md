# PRD: Persistence & Debug Menu (Phase 3)

## Introduction

Add full game state persistence (save/load/auto-save) and a comprehensive debug menu so that player progress survives sessions and developers can rapidly test and tune gameplay. This phase transforms the prototype from "fun to play once" to "a game you can return to" and gives the team tools to iterate on balance without code changes.

**Depends on:** PRD-01 (Engine Foundation), PRD-02 (Core Gameplay) — all gameplay systems functional.

## Goals

- Game state persists across sessions — close tab, reopen, pick up exactly where you left off
- Auto-save runs silently every 30 seconds without gameplay interruption
- Debug menu provides comprehensive developer controls for rapid iteration on feel and balance
- Save format is versioned so future changes don't break existing saves
- All persistence is serverless — browser talks directly to Neon Data API, no backend

## User Stories

### US-201: GameState Full Implementation
**Description:** As a developer, I need a central state store that tracks all game data with change detection so that UI updates reactively and serialization captures everything.

**Acceptance Criteria:**
- [ ] `src/state/GameState.ts` exposes: `get<T>(path: string): T`, `set<T>(path: string, value: T)`, `onChange<T>(path: string, callback: (newVal: T, oldVal: T) => void): Unsubscribe`, `serialize(): SaveData`, `restore(data: SaveData)`
- [ ] State shape tracks all game data:
  ```
  player: { appearance, position, stats.level, stats.health, stats.maxHealth, yarn, oxygen, abilities, inventory }
  world: { currentMapId, activeCats[], hiddenTerrain[], resourceNodes[] }
  session: { totalPlaytimeMs, isSwimming, isDiving }
  ```
- [ ] `set()` triggers registered `onChange()` callbacks for that path
- [ ] `serialize()` excludes transient state (session data, debug overrides) and returns JSON-safe object
- [ ] `restore()` hydrates all state from a saved snapshot and triggers change callbacks
- [ ] State validation: `set()` rejects invalid values (e.g., negative health, yarn below 0)
- [ ] `pnpm typecheck` passes

---

### US-202: Save Data Format & Versioning
**Description:** As a developer, I need a versioned save format so that future schema changes don't break existing saves.

**Acceptance Criteria:**
- [ ] `src/modules/persistence/types.ts` defines `SaveData` interface matching the GDD save format:
  ```typescript
  interface SaveData {
    version: string;  // "0.1"
    character: { appearance, stats, inventory, position };
    world: { activeCats, resourceNodeCooldowns };
    session: { totalPlaytimeMs };
  }
  ```
- [ ] `src/modules/persistence/migrations.ts` implements migration chain: `migrateIfNeeded(data): SaveData`
- [ ] Migration pattern: version "0.1" → "0.2" → ... each with a transform function
- [ ] If version is current: no-op. If older: chain migrations. If unknown: throw with clear error.
- [ ] Stub migration from "0.1" to future version included as template
- [ ] `pnpm typecheck` passes

---

### US-203: Persistence Module (Save/Load)
**Description:** As a player, I want my game to auto-save so that I never lose progress.

**Acceptance Criteria:**
- [ ] `src/state/Persistence.ts` exposes: `save(): Promise<void>`, `load(): Promise<SaveData | null>`, `startAutoSave(intervalMs: number)`, `stopAutoSave()`, `forceSave(): Promise<void>`
- [ ] `save()`: calls `gameState.serialize()`, sends to Neon `game_saves` table via `NeonClient.upsert()`
- [ ] `load()`: fetches from Neon, runs `migrateIfNeeded()`, returns `SaveData` or null if no save exists
- [ ] `startAutoSave(30000)`: sets interval that calls `save()` only if state is dirty (changed since last save)
- [ ] Dirty tracking: `isDirty` flag set by `GameState.set()` calls, cleared after successful save
- [ ] Position updates only mark dirty every 5 seconds (prevents excessive saves from movement)
- [ ] `forceSave()`: immediate save regardless of dirty flag — called on manual save button
- [ ] `window.beforeunload` handler calls `forceSave()` via `navigator.sendBeacon()` as fallback
- [ ] `isSaving` state exposed for UI feedback
- [ ] `lastSavedAt` timestamp exposed for UI display
- [ ] `pnpm typecheck` passes

---

### US-204: Load & Restore Flow
**Description:** As a returning player, I want to resume where I left off when I open the game.

**Acceptance Criteria:**
- [ ] On app start (after auth): `Persistence.load()` called
- [ ] If no save exists AND no character: redirect to Character Creator
- [ ] If character exists but no save: start new game at map spawn point with default state (10 yarn, full health)
- [ ] If save exists: `gameState.restore(saveData)` called → player entity spawned at saved position with saved stats, inventory, and yarn
- [ ] Active cats from save: re-summoned at their saved positions (validated against terrain — if position invalid, dismissed)
- [ ] Resource node cooldowns from save: restored (nodes that were on cooldown remain on cooldown with remaining time)
- [ ] Loading state shown while fetching (loading screen or spinner)
- [ ] If load fails (network error): show retry option, allow starting new game as fallback
- [ ] `pnpm typecheck` passes

---

### US-205: Debug Menu — Player Tab
**Description:** As a developer, I want to modify player stats in real-time so I can test different progression states.

**Acceptance Criteria:**
- [ ] `src/ui/DebugMenu.ts` renders when `Ctrl+D` pressed (only in `import.meta.env.DEV` builds)
- [ ] Semi-transparent dark panel overlaying game (does NOT pause game)
- [ ] Organized in tabs — Player tab contains:
  - Level selector: dropdown or number input (0-10)
  - Health setter: slider (0 to maxHealth)
  - Yarn setter: number input (0-99)
  - Teleport: X and Z coordinate inputs + "Teleport" button
  - Speed multiplier: slider (0.5x to 3.0x) — modifies `runtimeConfig.movement.walkSpeed`
  - God mode toggle: prevents health loss
- [ ] All changes apply immediately via `GameState.set()` or `runtimeConfig` mutation
- [ ] Changes emit `DEBUG_VALUE_CHANGED` events on EventBus
- [ ] Debug values are session-only — never persisted to save file
- [ ] Ctrl+D toggles menu closed
- [ ] `pnpm typecheck` passes

---

### US-206: Debug Menu — Cats Tab
**Description:** As a developer, I want to test cat abilities without resource constraints so I can iterate on cat behavior rapidly.

**Acceptance Criteria:**
- [ ] Cats tab contains:
  - Force-summon buttons: one per cat type (ignores yarn cost and cat limit)
  - Yarn override: number input to set yarn to any amount
  - Cat limit override: number input to change max active cats (1-10)
  - Dismiss all: button that dismisses all active cats
  - Cat behavior state display: shows state (Idle/Active/Expired) for each active cat
- [ ] Force-summoned cats appear at player's current position + 2u offset
- [ ] All changes apply immediately
- [ ] `pnpm typecheck` passes

---

### US-207: Debug Menu — World Tab
**Description:** As a developer, I want to manipulate world state so I can test edge cases and balance.

**Acceptance Criteria:**
- [ ] World tab contains:
  - Time scale: slider (0.25x to 4.0x) — affects `dt` passed to all systems
  - Reload map: button that calls `MapManager.loadMap(TestMap)` (resets all terrain)
  - Show collision wireframes: toggle that renders all colliders as wireframe overlays
  - Show entity count: displays total entity count and breakdown by component type
  - Resource controls: "Fill all nodes" button (resets all cooldowns), "Empty all nodes" (puts all on max cooldown)
  - Spawn resource node: dropdown (type) + position inputs + "Spawn" button
- [ ] Collision wireframes render as a separate Three.js layer (toggled via SceneManager)
- [ ] Time scale affects physics, cat timers, resource cooldowns, and oxygen — NOT input polling
- [ ] `pnpm typecheck` passes

---

### US-208: Debug Menu — Session Tab
**Description:** As a developer, I want to control save/load and view session diagnostics.

**Acceptance Criteria:**
- [ ] Session tab contains:
  - Force Save: button → calls `Persistence.forceSave()`, shows success/failure
  - Force Load: button → calls `Persistence.load()` + `gameState.restore()`, reloads game state
  - Reset All State: button → clears save from DB, reloads game with default state (keeps character)
  - Last saved: timestamp display, updates reactively
  - FPS counter: real-time frames per second
  - Entity count: total entities in World
  - Session time: total time this session
  - Auto-save status: "Enabled (every 30s)" / "Disabled" with toggle
- [ ] Reset All State requires confirmation dialog ("Are you sure? This deletes your save.")
- [ ] `pnpm typecheck` passes

---

### US-209: HUD Save Indicator
**Description:** As a player, I want subtle save feedback so I know my progress is being saved without being interrupted.

**Acceptance Criteria:**
- [ ] Small save icon (disk/cloud icon) appears briefly in corner when auto-save completes successfully
- [ ] Icon shows for 2 seconds then fades
- [ ] On save failure: icon shows with red X, persists for 5 seconds
- [ ] Save indicator does not block gameplay or cover HUD elements
- [ ] `pnpm typecheck` passes

## Functional Requirements

- FR-1: GameState must track ALL mutable game data — player stats, position, inventory, yarn, active cats, resource node cooldowns
- FR-2: `serialize()` must produce a JSON-safe object with no circular references, no Three.js objects, no function references
- FR-3: `restore()` must fully hydrate the game world from serialized data — including re-creating entities
- FR-4: Auto-save must fire every 30 seconds ONLY when state has changed since last save
- FR-5: `beforeunload` save must work even when tab is closing (use `sendBeacon`)
- FR-6: Save format version must be checked on load — incompatible versions trigger migration chain
- FR-7: Debug menu must ONLY render in development builds (`import.meta.env.DEV`)
- FR-8: Debug value changes must apply immediately (same frame or next frame)
- FR-9: Debug values must never be written to save files
- FR-10: All debug controls must emit `DEBUG_VALUE_CHANGED` events for system integration

## Non-Goals (Out of Scope)

- No multiple save slots (single save per user in MVP)
- No undo/redo for debug changes
- No save file export/import to local filesystem
- No cloud sync across devices (single device per session)
- No replay system
- No performance profiling tools (FPS counter is sufficient)
- No leveling or ability progression (deferred to post-MVP)

## Technical Considerations

- **Dirty tracking granularity**: Position changes happen 60x/s but only mark dirty every 5 seconds (quantized). Resource/yarn/health changes mark dirty immediately. This prevents 2 saves/minute from position jitter alone.
- **sendBeacon payload limit**: 64KB. Current save data should be well under 1KB. If it grows, consider compression.
- **Save validation on load**: Use runtime type checking (e.g., check required fields exist, types match) to reject corrupted saves gracefully rather than crashing.
- **Debug menu z-index**: Must render above the Three.js canvas and above the HUD. Use a separate DOM layer with high z-index.
- **Time scale in debug**: Multiply `dt` at the Game loop level before passing to systems. InputManager should NOT be scaled (user needs real-time input responsiveness).

## Success Metrics

- Save/load round-trip preserves all visible state (position, inventory, yarn, active cats, health)
- Auto-save adds <5ms frame time overhead (negligible impact on 60 FPS)
- Debug menu opens in <100ms, changes apply within 1 frame
- Returning player resumes exactly where they left off (no "lost progress" reports)
- Developer can reproduce any game state within 30 seconds using debug menu

## Open Questions

- Should auto-save be paused while the debug menu is open? (Prevents saving debug-modified state)
- Should there be a "save before debug" snapshot so developers can restore pre-debug state?
- What happens if two browser tabs are open simultaneously? Last-write-wins, or conflict detection?