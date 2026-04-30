# PRD: Engine Foundation & Player (Phase 0+1)

## Introduction

Build the in-browser game runtime for Cat Herder on top of the existing Next.js 16 + T3 + WorkOS AuthKit + Drizzle/Neon foundation. This phase produces a Three.js + ECS engine that mounts inside the protected `/play` route, plus player movement, isometric camera, character creation, and the database/tRPC plumbing required to persist a character.

The bedrock for everything that follows. Movement feel and engine architecture must be right here, because every later phase builds on these modules.

### Already done — do NOT redo

The following baseline was completed during the project reboot and is the starting point for this PRD:

- **Project scaffolding** — Next.js 16 (App Router) + TypeScript (strict) + Tailwind v4 + tRPC + React Query + superjson, bootstrapped via `create-t3-app` with pnpm. `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm db:push`, `pnpm db:studio` are wired up in `package.json`.
- **WorkOS AuthKit** — `@workos-inc/authkit-nextjs` integrated end-to-end. `src/proxy.ts` (Next.js 16's renamed `middleware.ts`) gates every route except `/` and `/api/trpc/*` behind WorkOS hosted sign-in. `<AuthKitProvider>` wraps the tree in `src/app/layout.tsx`. Server components use `withAuth({ ensureSignedIn: true })`; client components use `useAuth()` from `@workos-inc/authkit-nextjs/components`. The `/auth/callback` route handler is in place. Sign-in / sign-out flows are verified working.
- **Database client** — `@neondatabase/serverless` + `drizzle-orm` configured. `db` is exported from `src/server/db/index.ts` using `drizzle-orm/neon-http`. `drizzle.config.ts` is set up; migrations push via `pnpm db:push`.
- **tRPC scaffold** — `publicProcedure` and `protectedProcedure` exist in `src/server/api/trpc.ts`. `protectedProcedure` already injects the WorkOS user (typed via `UserInfo["user"]`) into context and throws `UNAUTHORIZED` if the user is missing. A sample `post` router exists at `src/server/api/routers/post.ts` and is wired into `appRouter`.
- **Env validation** — `src/env.js` validates `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, and `NEXT_PUBLIC_WORKOS_REDIRECT_URI` via `@t3-oss/env-nextjs`. **Use this file to add new env vars; do not introduce a parallel mechanism.**
- **`/play` route** — `src/app/play/page.tsx` is the protected game route. Currently it renders a placeholder header; the Three.js canvas mounts here.

### Out-of-the-box gaps to close in this PRD

- `three` and `@types/three` are not installed yet.
- No game tables in the Drizzle schema (`src/server/db/schema.ts` has only the placeholder `posts` table).
- No game tRPC router exists yet.
- No ESLint config or `lint` script exists. **`pnpm lint` is required by `CLAUDE.md` as a quality gate.** US-019 below adds it.

## Goals

- Establish a deep-module architecture (small interfaces, complex internals) that is easy to extend.
- Achieve responsive, satisfying player movement (walk, jump with coyote time + buffer).
- Render an isometric 3D scene inside the `/play` page using colored primitives (no art assets needed).
- Add the character/save/debug Drizzle tables and a `game` tRPC router so the browser never speaks to Postgres directly — all persistence flows through `protectedProcedure`.
- Load a test map from a data definition (foundation for the Phase 4 map editor).
- All tuning constants centralized in one config file.

## User Stories

### US-001: Install Three.js & mount the game canvas at `/play`
**Description:** As a developer, I need Three.js installed and a client-only canvas component mounted inside the protected `/play` route so the engine can run in the browser without breaking SSR.

**Acceptance Criteria:**
- [ ] `three` and `@types/three` installed (`pnpm add three && pnpm add -D @types/three`).
- [ ] `src/app/play/_components/GameCanvas.tsx` is a `"use client"` component that owns a `<canvas>` element, sizes it to its parent, and instantiates the `Game` orchestrator (US-017) on mount.
- [ ] `src/app/play/page.tsx` imports `GameCanvas` via `next/dynamic(() => import("./_components/GameCanvas"), { ssr: false })` so Three.js never executes during server rendering.
- [ ] `GameCanvas` calls `game.destroy()` on unmount — no leaked WebGL contexts during HMR or route changes.
- [ ] The `/play` page still uses `withAuth({ ensureSignedIn: true })` and passes the safe subset of the WorkOS `user` (e.g. `{ id, firstName, email }`) down as a prop.
- [ ] `pnpm dev` renders a Three.js scene (colored box on a ground plane) inside `/play` for an authenticated user.
- [ ] `pnpm typecheck` and `pnpm build` pass.

---

### US-002: Core engine types & config
**Description:** As a developer, I need shared type definitions, game event types, and a centralized config file so all modules reference a single source of truth for game constants.

**Acceptance Criteria:**
- [ ] `src/game/types.ts` defines: `GameAction` enum (Jump, Interact, ToggleMap, ToggleDebug, Pause), `CatType` enum (Loaf, Zoomies, CuriosityCat, Pounce), `TerrainType` enum, `GameEvent` discriminated union, `Vector3`-compatible types.
- [ ] `src/game/config.ts` contains all GDD constants: walk speed 4.5 u/s, jump impulse 3.5u, gravity -12 u/s², coyote time 5 frames, jump buffer 5 frames, collision radius 0.4u, accel 0.3s, decel 0.2s, swimming speeds, oxygen rates, camera angles (45° azimuth, 60° elevation), auto-save interval 30s.
- [ ] Config exported as a frozen `CONFIG` const plus a mutable `runtimeConfig` deep-copy for the debug menu.
- [ ] All game source lives under `src/game/` (engine, ecs, systems, ui, maps subfolders) — kept cleanly separate from `src/app/`, `src/server/`, `src/trpc/`.
- [ ] `pnpm typecheck` passes.

---

### US-003: EventBus (typed pub/sub)
**Description:** As a developer, I need a typed event bus so modules communicate without direct coupling.

**Acceptance Criteria:**
- [ ] `src/game/engine/EventBus.ts` implements `emit<T>(event: T)`, `on<T>(type, handler): Unsubscribe`, `off(type, handler)`.
- [ ] Events typed against the `GameEvent` discriminated union from US-002.
- [ ] Multiple listeners per event type supported.
- [ ] `Unsubscribe` returned by `on()` removes that specific listener.
- [ ] Destroyed modules can clean up subscriptions (no leaks across HMR cycles).
- [ ] `pnpm typecheck` passes.

---

### US-004: SceneManager (Three.js isolation boundary)
**Description:** As a developer, I need Three.js isolated behind a single module so no game logic ever imports `three` directly.

**Acceptance Criteria:**
- [ ] `src/game/engine/SceneManager.ts` exposes: `constructor(canvas)`, `addMesh(config): SceneHandle`, `removeMesh(handle)`, `updateTransform(handle, position, rotation, scale)`, `render()`, `resize(width, height)`, `screenToWorld(screenX, screenY): Vector3 | null`, `dispose()`.
- [ ] `MeshConfig` supports geometries `box`, `sphere`, `cylinder`, `plane` plus `size`, `color` (hex string), `castShadow`, `receiveShadow`.
- [ ] Internally creates `THREE.Scene`, `THREE.WebGLRenderer`, `THREE.AmbientLight`, `THREE.DirectionalLight`.
- [ ] Handles `ResizeObserver` / window resize events and device pixel ratio for sharp rendering.
- [ ] `SceneHandle` is opaque — callers cannot reach the underlying `THREE.Object3D`.
- [ ] **Only `src/game/engine/SceneManager.ts` and `src/game/engine/CameraController.ts` may import from `three`.** Enforced by ESLint `no-restricted-imports` (US-019).
- [ ] `dispose()` releases all GPU resources — required for clean HMR / route changes.
- [ ] `pnpm typecheck` passes.

---

### US-005: ECS World, Entity, Component, System base
**Description:** As a developer, I need an Entity-Component-System foundation so all game objects are data-driven and systems operate on component queries.

**Acceptance Criteria:**
- [ ] `src/game/ecs/Entity.ts` — Entity is a numeric ID type alias (not a class).
- [ ] `src/game/ecs/Component.ts` — base component interface with a static type tag for identification.
- [ ] `src/game/ecs/System.ts` — `System` interface with `update(world, dt)`.
- [ ] `src/game/ecs/World.ts` implements `createEntity(): Entity`, `destroyEntity(entity)`, `addComponent<T>(entity, component)`, `removeComponent<T>(entity, type)`, `getComponent<T>(entity, type): T | null`, `query(...types): Entity[]`.
- [ ] `query()` results cached; second call with same component types is O(1). Cache invalidates on add/remove.
- [ ] `pnpm typecheck` passes.

---

### US-006: Core ECS components
**Description:** As a developer, I need core ECS components so entities can have position, visuals, physics, and player control.

**Acceptance Criteria:**
- [ ] `src/game/ecs/components/Transform.ts` — position (x,y,z), rotation (y-axis radians), scale (x,y,z).
- [ ] `src/game/ecs/components/Renderable.ts` — `meshConfig` (from SceneManager), `sceneHandle` (nullable, set by RenderSystem).
- [ ] `src/game/ecs/components/Velocity.ts` — dx, dy, dz (units per second).
- [ ] `src/game/ecs/components/Collider.ts` — shape, size, isStatic, isTrigger, collisionLayer, collisionMask.
- [ ] `src/game/ecs/components/PlayerControlled.ts` — marker with `isGrounded`, `coyoteTimer`, `jumpBufferTimer`.
- [ ] `pnpm typecheck` passes.

---

### US-007: RenderSystem (ECS-to-Three.js bridge)
**Description:** As a developer, I need a system that synchronizes ECS entity transforms to Three.js scene objects each frame.

**Acceptance Criteria:**
- [ ] `src/game/systems/RenderSystem.ts` implements `System`.
- [ ] Each frame: queries `Transform` + `Renderable`. New entities → `sceneManager.addMesh()`, store handle. Existing → `sceneManager.updateTransform()`. Destroyed → `sceneManager.removeMesh()`.
- [ ] No game logic — pure data sync.
- [ ] `pnpm typecheck` passes.

---

### US-008: InputManager
**Description:** As a player, I want responsive keyboard and mouse input so my character reacts immediately to WASD movement, jumping, and other actions.

**Acceptance Criteria:**
- [ ] `src/game/engine/InputManager.ts` exposes `getMovementIntent(): {x, z}` (normalized), `isActionPressed(action)` (single-frame), `isActionHeld(action)`, `getMouseWorldPosition(): Vector3 | null`, `poll()`, `dispose()`.
- [ ] WASD and Arrow Keys produce 8-direction intent; diagonals normalized.
- [ ] Spacebar = Jump (single press), `E` = Interact, `M` = Map, `Ctrl+D` = Debug.
- [ ] Mouse position raycast through `SceneManager.screenToWorld()`.
- [ ] Browser arrow-key scrolling prevented via `e.preventDefault()` on the scoped target.
- [ ] Listeners attach to the `<canvas>` element (not `window`) so they don't fire when the user is interacting with DOM UI; `dispose()` removes them on unmount.
- [ ] `pnpm typecheck` passes.

---

### US-009: PhysicsEngine
**Description:** As a developer, I need a lightweight physics engine for gravity, ground detection, and collision.

**Acceptance Criteria:**
- [ ] `src/game/engine/PhysicsEngine.ts` exposes `addBody(entity, config): BodyHandle`, `removeBody(handle)`, `raycast(origin, direction, maxDist): RaycastHit | null`, `step(dt)`.
- [ ] `BodyConfig`: shape, size, isStatic, isTrigger, collisionLayer, collisionMask.
- [ ] Gravity -12 u/s² on non-static, non-grounded bodies.
- [ ] Ground detection via downward raycast with 0.05u snap tolerance.
- [ ] Circle collision (0.4u radius, 0.1u skin width) with wall-sliding.
- [ ] Triggers detect overlap and emit events via EventBus; static bodies never move.
- [ ] `pnpm typecheck` passes.

---

### US-010: MovementSystem (walk + jump)
**Description:** As a player, I want smooth walking and responsive jumping so controlling my character feels satisfying.

**Acceptance Criteria:**
- [ ] `src/game/systems/MovementSystem.ts` implements `System`.
- [ ] Walk speed 4.5 u/s, accel 0.3s, decel 0.2s — all sourced from `runtimeConfig`.
- [ ] Jump: 3.5u upward impulse on press, 1.2u apex.
- [ ] Air control: 70% horizontal retention.
- [ ] Coyote time 5 frames (~83ms) after walking off edges.
- [ ] Jump buffer 5 frames before landing.
- [ ] Mesh rotates to face 8-direction movement.
- [ ] Reads only from `InputManager` — no direct keyboard access.
- [ ] `pnpm typecheck` passes.

---

### US-011: CameraController (isometric follow)
**Description:** As a player, I want an isometric camera that smoothly follows my character with a slight lead in my movement direction.

**Acceptance Criteria:**
- [ ] `src/game/engine/CameraController.ts` exposes `follow(target: Entity)`, `setMode('follow' | 'free')`, `update(dt)`, `dispose()`.
- [ ] Three.js `OrthographicCamera` at 45° azimuth, 60° elevation.
- [ ] Dynamic 2–3u offset in player facing direction (lerped).
- [ ] Smooth follow with damping; scroll-wheel zoom.
- [ ] Clamps to map boundaries.
- [ ] `free` mode: WASD pans camera (used by Phase 4 map editor).
- [ ] `pnpm typecheck` passes.

---

### US-012: CollisionSystem
**Description:** As a developer, I need per-frame collision detection so entities interact physically with terrain and each other.

**Acceptance Criteria:**
- [ ] `src/game/systems/CollisionSystem.ts` implements `System`.
- [ ] Queries `Transform` + `Collider`.
- [ ] Broad phase: AABB overlap. Narrow phase: circle-circle / circle-box.
- [ ] Pushes non-static bodies apart with skin-width sliding.
- [ ] Trigger overlaps emit events via EventBus (no physics response).
- [ ] Layers/masks respected.
- [ ] `pnpm typecheck` passes.

---

### US-013: Drizzle schema for game tables
**Description:** As a developer, I need the game's persistence tables defined in Drizzle so character, save, and debug data has a typed home.

**Acceptance Criteria:**
- [ ] `src/server/db/schema.ts` adds three tables (using the existing `createTable` factory so the `cat-herder_` prefix is preserved):
  - `characters`: `userId` (varchar 256, **primary key** — one character per WorkOS user for MVP), `shape` (varchar — `box`/`sphere`/`cylinder`), `colorHex` (varchar 7), `sizeScale` (real), `createdAt`, `updatedAt`.
  - `gameSaves`: `userId` (varchar 256, primary key), `version` (varchar — `"0.1"`), `saveData` (`jsonb`), `createdAt`, `updatedAt`.
  - `debugOverrides`: `userId` (varchar 256, primary key), `overrides` (`jsonb`), `updatedAt`. (Reserved for PRD-03 — never applied automatically on load.)
- [ ] **No RLS / `pg_session_jwt` / PostgREST setup.** Authorization is enforced inside tRPC `protectedProcedure` by scoping every query to `ctx.user.id`. This is the deliberate trade vs. the original RLS plan: simpler ops, type-safe queries, and one auth boundary instead of two.
- [ ] `userId` matches the WorkOS `user.id` shape (`user_01XXXXXXXXXXXXXXXXXXXXXXXX`).
- [ ] `pnpm db:push` runs cleanly against the Neon dev database.
- [ ] `pnpm typecheck` passes.

---

### US-014: `game` tRPC router
**Description:** As a developer, I need a `game` tRPC router so the browser engine can read/write character, save, and debug data without ever touching Postgres directly.

**Acceptance Criteria:**
- [ ] `src/server/api/routers/game.ts` exports a `gameRouter` registered in `appRouter` (`src/server/api/root.ts`).
- [ ] All procedures use `protectedProcedure`. Every query/mutation filters by `ctx.user.id` — never trust a `userId` from input.
- [ ] Procedures:
  - `getCharacter()` → returns the caller's character or `null`.
  - `upsertCharacter(input: { shape, colorHex, sizeScale })` → validated by Zod (`shape` enum, `colorHex` hex regex, `sizeScale` 0.5–2.0); upserts row.
  - `getSave()` → returns `{ version, saveData } | null`.
  - `upsertSave(input: { version, saveData })` → upserts; `saveData` validated as a generic JSON object (concrete shape lives in PRD-03).
  - `deleteSave()` → deletes the caller's save row (used by debug menu in PRD-03).
- [ ] Each procedure validates inputs with Zod and returns typed results to the client.
- [ ] `pnpm typecheck` passes; manual round-trip from `/play` confirms read/write.

---

### US-015: Character Creator
**Description:** As a new player, I want to customize my character's shape, color, and size so my avatar feels personal.

**Acceptance Criteria:**
- [ ] `src/app/play/_components/CharacterCreator.tsx` is a client component (React) that renders an HTML overlay with:
  - Shape picker: Block, Sphere, Cylinder (visual preview of each).
  - Color picker: hex input + 8 preset swatches.
  - Size slider: Small (0.8), Medium (1.0), Large (1.2).
  - "Start Game" button.
- [ ] On submit: calls `api.game.upsertCharacter.useMutation()` (tRPC), then dismisses the overlay and signals the engine to spawn the player entity with matching `Renderable` (shape/color/size) at the map spawn point.
- [ ] On `/play` mount: `api.game.getCharacter.useQuery()` decides whether to render the creator (no character) or hand control to the engine (character exists).
- [ ] Character renders in scene as the chosen colored primitive.
- [ ] `pnpm typecheck` passes.

---

### US-016: MapManager & test map
**Description:** As a player, I want to spawn on a test map with varied terrain so I have a world to explore.

**Acceptance Criteria:**
- [ ] `src/game/maps/MapData.ts` defines `MapData`: name, size (width/depth), terrain grid (2D `TerrainCell` array), water zones, spawn points, hidden terrain zones.
- [ ] `TerrainCell`: `type` (grass/dirt/stone/water), `height`, `navigable`.
- [ ] `src/game/maps/MapManager.ts` exposes `loadMap(data)`, `getTerrainAt(x, z)`, `getHeightAt(x, z)`, `getSpawnPoints()`.
- [ ] `loadMap()` creates terrain entities (Transform + Renderable + Collider) rendered as colored planes/boxes per terrain type.
- [ ] `src/game/maps/TestMap.ts` defines a 60×60 unit map with grass (green), dirt (brown), stone (gray), a ~15×15u water zone (blue), 2–3u elevated platforms, player spawn at center, 2 cat spawn points, one hidden terrain area, and boundary walls.
- [ ] Player spawns at the player spawn point.
- [ ] `pnpm typecheck` passes.

---

### US-017: Game orchestrator
**Description:** As a developer, I need a top-level `Game` class that bootstraps all modules and runs the game loop inside the canvas.

**Acceptance Criteria:**
- [ ] `src/game/engine/Game.ts` exposes `constructor(canvas: HTMLCanvasElement, opts: { user: { id: string; firstName?: string }, trpc: GameTrpcAdapter })`, `start(): Promise<void>`, `pause()`, `resume()`, `destroy()`.
- [ ] `start()` initializes modules in order: EventBus → SceneManager → InputManager → PhysicsEngine → World → Systems → CameraController → MapManager → UIManager.
- [ ] Fixed timestep (1/60s physics) with accumulator; rendering interpolates between physics states.
- [ ] Frame order: `InputManager.poll()` → `MovementSystem` → `PhysicsEngine.step()` → `CollisionSystem` → `CameraController.update()` → `RenderSystem` → `UIManager.update()` → `SceneManager.render()`.
- [ ] `destroy()` cancels the rAF loop, disposes SceneManager / InputManager / CameraController, and detaches every listener — required so React StrictMode and HMR don't leak WebGL contexts.
- [ ] `GameTrpcAdapter` is a small interface the orchestrator uses to call the `game` router; the engine never imports from `~/trpc/*` directly so it stays portable. `GameCanvas` constructs the adapter (closing over `api.game.*` mutations) and injects it.
- [ ] Maintains 60 FPS on a dev machine with the test map loaded.
- [ ] `pnpm typecheck` passes.

---

### US-018: Basic HUD shell
**Description:** As a player, I need a minimal HUD showing my basic status so I have feedback during gameplay.

**Acceptance Criteria:**
- [ ] `src/game/ui/UIManager.ts` mounts/unmounts plain DOM panels positioned over the canvas (no React inside the engine — keeps the loop framework-agnostic).
- [ ] `src/game/ui/HUD.ts` renders placeholder hearts and an FPS counter (top-right, only when `process.env.NODE_ENV === "development"`).
- [ ] HUD elements positioned to not obstruct gameplay.
- [ ] `pnpm typecheck` passes.

---

### US-019: ESLint + lint quality gate
**Description:** As a developer, I need `pnpm lint` working so the `CLAUDE.md` quality gate passes and architectural rules can be enforced statically.

**Acceptance Criteria:**
- [ ] ESLint installed with the Next.js config (`pnpm add -D eslint eslint-config-next @typescript-eslint/parser @typescript-eslint/eslint-plugin`) and a flat `eslint.config.js` (or compat shim) at the repo root.
- [ ] `lint` script added to `package.json` (`"lint": "next lint"` or equivalent).
- [ ] `no-restricted-imports` rule blocks importing from `three` outside `src/game/engine/SceneManager.ts` and `src/game/engine/CameraController.ts`.
- [ ] `pnpm lint` passes against the current codebase.

## Functional Requirements

- FR-1: The `/play` route is the single mount point for the game; SSR is disabled for the engine via `next/dynamic({ ssr: false })`.
- FR-2: Authentication is enforced by `src/proxy.ts` middleware + `withAuth({ ensureSignedIn: true })`. The engine does **not** implement its own auth.
- FR-3: All persistence flows through tRPC `protectedProcedure` queries/mutations on `gameRouter`. The browser **never** opens a direct connection to Neon.
- FR-4: All authorization is server-side scoping by `ctx.user.id`. There is no RLS, no `pg_session_jwt`, and no PostgREST.
- FR-5: Three.js may be imported only by `SceneManager` and `CameraController`. Enforced by ESLint `no-restricted-imports`.
- FR-6: All game objects are ECS entities with component-based data.
- FR-7: Player movement uses WASD/Arrow Keys for 8-direction input at 4.5 u/s with 0.3s accel, 0.2s decel.
- FR-8: Jump applies 3.5u upward impulse with 1.2u apex, 70% air control, 5-frame coyote time, 5-frame jump buffer.
- FR-9: Gravity applies at -12 u/s² to airborne entities.
- FR-10: Circle collision (0.4u radius, 0.1u skin width) produces wall sliding.
- FR-11: Camera smoothly follows player with 2–3u dynamic lead in facing direction.
- FR-12: Character creator offers Block/Sphere/Cylinder shapes, hex color, and Small/Medium/Large sizes; persisted via `game.upsertCharacter`.
- FR-13: Test map is 60×60 units with grass/dirt/stone terrain, water zone, elevated platforms, and boundary walls.
- FR-14: Game loop uses fixed 1/60s timestep with interpolated rendering.
- FR-15: `Game.destroy()` is fully reentrant — `destroy()` then `start()` again leaks no resources.

## Non-Goals (Out of Scope)

- No resource gathering, inventory, or farm systems (Phase 2).
- No cat companion system (Phase 2–3).
- No swimming mechanics (Phase 2).
- No save/load of game state (Phase 3) — only character appearance is persisted here.
- No debug menu (Phase 3).
- No map editor (Phase 4).
- No mobile/touch input.
- No audio / sound effects.
- No click-to-move or A* pathfinding.
- No dash mechanic.
- No art assets or 3D models — colored primitives only.
- No re-implementation of auth, env validation, tRPC bootstrap, or the Drizzle/Neon client — those exist.

## Technical Considerations

- **Three.js isolation.** `SceneManager` and `CameraController` are the only files allowed to import `three`. `RenderSystem` is the only ECS system that calls `SceneManager`. This keeps Three.js swappable.
- **Engine in `src/game/`, not the App Router.** Keep the engine framework-agnostic. The only Next.js-coupled files are `src/app/play/page.tsx` (server component) and `src/app/play/_components/GameCanvas.tsx` / `CharacterCreator.tsx` (client components). The engine receives an injected `GameTrpcAdapter` so it never imports from `~/trpc/*`.
- **No SSR for the engine.** Three.js requires a real DOM/WebGL context. Mount via `next/dynamic({ ssr: false })`.
- **`process.env.NODE_ENV`, not `import.meta.env.DEV`.** Vite-isms do not apply on Next.js. Use `process.env.NODE_ENV === "development"` for dev-only branches.
- **HMR safety.** The dev server tears down components frequently. `Game.destroy()` and matching `dispose()` methods on `SceneManager`, `InputManager`, `CameraController`, and EventBus subscribers are required to avoid leaking WebGL contexts and event listeners.
- **ECS query caching.** With ~100+ entities on the test map, uncached queries would be expensive at 60 FPS.
- **Fixed timestep.** Physics and movement run at fixed 1/60s; rendering interpolates for smooth visuals on variable-refresh displays.
- **Config as runtime copy.** `config.ts` exports a frozen `CONFIG` and a mutable `runtimeConfig`. Systems read `runtimeConfig`. The Phase 3 debug menu mutates it.
- **Persistence path.** Use the tRPC React client (`api.game.*.useQuery()` / `useMutation()`) from React components; from inside the engine, use a thin injected adapter that the canvas wires up at construction time. This keeps the engine free of React and tRPC imports.

## Success Metrics

- Player movement feels responsive and satisfying ("weighted but not sluggish").
- Jump with coyote time + buffer feels forgiving (players rarely miss intended jumps).
- Camera follow is smooth (no jitter, slight lead feels natural).
- Character creation persists across sessions (create once, play many times).
- `pnpm build` succeeds with no errors and no console warnings on `/play`.
- Consistent 60 FPS with test map loaded on a dev machine.

## Open Questions

- What's the exact `OrthographicCamera` frustum size for the isometric view? Tune based on how much of the 60×60 map should be visible.
- Should the ground plane use a single large plane mesh or individual tiles? (Performance vs visual variety tradeoff.)
- Should `GameCanvas` show a loading state while `getCharacter` is in flight, or render the creator optimistically?
- Should `characters` be one-row-per-user (current proposal) or allow multiple? MVP says one; revisit if loadouts/skins ship later.
