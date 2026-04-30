# PRD: Core Gameplay (Phase 2)

## Introduction

Build the core gameplay loop on top of the Phase 1 engine: water mechanics (swimming, diving, oxygen), cat companion system with 4 distinct types (Loaf, Zoomies, Curiosity, Pounce), resource gathering (grass, sticks, water), inventory management, and yarn economy. This phase transforms the prototype into a playable game with meaningful moment-to-moment decisions.

**Depends on:** PRD-01 (Engine Foundation) — engine, ECS, movement, camera, character creator, `gameRouter`, and `/play` mount point complete.

## Goals

- Water/swimming mechanics feel seamless and create traversal puzzles.
- 4 cat types are mechanically distinct, each solving different problems.
- Resource gathering creates a satisfying core loop (search → gather → use).
- Inventory management adds strategic depth without feeling grindy.
- Yarn economy gates cat summons, creating meaningful progression pacing.

## User Stories

### US-101: Water Mechanics
**Description:** As a player, I want to enter water and swim so that underwater zones add traversal variety.

**Acceptance Criteria:**
- [ ] Water zones (terrain type) defined in MapData as trigger volumes.
- [ ] `src/game/ecs/components/SwimmingState.ts` component added when player overlaps a water trigger; removed on exit.
- [ ] On water entry: player transitions to swimming (different movement physics) without a position pop at the water boundary.
- [ ] Surface speed: 3.2 u/s (vs 4.5 u/s walk on land), reduced acceleration.
- [ ] Dive input: `Shift` held while in water → `isDiving = true`, movement drops to 2.0 u/s.
- [ ] Ascend: release `Shift` → `isDiving = false`, rise at 2.5 u/s toward surface.
- [ ] Buoyancy: natural float on water surface while not diving.
- [ ] Water boundary smooth-transitions over 0.5u (no hard edge).
- [ ] `MovementSystem` checks for `SwimmingState` component and applies different physics — no state machine needed.
- [ ] `pnpm typecheck` passes.

---

### US-102: Oxygen System
**Description:** As a player, I want to manage oxygen while diving so underwater exploration requires strategy and risk-reward.

**Acceptance Criteria:**
- [ ] Oxygen starts at 100 when submerged, drains at 1% per 0.3s (3.33/s) while `isDiving === true`.
- [ ] Oxygen does NOT drain on the water surface.
- [ ] Oxygen HUD gauge: circular/bar element appears at top-center while submerged, hidden on land.
- [ ] Warning: pulsing red visual effect at 20% oxygen remaining.
- [ ] Depletion: when oxygen hits 0, player loses 1 health per second.
- [ ] Surfacing: oxygen refills at 5%/s on the water surface.
- [ ] Exiting water: oxygen resets to 100, gauge hides.
- [ ] Events emitted via `EventBus`: `OXYGEN_WARNING` at 20%, `OXYGEN_DEPLETED` at 0%.
- [ ] `pnpm typecheck` passes.

---

### US-103: Cat Definition Data Structure
**Description:** As a developer, I need a data-driven cat definition system so adding a new cat type requires only a definition file and an enum entry.

**Acceptance Criteria:**
- [ ] `src/game/cats/CatDefinition.ts` defines the `CatDefinition` interface: `type` (CatType enum), `yarnCost`, `name`, `description`, `behavior` config (idle animation, active effect, duration, cooldown), `meshConfig` (shape, color, size for the primitive), `effectType` (`'terrain' | 'movement' | 'utility' | 'launch'`).
- [ ] `src/game/cats/definitions/` contains one file per cat type, each exporting a `CatDefinition`.
- [ ] `src/game/cats/definitions/index.ts` barrel exports a registry `Map<CatType, CatDefinition>`.
- [ ] Registry is iterable — `CatCompanionManager` reads it to build the catalog.
- [ ] Adding a new cat = one new definition file + one `CatType` enum entry + barrel export.
- [ ] `pnpm typecheck` passes.

---

### US-104: CatCompanionManager
**Description:** As a player, I want to summon and dismiss cat companions using yarn so I can solve puzzles and traverse the world.

**Acceptance Criteria:**
- [ ] `src/game/cats/CatCompanionManager.ts` exposes `summon(catType, position): Entity | null`, `dismiss(entity)`, `getCatalog(): CatCatalogEntry[]`, `getActiveCompanions(): Entity[]`.
- [ ] `summon()` validates enough yarn, under cat limit (3 active for MVP — sourced from `runtimeConfig`), position not inside collision geometry.
- [ ] On valid summon: deducts yarn from `GameState`, creates cat entity with `Transform`, `Renderable`, `Collider`, `CatBehavior`; emits `CAT_SUMMONED`.
- [ ] On invalid summon: returns `null`, surfaces feedback (insufficient yarn / invalid position).
- [ ] `dismiss()`: removes cat entity, returns yarn to `GameState` (only if not yet expired), emits `CAT_DISMISSED`.
- [ ] `getCatalog()`: returns all defined cats with type, name, yarn cost, description, unlocked status.
- [ ] Cat limit: if summon exceeds limit, oldest cat auto-dismisses with visual feedback.
- [ ] `pnpm typecheck` passes.

---

### US-105: Cat Placement UI
**Description:** As a player, I want to aim and place cats with my mouse so positioning is intuitive and precise.

**Acceptance Criteria:**
- [ ] Cat selection: number keys 1–4 select cat type from roster (active type shown in HUD).
- [ ] When a cat type is selected: ghost preview (semi-transparent colored primitive) follows the mouse world position.
- [ ] Ghost preview snaps to valid ground positions (not inside walls, not in void).
- [ ] Ghost shows red when position is invalid.
- [ ] Left-click at valid position: summon selected cat type there.
- [ ] Right-click on an active cat: dismiss it (yarn returned per US-104 rules).
- [ ] Cat selection bar in HUD shows all 4 types with yarn cost and current yarn count.
- [ ] `pnpm typecheck` passes.

---

### US-106: Loaf Cat Implementation
**Description:** As a player, I want to summon a Loaf cat that becomes a solid platform so I can reach elevated areas by stacking.

**Acceptance Criteria:**
- [ ] `src/game/cats/definitions/Loaf.ts` defines `type=Loaf`, `yarnCost=1`, `effectType='terrain'`.
- [ ] On summon: cat entity created with static `Collider` (box, ~1.5u tall).
- [ ] Player can walk on top of the Loaf (solid terrain).
- [ ] Multiple Loafs stackable to reach higher.
- [ ] Loaf is immovable (static body).
- [ ] Visual: box-shaped colored primitive (warm orange).
- [ ] On dismiss: collider removed, entity destroyed, player falls if standing on it.
- [ ] `pnpm typecheck` passes.

---

### US-107: Zoomies Cat Implementation
**Description:** As a player, I want to summon a Zoomies cat that creates a speed trail so I can move faster through an area.

**Acceptance Criteria:**
- [ ] `src/game/cats/definitions/Zoomies.ts` defines `type=Zoomies`, `yarnCost=2`, `effectType='movement'`, `duration=8s`, `speedMultiplier=2.0`.
- [ ] On summon: cat spawns at target position; immediately creates a 6u-long trigger trail in the player's facing direction.
- [ ] Player overlap with the trail trigger applies a 2× speed multiplier.
- [ ] Speed buff applies only inside the trail zone.
- [ ] Trail persists 8s, then auto-destroys (yarn NOT returned — consumed).
- [ ] Visual: elongated bright glowing zone showing the trail path.
- [ ] Right-click dismiss before expiry returns yarn.
- [ ] `pnpm typecheck` passes.

---

### US-108: Curiosity Cat Implementation
**Description:** As a player, I want to summon a Curiosity Cat that reveals hidden terrain so I can discover secret paths and areas.

**Acceptance Criteria:**
- [ ] `src/game/cats/definitions/CuriosityCat.ts` defines `type=CuriosityCat`, `yarnCost=2`, `effectType='utility'`, `revealRadius=5u`, `revealDuration=20s`.
- [ ] Hidden terrain zones defined in `MapData` as entities with `Renderable` (initially invisible) + `Collider` (initially disabled).
- [ ] On summon: all hidden terrain entities within 5u become visible (shimmer/fade-in) and their colliders activate (walkable).
- [ ] Revealed terrain persists 20s, then fades back to hidden.
- [ ] Event emitted: `HIDDEN_TERRAIN_REVEALED` with affected terrain IDs.
- [ ] Cat remains at summon position during reveal.
- [ ] Auto-dismiss after 20s (yarn consumed); right-click before expiry returns yarn.
- [ ] Test map includes at least one hidden terrain zone (bridge or platform) bridging otherwise inaccessible areas.
- [ ] `pnpm typecheck` passes.

---

### US-109: Pounce Cat Implementation
**Description:** As a player, I want to summon a Pounce cat that launches me upward so I can reach high platforms in one move.

**Acceptance Criteria:**
- [ ] `src/game/cats/definitions/Pounce.ts` defines `type=Pounce`, `yarnCost=3`, `effectType='launch'`, `launchImpulse=3.5u`.
- [ ] On summon: cat entity created with an upward-facing trigger zone on top.
- [ ] Player walking onto the trigger applies a 3.5u upward impulse to player velocity (matches jump impulse — reaches High tier per spec).
- [ ] Launch occurs once per landing — must leave and re-enter to launch again.
- [ ] Pounce cat persists until dismissed (not consumed on use).
- [ ] Right-click dismiss returns yarn.
- [ ] Visual: low wide box with distinct color.
- [ ] Player retains 70% air control during launch.
- [ ] Test map includes elevated platforms reachable via Pounce (~3.5u above the cat's resting height).
- [ ] `pnpm typecheck` passes.

---

### US-110: CatAISystem
**Description:** As a developer, I need a generic system that drives all cat behaviors from their definitions so behavior stays data-driven.

**Acceptance Criteria:**
- [ ] `src/game/ecs/components/CatBehavior.ts` component: `catType`, `state` (Idle | Active | Cooldown | Expired), `stateTimer`, `ownerId`.
- [ ] `src/game/systems/CatAISystem.ts` implements `System`.
- [ ] Each frame: queries `CatBehavior` + `Transform`.
- [ ] State machine per cat: Idle (just placed) → Active (effect running) → Expired (duration elapsed → auto-dismiss).
- [ ] Terrain cats (Loaf, Pounce): stay Active until manually dismissed.
- [ ] Duration cats (Zoomies 8s, Curiosity 20s): timer counts down, auto-dismiss on expiry.
- [ ] System reads behavior config from `CatDefinition` — no cat-specific logic hardcoded in the system.
- [ ] `pnpm typecheck` passes.

---

### US-111: Resource Nodes & Gathering
**Description:** As a player, I want to gather resources from nodes on the map so I feel productive and have materials to progress.

**Acceptance Criteria:**
- [ ] Resource node entities: `Transform`, `Renderable` (distinct shape/color per type), `Collider` (trigger zone for interaction range), `ResourceNode` component (`resourceType`, `gatherTime`, `yieldAmount`, `respawnTime`, `cooldownRemaining`, `isBeingGathered`).
- [ ] `ResourceNode.type`: Grass | Sticks | Water. Per-GDD: `gatherTime` 1.5s/1.5s/2.0s; `yieldAmount` 1; `respawnTime` 30s/45s/60s.
- [ ] Player presses `E` near a ready node → gathering starts (HUD progress bar).
- [ ] Movement or another `E` press during gather cancels (no penalty).
- [ ] Gather complete → resource added to inventory, node enters cooldown (visual: dim/fade), `+1 [Resource]` floats up from node.
- [ ] After cooldown → node restores (visual + gatherable).
- [ ] Test map populated with 8–12 Grass (scattered), 3–5 Sticks (forest zone), 1–2 Water (near water zone).
- [ ] `pnpm typecheck` passes.

---

### US-112: Inventory System
**Description:** As a player, I want an inventory that holds gathered resources with a capacity limit so I make strategic choices about what to carry.

**Acceptance Criteria:**
- [ ] `GameState` (PRD-03) tracks `player.inventory` as an array of `{ resourceType, quantity }` stacks plus `maxCapacity` (default 10).
- [ ] When gathering: if inventory has space → add resource. If full → "Inventory Full" feedback; gathering does not start.
- [ ] Same-type resources stack (not per-slot).
- [ ] Capacity counts total items across all stacks (10 Grass + 5 Sticks = 15 → exceeds cap).
- [ ] HUD inventory display: resource icons with quantities, capacity bar (e.g., "7/10").
- [ ] HUD updates reactively via `GameState.onChange('player.inventory', ...)`.
- [ ] `pnpm typecheck` passes.

---

### US-113: Yarn Economy & HUD
**Description:** As a player, I need a yarn counter in the HUD so I know how many cats I can afford to summon.

**Acceptance Criteria:**
- [ ] `GameState` tracks `player.yarn` (number, starts at 10 for testing).
- [ ] Summoning a cat deducts yarn cost; dismissing returns it (per US-104 rules).
- [ ] HUD shows yarn count with a yarn ball icon.
- [ ] Insufficient yarn for selected cat: ghost preview red, "Not enough yarn" tooltip.
- [ ] Yarn updates reactively when state changes.
- [ ] Test map includes 2–3 yarn pickups that add `+3` yarn when player walks over them.
- [ ] `pnpm typecheck` passes.

---

### US-114: Enhanced HUD
**Description:** As a player, I need a complete HUD showing health, yarn, inventory, oxygen, and active cats so I have full situational awareness.

**Acceptance Criteria:**
- [ ] Health: hearts or health bar (5 hearts default per GDD).
- [ ] Yarn: yarn ball icon + number.
- [ ] Inventory: resource icons with quantities + capacity indicator.
- [ ] Oxygen gauge: visible only while submerged.
- [ ] Active cat bar: icons of summoned cats with right-click dismiss hint.
- [ ] Cat selection: 4 cat types with yarn costs; selected type highlighted.
- [ ] Gather progress: bar appears during gathering, disappears on complete/cancel.
- [ ] All elements at screen edges, not obstructing center gameplay.
- [ ] All elements update reactively via `GameState.onChange()`.
- [ ] `pnpm typecheck` passes.

## Functional Requirements

- FR-1: Water entry must be automatic on player overlap with a water volume — no button press.
- FR-2: Oxygen drains at 1% per 0.3s only while diving, never on the surface.
- FR-3: Health damage (1/s) applies when oxygen reaches 0.
- FR-4: Oxygen fully refills when player exits water.
- FR-5: Cat summon must validate sufficient yarn, under limit (3 for MVP, configurable in `runtimeConfig`), valid position. The Map & Movement System spec defines 3–5 active cats scaling with progression — keep configurable for post-MVP.
- FR-6: Cat-limit-exceeded → oldest active cat auto-dismissed with visual/audio feedback.
- FR-7: Loaf cat must be static (immovable), walkable, and stackable.
- FR-8: Zoomies trail must apply a 2× speed multiplier while player overlaps; persist 8s.
- FR-9: Curiosity Cat must reveal hidden terrain within 5u for 20s.
- FR-10: Pounce cat must apply a 3.5u upward impulse from the cat's resting height (total reach = cat body height + 3.5u apex). The 3-yarn cost is justified by the elevated launch position vs. a free 1.2u base jump.
- FR-11: Resource gathering requires `E` + proximity, configurable time, cancellable by movement. **`E` key context resolution**: priority is (1) Resource node in range → gather, (2) Cat companion in range → bind. Nearest entity wins on ties. The Map & Movement System spec assigns `E` to Bind; this PRD extends it as a shared interaction key.
- FR-12: Inventory capacity limits total items (default 10); prevents gathering when full.
- FR-13: Resource nodes enter timed cooldown after harvest and visually indicate unavailability.

## Non-Goals (Out of Scope)

- No farm buildings or resource deposit system (Phase 3+).
- No leveling, XP, or ability progression (Phase 3+).
- No herding wild cats (different from cat companions — Phase 3+).
- No catnip resource (level 5 per GDD — deferred).
- No gathering tier upgrades (Tier 2/3 — deferred).
- No cat treats crafting.
- No resource node AOE gathering.
- No dash mechanic (Map & Movement System defines Dash at 7.2 u/s — **deferred to post-MVP**; MVP speed bursts come from Zoomies).
- No click-to-move pathfinding for gathering routes (Map & Movement System § 2.1 — **deferred to post-MVP**).

## Technical Considerations

- **`SwimmingState` as component.** Added/removed dynamically via trigger overlap. `MovementSystem` checks component presence — no separate state machine.
- **Cat definitions are pure data.** `CatDefinition` objects contain no logic — just parameters. `CatAISystem` interprets them generically. Critical for extensibility.
- **Trigger zones for cat effects.** Zoomies trail, Pounce launch pad, and Curiosity reveal radius all use `PhysicsEngine` triggers. `CollisionSystem` detects overlaps and emits events.
- **Resource nodes as ECS entities.** Each node is a full entity. A `ResourceSystem` (or inline logic in an `InteractionSystem`) handles gather timing and cooldowns.
- **HUD updates via `GameState.onChange()`.** No polling. State changes emit callbacks. HUD subscribes to specific paths.
- **No new persistence required in this PRD.** All state lives in `GameState` (in-memory). Persistence happens in PRD-03 via the existing `gameRouter.upsertSave` from PRD-01.
- **No three.js imports outside `SceneManager`/`CameraController`.** New systems and managers must respect the FR-5 boundary established in PRD-01.

## Success Metrics

- Swimming transition feels seamless (no visual glitch or position jump at water boundary).
- Oxygen system creates tension without frustration (30s explore window, 20% warning gives time to surface).
- Each cat type feels mechanically distinct.
- Loaf stacking works reliably (2–3 Loafs reach elevated platforms).
- Pounce launch feels satisfying (butt-wiggle → explosive upward motion).
- Resource gathering feels snappy (1.5s base — "instant gratification" per GDD).
- Inventory pressure creates meaningful choices at 10 capacity.
- Player completes a full session loop: gather → manage inventory → use cats to explore → feel productive.

## Open Questions

- Should Zoomies trail extend in the player's facing direction at summon time, or follow the cat's initial movement?
- Should Curiosity Cat reveal terrain in a sphere (3D radius) or cylinder (2D radius + full height)?
- Should resource nodes have interaction range based on player proximity, or require the player to be standing directly on them?
- Should yarn pickups respawn, or are they one-time collectibles?
