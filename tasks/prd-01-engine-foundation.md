# PRD: Engine Foundation & Player (Phase 0+1)

## Introduction

Build the technical foundation for Cat Herder: a Vite + Three.js + TypeScript game engine with ECS architecture, player movement, isometric camera, character creation, WorkOS authentication, and Neon DB persistence infrastructure. This phase produces a playable prototype where a character moves around a test map with responsive controls.

This is the bedrock — every subsequent phase builds on these modules. Getting movement feel and engine architecture right here prevents costly rework later.

## Goals

- Establish a deep-module architecture (small interfaces, complex internals) that is easy to extend
- Achieve responsive, satisfying player movement (walk, jump with coyote time + buffer)
- Render an isometric 3D scene using colored primitives (no art assets needed)
- Authenticate users via WorkOS AuthKit (client-only flow)
- Set up Neon DB with schema and RLS policies for secure per-user data
- Load a test map from a data definition (foundation for map editor later)
- All tuning constants centralized in one config file

## User Stories

### US-001: Project Scaffolding
**Description:** As a developer, I need a properly configured Vite + TypeScript + Three.js project so that I have a working dev environment with linting, type checking, and hot reload.

**Acceptance Criteria:**
- [ ] `pnpm create vite` with TypeScript template, configured for the project
- [ ] `three` and `@types/three` installed as dependencies
- [ ] `tsconfig.json` with strict mode enabled
- [ ] ESLint configured with TypeScript rules
- [ ] Prettier configured for consistent formatting
- [ ] `pnpm dev` starts dev server and renders a basic Three.js scene (colored box on a ground plane)
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` all pass
- [ ] `.env.example` created with placeholder env vars: `VITE_WORKOS_CLIENT_ID`, `VITE_WORKOS_REDIRECT_URI`, `VITE_NEON_DATA_API_URL`

---

### US-002: Core Engine Types & Config
**Description:** As a developer, I need shared type definitions, game event types, and a centralized config file so that all modules reference a single source of truth for game constants.

**Acceptance Criteria:**
- [ ] `src/types.ts` defines: `GameAction` enum (Jump, Interact, ToggleMap, ToggleDebug, Pause), `CatType` enum (Loaf, Zoomies, CuriosityCat, Pounce), `TerrainType` enum, `GameEvent` union type (typed discriminated union for all events), `Vector3`-compatible types
- [ ] `src/config.ts` contains all GDD constants: movement speeds (walk 4.5 u/s), jump impulse (3.5u), gravity (-12 u/s^2), coyote time (5 frames), jump buffer (5 frames), collision radius (0.4u), acceleration (0.3s ramp-up), deceleration (0.2s ramp-down), swimming speeds, oxygen rates, camera angles (45deg azimuth, 60deg elevation), auto-save interval (30s)
- [ ] Config exported as `const` with a runtime mutable copy for debug menu use
- [ ] `pnpm typecheck` passes

---

### US-003: EventBus (Typed Pub/Sub)
**Description:** As a developer, I need a typed event bus so that modules communicate without direct coupling.

**Acceptance Criteria:**
- [ ] `src/engine/EventBus.ts` implements: `emit<T>(event: T)`, `on<T>(type, handler): Unsubscribe`, `off(type, handler)`
- [ ] Events are type-safe — TypeScript enforces correct event shapes at call sites
- [ ] Supports multiple listeners per event type
- [ ] `Unsubscribe` function returned by `on()` removes that specific listener
- [ ] No memory leaks — destroyed modules can clean up subscriptions
- [ ] `pnpm typecheck` passes

---

### US-004: SceneManager (Three.js Isolation)
**Description:** As a developer, I need Three.js isolated behind a single module so that no game logic ever imports from `three` directly.

**Acceptance Criteria:**
- [ ] `src/engine/SceneManager.ts` exposes: `constructor(canvas)`, `addMesh(config): SceneHandle`, `removeMesh(handle)`, `updateTransform(handle, position, rotation, scale)`, `render()`, `resize(width, height)`, `screenToWorld(screenX, screenY): Vector3 | null`
- [ ] `MeshConfig` type supports geometry types: `box`, `sphere`, `cylinder`, `plane`; plus `size`, `color` (hex string), `castShadow`, `receiveShadow`
- [ ] Internally creates `THREE.Scene`, `THREE.WebGLRenderer`, `THREE.AmbientLight`, `THREE.DirectionalLight`
- [ ] Handles window resize events (updates renderer size and camera aspect)
- [ ] Handles device pixel ratio for sharp rendering
- [ ] `SceneHandle` is an opaque type — callers cannot access the underlying `THREE.Object3D`
- [ ] No other file in `src/` imports from `three` except `SceneManager.ts` and `CameraController.ts`
- [ ] `pnpm typecheck` passes

---

### US-005: ECS Foundation
**Description:** As a developer, I need an Entity-Component-System foundation so that all game objects are data-driven and systems operate on component queries.

**Acceptance Criteria:**
- [ ] `src/ecs/Entity.ts` — Entity is a numeric ID (not a class with methods)
- [ ] `src/ecs/Component.ts` — Base component type/interface
- [ ] `src/ecs/System.ts` — System interface with `update(world, dt)` method
- [ ] `src/ecs/World.ts` — implements: `createEntity(): Entity`, `destroyEntity(entity)`, `addComponent<T>(entity, component)`, `removeComponent<T>(entity, componentType)`, `getComponent<T>(entity, type): T | null`, `query(...componentTypes): Entity[]`
- [ ] Query results are cached — second call with same component types is O(1)
- [ ] Cache invalidated when components are added/removed
- [ ] Core components created: `Transform` (position, rotation, scale), `Renderable` (meshConfig, sceneHandle), `Velocity` (dx, dy, dz), `Collider` (shape, size, isStatic, isTrigger, layer, mask), `PlayerControlled` (marker + input state)
- [ ] All components in `src/ecs/components/` directory
- [ ] `pnpm typecheck` passes

---

### US-006: RenderSystem (ECS-to-Three.js Bridge)
**Description:** As a developer, I need a system that synchronizes ECS entity transforms to Three.js scene objects each frame.

**Acceptance Criteria:**
- [ ] `src/systems/RenderSystem.ts` implements `System` interface
- [ ] Each frame: queries entities with `Transform` + `Renderable`
- [ ] For new entities (no `sceneHandle` yet): calls `sceneManager.addMesh()` using `Renderable.meshConfig`, stores handle
- [ ] For existing entities: calls `sceneManager.updateTransform()` with current `Transform` values
- [ ] For destroyed entities: calls `sceneManager.removeMesh()` to clean up
- [ ] No game logic in this system — pure data sync
- [ ] `pnpm typecheck` passes

---

### US-007: InputManager
**Description:** As a player, I want responsive keyboard and mouse input so that my character reacts immediately to WASD movement, jumping, and other actions.

**Acceptance Criteria:**
- [ ] `src/engine/InputManager.ts` exposes: `getMovementIntent(): {x: number, z: number}` (normalized vector), `isActionPressed(action: GameAction): boolean` (true on the frame action was pressed), `isActionHeld(action: GameAction): boolean` (true while held), `getMouseWorldPosition(): Vector3 | null`, `poll()` (called once per frame to update state)
- [ ] WASD and Arrow Keys produce 8-directional movement intent
- [ ] Diagonal movement normalized to unit length (no faster diagonal movement)
- [ ] Jump (`Spacebar`) registers as single press (not continuous while held)
- [ ] Interact (`E`) registers as single press
- [ ] Map toggle (`M`) registers as single press
- [ ] Debug toggle (`Ctrl+D`) registers as single press
- [ ] Mouse position raycasted to world-space ground plane via `SceneManager.screenToWorld()`
- [ ] Browser default scroll on arrow keys prevented (`e.preventDefault()`)
- [ ] `pnpm typecheck` passes

---

### US-008: PhysicsEngine
**Description:** As a developer, I need a lightweight physics engine for gravity, ground detection, and collision so that the player interacts physically with the world.

**Acceptance Criteria:**
- [ ] `src/engine/PhysicsEngine.ts` exposes: `addBody(entity, config): BodyHandle`, `removeBody(handle)`, `raycast(origin, direction, maxDist): RaycastHit | null`, `step(dt)` (called once per frame)
- [ ] `BodyConfig`: shape (`box` | `sphere` | `cylinder`), size (Vector3), isStatic (bool), isTrigger (bool), collisionLayer (number), collisionMask (number)
- [ ] Gravity applied at -12 u/s^2 to non-static, non-grounded bodies
- [ ] Ground detection via downward raycast with 0.05u snap tolerance (per GDD spec)
- [ ] Circle collision (radius 0.4u per spec) with 0.1u skin width for wall sliding
- [ ] Trigger volumes (isTrigger=true) detect overlap but don't block movement — emit events via EventBus
- [ ] Static bodies (terrain, walls) never move
- [ ] `pnpm typecheck` passes

---

### US-009: MovementSystem (Walk + Jump)
**Description:** As a player, I want smooth walking and responsive jumping so that controlling my character feels satisfying.

**Acceptance Criteria:**
- [ ] `src/systems/MovementSystem.ts` implements `System` interface
- [ ] Walk speed: 4.5 u/s (from `config.ts`)
- [ ] Acceleration: 0.3s ramp-up from 0 to walk speed
- [ ] Deceleration: 0.2s ramp-down from walk speed to 0
- [ ] Jump: 3.5u upward impulse on Spacebar press, 1.2u apex height
- [ ] Air control: 70% horizontal movement retention while airborne
- [ ] Coyote time: player can still jump for 5 frames (~83ms) after walking off an edge
- [ ] Jump buffer: if Spacebar pressed within 5 frames before landing, jump executes on land
- [ ] Character rotation: sprite/mesh faces movement direction (8-directional)
- [ ] Movement reads from `InputManager.getMovementIntent()` — no direct keyboard access
- [ ] All constants sourced from `config.ts` runtime copy (debug-tunable)
- [ ] `pnpm typecheck` passes

---

### US-010: CameraController (Isometric Follow)
**Description:** As a player, I want an isometric camera that smoothly follows my character with a slight lead in my movement direction.

**Acceptance Criteria:**
- [ ] `src/engine/CameraController.ts` exposes: `follow(target: Entity)`, `setMode(mode: 'follow' | 'free')`, `update(dt)` (called each frame)
- [ ] Uses Three.js `OrthographicCamera` positioned at 45deg azimuth, 60deg elevation (per GDD spec)
- [ ] Dynamic offset: camera leads 2-3 units in the player's facing direction (lerped smoothly)
- [ ] Smooth follow with damping (no jitter, no snapping)
- [ ] Scroll wheel adjusts zoom level
- [ ] Camera clamps to map boundaries (doesn't show void beyond map edges)
- [ ] `free` mode: WASD moves camera directly (for map editor use later)
- [ ] `pnpm typecheck` passes

---

### US-011: CollisionSystem
**Description:** As a developer, I need per-frame collision detection so that entities interact physically with terrain and each other.

**Acceptance Criteria:**
- [ ] `src/systems/CollisionSystem.ts` implements `System` interface
- [ ] Queries entities with `Transform` + `Collider`
- [ ] Broad phase: AABB overlap detection to find candidate pairs
- [ ] Narrow phase: circle-circle or circle-box resolution
- [ ] Collision response: pushes non-static bodies apart (wall sliding with skin width)
- [ ] Trigger overlaps detected and emitted via EventBus (no physics response)
- [ ] Collision layers/masks respected (e.g., player collides with terrain but not with UI triggers)
- [ ] `pnpm typecheck` passes

---

### US-012: Character Creator
**Description:** As a new player, I want to customize my character's shape, color, and size so that my avatar feels personal.

**Acceptance Criteria:**
- [ ] `src/ui/CharacterCreatorUI.ts` renders an HTML overlay with:
  - Shape picker: Block, Sphere, Cylinder (3 options, visual preview of each)
  - Color picker: hex color input or palette of 8+ preset colors
  - Size slider: Small (0.8), Medium (1.0), Large (1.2)
  - "Start Game" button
- [ ] `src/game/CharacterCreator.ts` takes chosen appearance → creates player entity with matching `Renderable` (shape/color/size) and `Transform` at map spawn point
- [ ] Character appearance saved to Neon DB `characters` table on creation
- [ ] On subsequent logins, character loaded from DB (skip creator)
- [ ] Character renders in scene as colored Three.js primitive matching chosen options
- [ ] `pnpm typecheck` passes

---

### US-013: WorkOS Authentication
**Description:** As a user, I want to sign in with my account so that my character and progress are saved.

**Acceptance Criteria:**
- [ ] `@workos-inc/authkit-react` installed and configured
- [ ] `src/main.ts` wraps app in `<AuthKitProvider clientId={...} redirectUri={...}>`
- [ ] `src/App.ts` acts as auth gate: unauthenticated → title screen with "Sign In" button; authenticated → game
- [ ] `src/modules/auth/AuthModule.ts` wraps WorkOS hook: `signIn()`, `signOut()`, `getUser(): AuthUser | null`, `getToken(): Promise<string>`
- [ ] Sign in redirects to WorkOS Hosted UI, returns with valid JWT
- [ ] JWT `sub` claim used as user identity for all DB operations
- [ ] Session persists across page refresh (HttpOnly cookie refresh token)
- [ ] Sign out clears session and returns to title screen
- [ ] `pnpm typecheck` passes

---

### US-014: Neon DB Setup
**Description:** As a developer, I need the database schema deployed with RLS so that user data is securely isolated.

**Acceptance Criteria:**
- [ ] Neon project created with PostgreSQL database
- [ ] `drizzle/schema.ts` defines tables: `characters` (user_id, shape, color_hex, size_scale, timestamps), `game_saves` (user_id, version, save_data JSONB, timestamps), `debug_overrides` (user_id, overrides JSONB)
- [ ] `drizzle.config.ts` configured for Neon connection
- [ ] `drizzle/rls-policies.sql` enables RLS on all tables with `user_id = auth.user_id()` policies
- [ ] `pg_session_jwt` extension enabled for JWT auth
- [ ] WorkOS JWKS URL configured in Neon dashboard
- [ ] `src/modules/persistence/NeonClient.ts` implements `fetch()`-based DB access: `upsert(table, data)`, `select<T>(table, query?)`, `delete(table, query?)`
- [ ] All requests include `Authorization: Bearer <jwt>` from AuthModule
- [ ] Schema deployed via `pnpm drizzle-kit push`
- [ ] Verified: can read/write character data from browser with auth token
- [ ] `pnpm typecheck` passes

---

### US-015: MapManager & Test Map
**Description:** As a player, I want to spawn on a test map with varied terrain so that I have a world to explore.

**Acceptance Criteria:**
- [ ] `src/maps/MapData.ts` defines `MapData` interface: name, size (width/depth), terrain grid (2D array of `TerrainCell`), water zones, spawn points, hidden terrain zones
- [ ] `TerrainCell`: type (grass/dirt/stone/water), height (float), navigable (bool)
- [ ] `src/game/MapManager.ts` exposes: `loadMap(data: MapData)`, `getTerrainAt(x, z): TerrainType`, `getHeightAt(x, z): number`, `getSpawnPoints(): SpawnPoint[]`
- [ ] `loadMap()` creates terrain entities with `Transform`, `Renderable`, `Collider` — rendered as colored planes/boxes per terrain type
- [ ] `src/maps/TestMap.ts` defines a 60x60 unit map with: grass zones (green), dirt zone (brown), stone area (gray), water zone (blue, ~15x15u), elevated platforms (2-3u high), player spawn at center, 2 cat spawn points, hidden terrain area (invisible until Curiosity Cat reveals), map boundary walls
- [ ] Player spawns at the map's player spawn point
- [ ] Different terrain types are visually distinct (different colors)
- [ ] `pnpm typecheck` passes

---

### US-016: Game Orchestrator
**Description:** As a developer, I need a top-level Game class that bootstraps all modules and runs the game loop.

**Acceptance Criteria:**
- [ ] `src/engine/Game.ts` exposes: `constructor(canvas: HTMLCanvasElement)`, `start(): Promise<void>`, `pause()`, `resume()`
- [ ] `start()` initializes all modules in correct dependency order: EventBus → SceneManager → InputManager → PhysicsEngine → World → all Systems → CameraController → MapManager → UIManager
- [ ] Game loop uses fixed timestep (1/60s physics step) with accumulator pattern and interpolation for rendering
- [ ] Frame update order: InputManager.poll() → MovementSystem → PhysicsEngine.step() → CollisionSystem → CameraSystem → RenderSystem → UIManager → SceneManager.render()
- [ ] `pause()` stops the loop; `resume()` restarts it
- [ ] Performance: maintains 60 FPS on dev machine with test map loaded
- [ ] `pnpm typecheck` passes

---

### US-017: Basic HUD Shell
**Description:** As a player, I need a minimal HUD showing my basic status so I have feedback during gameplay.

**Acceptance Criteria:**
- [ ] `src/ui/UIManager.ts` manages mounting/unmounting UI panels over the Three.js canvas
- [ ] `src/ui/HUD.ts` renders: health display (placeholder hearts), FPS counter (top-right, dev builds only)
- [ ] HUD is plain DOM (no React) — updated via `UIManager.update(dt)`
- [ ] HUD elements positioned to not obstruct gameplay
- [ ] `pnpm typecheck` passes

## Functional Requirements

- FR-1: The game must render an isometric 3D scene using Three.js with OrthographicCamera at 45deg azimuth / 60deg elevation
- FR-2: Player movement must use WASD/Arrow Keys for 8-directional input at 4.5 u/s walk speed with 0.3s acceleration and 0.2s deceleration
- FR-3: Jump must apply 3.5u upward impulse with 1.2u apex, 70% air control, 5-frame coyote time, and 5-frame jump buffer
- FR-4: Gravity must apply at -12 u/s^2 to airborne entities
- FR-5: Circle collision (0.4u radius, 0.1u skin width) must produce wall sliding, not hard stops
- FR-6: Camera must smoothly follow player with 2-3u dynamic lead in facing direction
- FR-7: Three.js must be isolated behind SceneManager — no game logic module imports `three`
- FR-8: All game objects must be ECS entities with component-based data
- FR-9: Character creator must offer Block/Sphere/Cylinder shapes, hex color, and Small/Medium/Large sizes
- FR-10: Authentication must use WorkOS AuthKit client-only flow (no backend server)
- FR-11: Database must use Neon Data API with RLS — all tables enforce `user_id = auth.user_id()`
- FR-12: Test map must be 60x60 units with grass/dirt/stone terrain, water zone, elevated platforms, and boundary walls
- FR-13: Game loop must use fixed timestep (1/60s) with interpolated rendering

## Non-Goals (Out of Scope)

- No resource gathering, inventory, or farm systems (Phase 2)
- No cat companion system (Phase 2-3)
- No swimming mechanics (Phase 2)
- No save/load of game state (Phase 3) — only character appearance is persisted
- No debug menu (Phase 3)
- No map editor (Phase 4)
- No mobile/touch input
- No audio/sound effects
- No click-to-move or A* pathfinding
- No dash mechanic
- No art assets or 3D models — colored primitives only

## Technical Considerations

- **Three.js isolation**: `SceneManager` is the boundary. `RenderSystem` is the only ECS system that calls SceneManager. This ensures Three.js can be swapped or upgraded without touching game logic.
- **ECS query caching**: `World.query()` must cache results for performance. With ~100+ entities on the test map (terrain tiles + player + spawn markers), uncached queries would be expensive at 60fps.
- **Fixed timestep**: Physics and movement use fixed dt (1/60s). Rendering interpolates between physics states for smooth visuals on variable-refresh displays.
- **Config as runtime copy**: `config.ts` exports a frozen `CONFIG` const and a mutable `runtimeConfig` copy. Systems read `runtimeConfig`. Debug menu (Phase 3) will mutate `runtimeConfig`.
- **Neon Data API**: All DB access via `fetch()` against PostgREST endpoint. No ORM in the browser bundle. Drizzle Kit is devDependency only for schema migrations.
- **WorkOS JWKS**: Neon validates JWTs via WorkOS JWKS URL (`https://api.workos.com/sso/jwks/<clientId>`). This must be configured in Neon dashboard before Data API calls work.

## Success Metrics

- Player movement feels responsive and satisfying (acceleration curves feel "weighted but not sluggish")
- Jump with coyote time + buffer feels forgiving (players rarely miss intended jumps)
- Camera follow is smooth (no jitter, slight lead feels natural)
- Auth flow completes in under 5 seconds (redirect → back in game)
- Character creation persists across sessions (create once, play many times)
- `pnpm build` produces <500KB JS bundle (excluding Three.js)
- Consistent 60 FPS with test map loaded

## Open Questions

- Should we use React for the auth boundary only (AuthKitProvider) and plain DOM for all game UI? (Current plan: yes)
- What's the exact OrthographicCamera frustum size for the isometric view? Needs tuning based on how much of the 60x60 map should be visible.
- Should the ground plane use a single large plane mesh or individual tiles? (Performance vs visual variety tradeoff)