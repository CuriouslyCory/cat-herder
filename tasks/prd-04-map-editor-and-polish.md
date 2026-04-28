# PRD: Map Editor & Polish (Phase 4)

## Introduction

Build a minimal developer-facing map editor and 2D map overlay, then polish the entire game through balance tuning, edge case fixes, and visual refinement. This phase transforms the MVP from "working prototype" to "complete vertical slice" — something that can be playtested and iterated on with confidence.

**Depends on:** PRD-01 (Engine Foundation), PRD-02 (Core Gameplay), PRD-03 (Persistence & Debug) — all systems functional.

## Goals

- Developers can create and edit maps without modifying code
- Players can see a 2D overhead map of the world for orientation
- Movement, cats, swimming, and gathering are balanced and feel good
- Edge cases are handled gracefully (stuck states, invalid placements, boundary issues)
- The game builds cleanly and passes all quality gates (`pnpm lint`, `typecheck`, `build`)

## User Stories

### US-301: Map Editor Mode
**Description:** As a developer, I want to edit maps visually so I can design levels without writing JSON by hand.

**Acceptance Criteria:**
- [ ] `Ctrl+E` toggles map editor mode (only in `import.meta.env.DEV` builds)
- [ ] Entering editor mode: game pauses, camera switches to `free` mode (WASD pans, mouse rotates, scroll zooms)
- [ ] Exiting editor mode: game resumes, camera returns to `follow` mode
- [ ] **Editor active indicator**: prominent "EDITOR MODE" banner visible at all times while editor is active (prevents confusion with gameplay keybindings — `M`, `D`, `1-9` are remapped in editor context)
- [ ] Editor does NOT destroy existing game state — entities persist while editing
- [ ] `src/maps/MapEditor.ts` exposes: `enable()`, `disable()`, `isActive(): boolean`, `getMapData(): MapData`, `loadMapData(data: MapData)`
- [ ] `pnpm typecheck` passes

---

### US-302: Map Editor Tools — Terrain
**Description:** As a developer, I want to place and modify terrain blocks so I can shape the map geometry.

**Acceptance Criteria:**
- [ ] Tool palette in side panel: Grass block, Dirt block, Stone block, Water zone
- [ ] Select tool → click on map → block placed at grid-snapped position (1u grid)
- [ ] Terrain blocks have adjustable height (side panel input: 0.5u to 5u in 0.5u increments)
- [ ] Click existing block → select it → side panel shows editable properties (type, height, position)
- [ ] Delete key removes selected block
- [ ] Water zone: click-drag to define rectangular water area, depth input in side panel
- [ ] Visual feedback: ghost preview of block before placement, highlighted border on selected block
- [ ] `pnpm typecheck` passes

---

### US-303: Map Editor Tools — Entities
**Description:** As a developer, I want to place spawn points, resource nodes, and special zones on the map.

**Acceptance Criteria:**
- [ ] Entity tools in tool palette: Player Spawn, Cat Spawn, Resource Node (Grass/Sticks/Water), Hidden Terrain Zone, Yarn Pickup
- [ ] Player Spawn: only one allowed — placing a new one moves the existing one
- [ ] Cat Spawn: place multiple, each shows as a cat icon marker
- [ ] Resource Node: select type from dropdown, place on map, configure respawn time in side panel
- [ ] Hidden Terrain Zone: click-drag to define area, set height in side panel
- [ ] Yarn Pickup: place collectible, set yarn amount in side panel (default 3)
- [ ] All placed entities show as distinct colored markers in editor view
- [ ] `pnpm typecheck` passes

---

### US-304: Map Editor — Move & Delete
**Description:** As a developer, I want to move and delete placed objects so I can iterate on map layouts.

**Acceptance Criteria:**
- [ ] Move tool: click entity → drag to new position → release to place (grid-snapped)
- [ ] Delete tool: click entity → entity removed from map
- [ ] Keyboard shortcut: `M` for move, `D` for delete, `1-9` for tool palette selection
- [ ] Undo: NOT required for MVP (explicitly out of scope)
- [ ] `pnpm typecheck` passes

---

### US-305: Map Editor — Save & Load
**Description:** As a developer, I want to save map layouts as JSON files and load them so that maps are portable and versioned.

**Acceptance Criteria:**
- [ ] Save button: exports current map state as `MapData` JSON file (browser download dialog)
- [ ] Filename auto-generated: `map-[name]-[timestamp].json`
- [ ] Load button: file picker → select JSON → `MapEditor.loadMapData(parsed)` → map rebuilds
- [ ] Loaded map replaces current map entirely (all entities destroyed and recreated)
- [ ] "Play" button in editor: calls `MapManager.loadMap(editorMapData)` → exits editor → game resumes on the edited map
- [ ] Invalid JSON shows error message (does not crash)
- [ ] `pnpm typecheck` passes

---

### US-306: 2D Map Overlay
**Description:** As a player, I want to see an overhead 2D map so I can orient myself in the world.

**Acceptance Criteria:**
- [ ] `src/game/NavigationOverlay.ts` renders when `M` key pressed (gameplay mode only — `M` is remapped to Move tool when Map Editor is active per US-304)
- [ ] 2D top-down view of the map rendered as colored regions:
  - Grass: green
  - Dirt: brown
  - Stone: gray
  - Water: blue
  - Hidden terrain: not shown (unless currently revealed by Curiosity Cat)
- [ ] Player icon: colored dot matching character color, with arrow showing facing direction
- [ ] Active cat positions: small cat-shaped icons on map
- [ ] Resource nodes: small icons showing type (distinguishable by color)
- [ ] Map scales to fit overlay panel (fixed size, e.g., 400x400px centered on screen)
- [ ] Pressing `M` again or `Escape` closes the overlay
- [ ] Game continues running behind overlay (NOT paused) — but input is consumed by overlay while open
- [ ] `pnpm typecheck` passes

---

### US-307: Movement Balance Pass
**Description:** As a developer, I want to verify and tune all movement values so that traversal feels satisfying.

**Acceptance Criteria:**
- [ ] Walk speed (4.5 u/s) tested: map traversal feels purposeful, not sluggish
- [ ] Acceleration (0.3s) tested: movement start feels responsive but weighted
- [ ] Deceleration (0.2s) tested: stopping feels controlled, not slippery
- [ ] Jump impulse (3.5u) tested: reaches intended platforms, feels powerful
- [ ] Coyote time (5 frames) tested: jumping after walking off edges works reliably
- [ ] Jump buffer (5 frames) tested: rapid repeated jumps feel responsive
- [ ] Air control (70%) tested: can steer mid-air without feeling ice-physics
- [ ] Swimming speeds tested: surface (3.2 u/s), dive (2.0 u/s), ascend (2.5 u/s)
- [ ] Any values that feel wrong are adjusted in `config.ts` with a comment explaining the change
- [ ] `pnpm typecheck` passes

---

### US-308: Cat Balance Pass
**Description:** As a developer, I want to verify and tune cat costs and effects so that each cat feels worth its yarn cost.

**Acceptance Criteria:**
- [ ] Loaf (1 yarn): height is appropriate for stepping — test stacking 2-3 Loafs to reach platforms
- [ ] Zoomies (2 yarn): speed trail length and 2x multiplier tested — feels impactful but not game-breaking
- [ ] Curiosity Cat (2 yarn): 5u reveal radius tested — reveals enough to be useful, 20s duration sufficient
- [ ] Pounce (3 yarn): 3.5u launch **from cat's resting height** tested — total reach = cat height + impulse apex. Must reliably reach High tier platforms (~3.5u). Verify that the 3-yarn cost feels justified by the height advantage over a free base jump (1.2u apex).
- [ ] Starting yarn (10) tested: enough to experiment with all cats in a single session
- [ ] Cat limit (3 for MVP) tested: creates meaningful placement decisions. **Note**: Map & Movement System spec allows 3-5 scaling with progression. Ensure `config.ts` stores this as a tunable constant for post-MVP expansion.
- [ ] Any values that feel wrong are adjusted in cat definition files with comments
- [ ] `pnpm typecheck` passes

---

### US-309: Resource Balance Pass
**Description:** As a developer, I want resource gathering to hit the GDD feel targets so that the core loop is satisfying.

**Acceptance Criteria:**
- [ ] Grass gather time (1.5s) tested: feels "snappy — instant gratification" per GDD
- [ ] Sticks gather time (1.5s) tested: comparable feel to grass
- [ ] Water gather time (2.0s) tested: slightly slower, feels like a higher-value resource
- [ ] Respawn timers tested: Grass (30s), Sticks (45s), Water (60s) — nodes don't feel permanently depleted
- [ ] Inventory cap (10) tested: creates tension without frustration per GDD. If >20% of session is inventory management, increase to 15.
- [ ] Resource distribution on test map tested: player can gather 5-10 Grass, 2-3 Sticks, 1 Water per 10-minute session (per Balance Spreadsheet target)
- [ ] "+1 Resource" floating text feedback tested: feels rewarding
- [ ] Any values adjusted are documented in comments
- [ ] `pnpm typecheck` passes

---

### US-310: Edge Case Fixes
**Description:** As a developer, I want all known edge cases handled gracefully so the game never enters an unrecoverable state.

**Acceptance Criteria:**
- [ ] Player cannot get stuck in terrain (push-out resolution if clipping occurs)
- [ ] Player cannot walk out of map bounds (collision walls at edges)
- [ ] Cat cannot be summoned inside collision geometry (auto-raise per spec: 3 attempts, then fail with feedback)
- [ ] Cat dismissed while player is standing on it: player falls safely (no void/clip)
- [ ] Oxygen draining to 0 → health draining to 0: player "respawns" at map spawn point with **full health (5 hearts)** and full oxygen (no death screen, no health penalty — "Zen Engagement" pillar: respawn must feel like a gentle reset, not punishment)
- [ ] Inventory full → gathering attempt: clear feedback message, gathering does not start
- [ ] Saving while swimming: on load, if player position is in water, SwimmingState is correctly applied
- [ ] Tab unfocus: game pauses (requestAnimationFrame stops naturally), auto-save still fires
- [ ] Rapid input: holding multiple keys, mashing jump, spam-clicking cat summon — no crashes or inconsistent state
- [ ] `pnpm typecheck` passes

---

### US-311: Visual Polish
**Description:** As a developer, I want visual refinements that make the game feel more alive without adding art assets.

**Acceptance Criteria:**
- [ ] Ground plane shadows: player and cat entities cast elliptical shadows onto ground (per movement spec)
- [ ] Terrain grid lines: subtle grid overlay on terrain for spatial reference
- [ ] Terrain color variation: slight random tint variation within terrain types (not all grass is identical green)
- [ ] Water zone: semi-transparent blue with subtle animation (opacity pulse or UV shift)
- [ ] Cat summon effect: brief scale-up animation when cat appears (0 → 1 over 0.2s)
- [ ] Cat dismiss effect: brief scale-down animation before removal (1 → 0 over 0.2s)
- [ ] Gather progress: smooth progress bar (not jerky step increments)
- [ ] Hidden terrain reveal: shimmer/fade-in transition (not instant snap-on)
- [ ] `pnpm typecheck` passes

---

### US-312: Final Quality Gate
**Description:** As a developer, I need all quality checks passing so the MVP is shippable.

**Acceptance Criteria:**
- [ ] `pnpm lint` passes with zero warnings
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm build` succeeds and produces optimized bundle
- [ ] No console errors on clean startup
- [ ] No console warnings related to game logic (Three.js deprecation warnings acceptable)
- [ ] Game maintains 60 FPS with test map fully populated (all resource nodes, 3 active cats, swimming active)
- [ ] Auth flow completes successfully (sign in → game, sign out → title, refresh → session persists)
- [ ] Save/load round trip verified (play → close tab → reopen → state matches)
- [ ] All 4 cat types functional (verified per acceptance criteria in PRD-02)
- [ ] Swimming + oxygen verified (verified per acceptance criteria in PRD-02)
- [ ] Debug menu functional (verified per acceptance criteria in PRD-03)
- [ ] Map editor produces valid MapData (save → load → identical map)

## Functional Requirements

- FR-1: Map editor must be developer-only (`import.meta.env.DEV`)
- FR-2: Map editor must save/load the same `MapData` format that `MapManager.loadMap()` consumes
- FR-3: Map editor must NOT corrupt game state when entering/exiting
- FR-4: 2D map overlay must show terrain types as colored regions, player position as icon, active cats as icons
- FR-5: 2D map overlay must NOT pause the game
- FR-6: Player death (0 health) must respawn at spawn point with **full health (5 hearts)** and full oxygen — no death screen, no health penalty (Zen Engagement pillar)
- FR-7: All edge cases must produce user-visible feedback — no silent failures
- FR-8: Build must produce optimized bundle (`pnpm build`) with no errors

## Non-Goals (Out of Scope)

- No undo/redo in map editor
- No prefab system for map editor
- No terrain painting (brush tool) — block placement only
- No custom terrain textures or materials
- No procedural map generation
- No map sharing or multiplayer map editor
- No automated test suite (manual verification sufficient for MVP)
- No CI/CD pipeline
- No production deployment (MVP is local dev only)

## Technical Considerations

- **Map editor camera**: Reuses `CameraController.setMode('free')` from Phase 1. Free mode allows WASD panning and mouse rotation. No new camera implementation needed.
- **Grid snapping**: Map editor snaps to 1u grid. This matches terrain cell size. Implement as `Math.round(worldPos.x)` on placement.
- **2D map rendering**: Use a separate HTML5 `<canvas>` element overlaid on the game. Draw terrain cells as colored rectangles, icons as circles/shapes. No Three.js involvement — keeps it simple and performant.
- **Entity count at this phase**: Test map should have ~100-200 entities (terrain blocks + resource nodes + cats + spawn markers + player). ECS query caching from Phase 1 handles this efficiently.
- **Balance pass values**: All changes to `config.ts` should include code comments with rationale. This creates a tuning history.

## Success Metrics

- Developer can create a new map from scratch in under 5 minutes using the editor
- Developer can save a map, load it in a new session, and play on it immediately
- 2D map overlay provides useful orientation — player can find their way to specific zones
- Movement feels "weighted but responsive" — not floaty, not stiff
- Each cat type has at least one clear use case on the test map
- Resource gathering achieves "instant gratification" feel (GDD core design note)
- Zero stuck states found during 30 minutes of exploratory testing
- Zero crashes during 30 minutes of rapid input testing (key mashing, spam clicking)
- `pnpm build` succeeds and bundle size is reasonable (<2MB including Three.js)

## Open Questions

- Should the map editor support multiple layers/heights, or just flat terrain blocks at different heights?
- Should the 2D map show resource node cooldown status (ready vs. on cooldown)?
- Should the "respawn on death" mechanic have a brief invulnerability period?
- Should there be a "Welcome back" message when loading a save, showing session recap?