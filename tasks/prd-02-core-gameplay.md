
**Acceptance Criteria:**
- [ ] Oxygen starts at 100 when submerged, drains at 1% per 0.3s (3.33/s) while diving
- [ ] Oxygen does NOT drain while on water surface (only when `isDiving = true`)
- [ ] Oxygen HUD gauge: circular/bar element appears at top-center when submerged, hidden on land
- [ ] Warning: pulsing red visual effect at 20% oxygen remaining
- [ ] Depletion: when oxygen hits 0, player loses 1 health per second
- [ ] Surfacing: oxygen refills at 5%/s when on water surface
- [ ] Exiting water: oxygen resets to 100, gauge hides
- [ ] Events emitted: `OXYGEN_WARNING` at 20%, `OXYGEN_DEPLETED` at 0%
- [ ] `pnpm typecheck` passes

---

### US-104: Cat Definition Data Structure
**Description:** As a developer, I need a data-driven cat definition system so that adding new cat types requires only a definition file and enum entry.

**Acceptance Criteria:**
- [ ] `src/game/cats/CatDefinition.ts` defines the `CatDefinition` interface: `type` (CatType enum), `yarnCost` (number), `name` (string), `description` (string), `behavior` config (idle animation, active effect, duration, cooldown), `meshConfig` (shape, color, size for the primitive), `effectType` ('terrain' | 'movement' | 'utility' | 'launch')
- [ ] `src/game/cats/definitions/` directory contains one file per cat type, each exporting a `CatDefinition`
- [ ] `src/game/cats/definitions/index.ts` barrel exports a registry `Map<CatType, CatDefinition>`
- [ ] Registry is iterable — `CatCompanionManager` reads it to build the catalog
- [ ] Adding a new cat = one new definition file + one `CatType` enum entry + barrel export
- [ ] `pnpm typecheck` passes

---

### US-105: CatCompanionManager
**Description:** As a player, I want to summon and dismiss cat companions using yarn so that I can solve puzzles and traverse the world.

**Acceptance Criteria:**
- [ ] `src/game/CatCompanionManager.ts` exposes: `summon(catType, position): Entity | null`, `dismiss(entity)`, `getCatalog(): CatCatalogEntry[]`, `getActiveCompanions(): Entity[]`
- [ ] `summon()` validates: enough yarn, under cat limit (3 active per spec), position is valid (not inside collision geometry)
- [ ] On valid summon: deducts yarn from GameState, creates cat entity with `Transform`, `Renderable`, `Collider`, `CatBehavior` components, emits `CAT_SUMMONED` event
- [ ] On invalid summon: returns `null`, provides feedback (insufficient yarn message or invalid position)
- [ ] `dismiss()`: removes cat entity, returns yarn to GameState, emits `CAT_DISMISSED` event
- [ ] `getCatalog()`: returns all defined cats with type, name, yarn cost, description, unlocked status
- [ ] `getActiveCompanions()`: returns currently active cat entities
- [ ] Cat limit: if summoning exceeds limit, oldest cat is auto-dismissed with visual feedback
- [ ] `pnpm typecheck` passes

---

### US-106: Cat Placement UI
**Description:** As a player, I want to aim and place cats with my mouse so that positioning is intuitive and precise.

**Acceptance Criteria:**
- [ ] Cat selection: number keys 1-4 select cat type from roster (active type shown in HUD)
- [ ] When cat type selected: mouse cursor shows ghost preview (semi-transparent colored primitive) at world position
- [ ] Ghost preview snaps to valid ground positions (not inside walls, not in void)
- [ ] Ghost changes color (red) when position is invalid
- [ ] Left-click at valid position: summon selected cat type there
- [ ] Right-click on active cat: dismiss it (yarn returned)
- [ ] Cat selection bar in HUD shows all 4 types with yarn cost and current yarn count
- [ ] `pnpm typecheck` passes

---

### US-107: Loaf Cat Implementation
**Description:** As a player, I want to summon a Loaf cat that becomes a solid platform so I can reach elevated areas by stacking.

**Acceptance Criteria:**
- [ ] `src/game/cats/definitions/Loaf.ts` defines: type=Loaf, yarnCost=1, effectType='terrain'
- [ ] On summon: cat entity created with static `Collider` (box shape, 1.5u tall per spec midpoint)
- [ ] Player can walk on top of the Loaf (it's solid terrain)
- [ ] Multiple Loafs stackable — player can place one atop another to reach higher
- [ ] Loaf is immovable (static body — nothing pushes it)
- [ ] Visual: box-shaped colored primitive (distinct cat-like color, e.g., warm orange)
- [ ] On dismiss: collider removed, entity destroyed, player falls if standing on it
- [ ] `pnpm typecheck` passes

---

### US-108: Zoomies Cat Implementation
**Description:** As a player, I want to summon a Zoomies cat that creates a speed trail so I can move faster through an area.

**Acceptance Criteria:**
- [ ] `src/game/cats/definitions/Zoomies.ts` defines: type=Zoomies, yarnCost=2, effectType='movement', duration=8s, speedMultiplier=2.0
- [ ] On summon: cat entity spawns at target position, immediately creates a trigger zone (trail) extending 6u in the direction the player is facing
- [ ] When player overlaps the trail trigger: movement speed multiplied by 2x
- [ ] Speed buff applies only while inside the trail zone
- [ ] Trail persists for 8 seconds, then fades (entity destroyed, yarn NOT returned — consumed)
- [ ] Visual: elongated colored zone (bright glowing color) showing the trail path
- [ ] Trail auto-dismisses after duration — no manual dismiss needed (but right-click dismiss works too, yarn returned only if dismissed before expiry)
- [ ] `pnpm typecheck` passes

---

### US-109: Curiosity Cat Implementation
**Description:** As a player, I want to summon a Curiosity Cat that reveals hidden terrain so I can discover secret paths and areas.

**Acceptance Criteria:**
- [ ] `src/game/cats/definitions/CuriosityCat.ts` defines: type=CuriosityCat, yarnCost=2, effectType='utility', revealRadius=5u, revealDuration=20s
- [ ] Hidden terrain zones defined in `MapData` as entities with `Renderable` (initially invisible) + `Collider` (initially disabled)
- [ ] On summon: all hidden terrain entities within 5u radius become visible (shimmer/fade-in effect) and their colliders activate (walkable)
- [ ] Revealed terrain persists for 20 seconds, then fades back to hidden
- [ ] Event emitted: `HIDDEN_TERRAIN_REVEALED` with list of affected terrain IDs
- [ ] Cat remains at summon position during reveal duration
- [ ] Auto-dismisses after 20s (yarn consumed)
- [ ] Right-click dismiss before expiry returns yarn
- [ ] Test map includes at least one hidden terrain zone (bridge or platform) that connects otherwise inaccessible areas
- [ ] `pnpm typecheck` passes

---

### US-110: Pounce Cat Implementation
**Description:** As a player, I want to summon a Pounce cat that launches me upward so I can reach high platforms in one move.

**Acceptance Criteria:**
- [ ] `src/game/cats/definitions/Pounce.ts` defines: type=Pounce, yarnCost=3, effectType='launch', launchImpulse=3.5u
- [ ] On summon: cat entity created with upward-facing trigger zone on top
- [ ] When player walks onto the Pounce cat's trigger zone: applies 3.5u upward impulse to player velocity (same as jump impulse — reaches High tier per spec)
- [ ] Launch occurs once per "landing" — player must leave and re-enter the trigger to launch again
- [ ] Pounce cat persists until dismissed (not consumed on use)
- [ ] Right-click dismiss returns yarn
- [ ] Visual: crouching-shaped primitive (low wide box) with distinct color
- [ ] Player retains 70% air control during launch (same as normal jump)
- [ ] Test map elevated platforms reachable via Pounce (3.5u high)
- [ ] `pnpm typecheck` passes

---

### US-111: CatAISystem
**Description:** As a developer, I need a generic system that drives all cat behaviors from their definitions so that cat behavior is data-driven.

**Acceptance Criteria:**
- [ ] `src/ecs/components/CatBehavior.ts` component: `catType`, `state` (Idle | Active | Cooldown | Expired), `stateTimer`, `ownerId`
- [ ] `src/systems/CatAISystem.ts` implements `System` interface
- [ ] Each frame: queries entities with `CatBehavior` + `Transform`
- [ ] State machine per cat: Idle (just placed) → Active (effect running) → Expired (duration elapsed, auto-dismiss)
- [ ] Terrain cats (Loaf, Pounce): stay in Active indefinitely until manually dismissed
- [ ] Duration cats (Zoomies 8s, Curiosity 20s): timer counts down, auto-dismiss on expiry
- [ ] System reads behavior config from `CatDefinition` — no cat-specific logic hardcoded in the system
- [ ] `pnpm typecheck` passes

---

### US-112: Resource Nodes & Gathering
**Description:** As a player, I want to gather resources from nodes on the map so that I feel productive and have materials to progress.

**Acceptance Criteria:**
- [ ] Resource node entities: `Transform`, `Renderable` (distinct shape/color per type), `Collider` (trigger zone for interaction range), `ResourceNode` component (resourceType, gatherTime, yieldAmount, respawnTime, cooldownRemaining)
- [ ] `ResourceNode` component tracks: `type` (Grass/Sticks/Water), `gatherTime` (1.5s/1.5s/2.0s per GDD), `yieldAmount` (1), `respawnTime` (30s/45s/60s per GDD), `cooldownRemaining` (0 = ready), `isBeingGathered` (bool)
- [ ] Player presses E near a ready resource node → gathering starts (progress bar in HUD, takes `gatherTime` seconds)
- [ ] Player moving or pressing E again during gather → cancels gather (no penalty per GDD)
- [ ] Gather complete → resource added to inventory, node enters cooldown (visual: dims/fades), `+1 [Resource]` floats up from node
- [ ] After cooldown expires → node becomes gatherable again (visual: restores)
- [ ] Test map populated with: 8-12 Grass nodes (scattered), 3-5 Sticks nodes (forest zone), 1-2 Water nodes (near water zone)
- [ ] `pnpm typecheck` passes

---

### US-113: Inventory System
**Description:** As a player, I want an inventory that holds gathered resources with a capacity limit so that I make strategic choices about what to carry.

**Acceptance Criteria:**
- [ ] `GameState` tracks: `player.inventory` — array of `{resourceType, quantity}` stacks, `player.inventory.maxCapacity` (default 10 per GDD)
- [ ] When gathering: if inventory has space → add resource. If full → gathering fails with "Inventory Full" feedback
- [ ] Resources of same type stack (not per-slot)
- [ ] Capacity counts total items across all stacks (10 Grass + 5 Sticks = 15 items, exceeds 10 cap)
- [ ] HUD inventory display: shows resource icons with quantities, capacity bar (e.g., "7/10")
- [ ] `GameState.onChange('player.inventory', ...)` triggers HUD update reactively
- [ ] `pnpm typecheck` passes

---

### US-114: Yarn Economy & HUD
**Description:** As a player, I need a yarn counter in the HUD so I know how many cats I can afford to summon.

**Acceptance Criteria:**
- [ ] `GameState` tracks: `player.yarn` (number, starts at 10 for testing)
- [ ] Summoning a cat deducts yarn cost; dismissing returns it
- [ ] HUD shows yarn count with a yarn ball icon
- [ ] When yarn is insufficient for selected cat: ghost preview shows red, "Not enough yarn" tooltip
- [ ] Yarn count updates reactively when state changes
- [ ] Test map includes "yarn pickup" entities that add yarn when player walks over them (2-3 pickups, +3 yarn each)
- [ ] `pnpm typecheck` passes

---

### US-115: Enhanced HUD
**Description:** As a player, I need a complete HUD showing health, yarn, inventory, oxygen, and active cats so I have full situational awareness.

**Acceptance Criteria:**
- [ ] Health display: hearts or health bar (default 5 hearts per GDD)
- [ ] Yarn count: yarn ball icon + number
- [ ] Inventory: resource icons with quantities + capacity indicator
- [ ] Oxygen gauge: appears ONLY when submerged, hides on land
- [ ] Active cat bar: shows icons of summoned cats with right-click dismiss hint
- [ ] Cat selection: shows 4 cat types with yarn costs, selected type highlighted
- [ ] Gather progress: bar appears during gathering, disappears on complete/cancel
- [ ] All HUD elements positioned at screen edges, not obstructing center gameplay area
- [ ] All elements update reactively via `GameState.onChange()`
- [ ] `pnpm typecheck` passes

## Functional Requirements

- FR-1: Water entry must be automatic when player overlaps water volume — no button press
- FR-2: Oxygen drains at 1% per 0.3s (3.33/s) ONLY while diving, not on surface
- FR-3: Health damage (1/s) applies when oxygen reaches 0
- FR-4: Oxygen fully refills when player exits water
- FR-5: Cat summon must validate: sufficient yarn, under limit (3 for MVP), valid position (not inside geometry). **Note**: Map & Movement System spec defines 3-5 active cats scaling with progression. MVP hardcodes to 3; this should be configurable in `config.ts` for future expansion.
- FR-6: Cat limit exceeded → oldest active cat auto-dismissed with visual/audio feedback
- FR-7: Loaf cat must be static (immovable), walkable, and stackable
- FR-8: Zoomies trail must apply 2x speed multiplier while player overlaps, persist 8s
- FR-9: Curiosity Cat must reveal hidden terrain within 5u radius for 20s
- FR-10: Pounce cat must apply 3.5u upward impulse **from the cat's resting height** (total reach = cat body height + 3.5u impulse apex). This exceeds a base jump (which reaches 1.2u apex from ground). The Pounce's value is positional — it launches from an elevated starting point. Test map should include platforms at ~3.5u height to validate reachability.
- FR-11: Resource gathering requires E key + proximity, takes configurable time, cancellable by movement. **`E` key context resolution**: `E` is a context-sensitive interaction key. Priority order: (1) Resource node in range → gather, (2) Cat companion in range → bind. If both a resource node and a cat are in range, the nearest entity wins. The Map & Movement System spec assigns `E` to Bind; this PRD extends it as a shared interaction key.
- FR-12: Inventory capacity limits total items (default 10), prevents gathering when full
- FR-13: Resource nodes enter timed cooldown after harvesting and visually indicate unavailability

## Non-Goals (Out of Scope)

- No farm buildings or resource deposit system (Phase 3+)
- No leveling, XP, or ability progression (Phase 3+)
- No herding wild cats (different from cat companions — Phase 3+)
- No catnip resource (requires level 5 per GDD — deferred)
- No gathering tier upgrades (Tier 2/3 speed or yield improvements — deferred)
- No cat treats crafting
- No resource node AOE gathering
- No dash mechanic (Map & Movement System defines Dash at 7.2 u/s as a base ability — **deferred to post-MVP**. MVP speed bursts are gated behind Movement Speed ability Tier 3 sprint per GDD § 4.4)
- No click-to-move pathfinding for gathering routes (Map & Movement System § 2.1 defines A* pathfinding — **deferred to post-MVP**)

## Technical Considerations

- **SwimmingState as component**: Added/removed dynamically via trigger volume overlap. MovementSystem checks for this component to switch physics behavior — no state machine needed in MovementSystem itself, just a component presence check.
- **Cat definitions are pure data**: `CatDefinition` objects contain no logic — just parameters. `CatAISystem` interprets them generically. This is critical for extensibility.
- **Trigger zones for cat effects**: Zoomies trail, Pounce launch pad, and Curiosity reveal radius all use `PhysicsEngine` trigger volumes. The `CollisionSystem` detects overlaps and emits events.
- **Resource node as ECS entity**: Each node is a full entity with components. `ResourceSystem` (or inline logic in an `InteractionSystem`) handles gather timing and cooldowns.
- **HUD updates via GameState.onChange()**: No polling. State changes emit callbacks. HUD subscribes to specific paths.

## Success Metrics

- Swimming transition feels seamless (no visual glitch or position jump at water boundary)
- Oxygen system creates tension without frustration (30s is enough to explore, warning at 20% gives time to surface)
- Each cat type feels mechanically distinct (player uses them for different problems)
- Loaf stacking works reliably (2-3 Loafs reach elevated platforms)
- Pounce launch feels satisfying (butt-wiggle animation → explosive upward motion)
- Resource gathering feels snappy (1.5s base time per GDD — "instant gratification" feel)
- Inventory pressure creates meaningful choices at 10 capacity
- Player can complete a "session loop": gather resources → manage inventory → use cats to explore → feel productive

## Open Questions

- Should Zoomies trail extend in the player's facing direction at summon time, or should it follow the cat's initial movement?
- Should Curiosity Cat reveal terrain in a sphere (3D radius) or cylinder (2D radius + full height)?
- Should resource nodes have interaction range based on player proximity, or require the player to be standing directly on them?
- Should yarn pickups respawn, or are they one-time collectibles?