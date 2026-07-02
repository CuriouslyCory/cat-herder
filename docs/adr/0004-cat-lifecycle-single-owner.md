# ADR-0004: Single lifecycle owner for the Cat Companion

**Date**: 2026-07-02
**Status**: Accepted
**Deciders**: #26 planning

## Context

The Cat Companion lifecycle — summon → active → (expiry) → despawning → destroyed, plus cap
eviction, the yarn-refund rule, and the despawn animation phase — was spread across four owners:

1. `CatAISystem` — flipped `CatBehavior.state` (`Idle → Active → Expired`).
2. Per-cat systems (`ZoomiesSystem`, `CuriositySystem`, `PounceSystem`) — each detected `Expired`
   and called `CatCompanionManager.dismiss()` (Curiosity via a private `pendingDismiss` queue,
   deferred until its terrain-fade animation finished).
3. `CatCompanionManager.dismiss()` — teardown + yarn refund.
4. `VisualEffectsSystem._updateScaleAnimations` — fired `world.destroyEntity()` when the cat's
   scale-down tween finished.

"Why didn't my cat disappear?" was a four-file trace, and no unit test could prove a cat actually
dies without wiring all four systems together.

## Decision

`CatCompanionManager` is now the single lifecycle owner. It owns every state transition, the
expiry timer, the yarn-refund rule, the despawn animation phase, and the final
`world.destroyEntity()` call. Per-cat systems are pure effects: they read lifecycle state through
the `CatStateView` seam (`src/game/cats/CatLifecycle.ts`) — `getCatState()`, `isActive()`,
`holdDespawn()`, `releaseDespawn()` — and apply their effect (speed trail, terrain reveal, pounce
launch). None of them call `dismiss()`, call `world.destroyEntity()`, or branch on the literal
string `"Expired"` against a raw `CatBehavior` read.

Curiosity's "fade the revealed terrain before the cat disappears" behavior, previously a private
`pendingDismiss` queue inside `CuriositySystem`, is now the ref-counted `holdDespawn()` /
`releaseDespawn()` affordance on `CatStateView`: `CuriositySystem` places a hold when it starts the
terrain fade and releases it when the fade completes; `CatCompanionManager` only despawns an
`Expired` cat once it has no outstanding hold.

`CatBehavior.state` gained a `"Despawning"` value for `CatStateView.getCatState()` to report while
an entity is mid-teardown, but it is never written into the component's own `state` field —
`beginDespawn()` removes the whole `CatBehavior` component (as `dismiss()` always did), and
`"Despawning"` is synthesized from the owner's private `despawning` timer map.

### The two-phase driver (why there are two entry points, not one)

`CatCompanionManager` exposes two methods, called at two different points in each fixed tick:

- **`update(dt)`** — runs FIRST, at the exact frame position `CatAISystem` used to occupy (before
  the per-cat effect systems). It advances `Idle → Active → Expired` and decrements/destroys
  entities in the despawn-timer countdown.
- **`flushExpirations()`** — runs LAST, after `ZoomiesSystem` / `CuriositySystem` / `PounceSystem`
  have run for that same tick. It begins despawn (`beginDespawn`) for any `Expired` cat with no
  active hold.

A single `update(dt)` call cannot do both jobs without changing observable timing. If despawn-start
were folded into the same call as the `Active → Expired` transition, a holdless cat (Zoomies) would
begin despawning the tick it expires — correct — but a cat that gains a hold (Curiosity) would need
that hold to already exist *before* the state transition runs, which is impossible: the hold is
placed by `CuriositySystem`, which itself needs to observe `Expired` first. Splitting the check to
run after the per-cat effect systems reproduces the legacy ordering exactly:

- **Holdless cats (Zoomies)**: legacy `ZoomiesSystem` called `dismiss()` the instant it saw
  `Expired`, in the same tick `CatAISystem` set it (per-cat systems ran right after `CatAISystem`).
  `flushExpirations()` runs later in that same tick, finds no hold, and begins despawn — same-tick
  parity preserved.
- **Held cats (Curiosity)**: legacy `CuriositySystem` deferred dismissal into a private queue the
  tick it saw `Expired`, and called `dismiss()` synchronously, inside its own `update()`, the
  instant the terrain fade finished. `CuriositySystem` now releases the hold at that same point;
  `flushExpirations()` (still later in the same tick) sees no hold and begins despawn — same-tick
  parity preserved.

This is the accepted design cost of consolidating ownership without changing observable behavior:
`CatCompanionManager` has two call sites in `Game.ts`'s frame loop instead of one, each documented
with why it must sit where it does.

## Preservation record (the checkpoint)

- **Zoomies / Curiosity / Pounce gameplay is unchanged.** Effect math (speed multiplier + oriented
  AABB overlap, reveal radius + `FADE_SPEED` fade curve, launch impulse + once-per-landing) was
  copied verbatim; only the state read and the dismiss/despawn trigger moved behind `CatStateView`.
  Guarded by the migrated system tests (`ZoomiesSystem.test.ts`, `CuriositySystem.test.ts`,
  `PounceSystem.test.ts`).
- **Despawn-start timing is tick-for-tick identical to the legacy four-system pipeline, for BOTH
  held and holdless cats** — not merely "imperceptibly different." This was a hard constraint for
  this slice (stricter than an earlier draft of this plan, which had accepted a 1-tick delay for
  holdless cats as a fallout of a single-call `update(dt)` design). The two-phase driver above
  closes that gap. Guarded by
  `src/game/__tests__/cats/CatCompanionManager.exact-tick-timing.test.ts`, which drives the full
  per-tick sequence (`update` → effects → `flushExpirations`) for both a holdless (Zoomies) and a
  held (Curiosity) cat and asserts despawn begins on the exact same tick as expiry (holdless) or
  hold-release (held) — never one tick later.
- **Active-cat save restore, including the yarn pre-fund/refund dance, is unchanged.**
  `_restoreActiveCats()` in `Game.ts`, `CatCompanionManager.summon()` / `dismiss()` /
  `isValidPosition()` / `getActiveCompanions()` signatures and semantics are untouched. Guarded by
  `src/game/__tests__/integration/load-restore.test.ts`.
- **The external save shape (`world.activeCats` in `SaveCodec`) and the `node_${x}_${z}`
  resource-node cooldown convention (ADR-0002 §5) are untouched** — no resource-node code was
  touched by this refactor.

## Consequences

- The lifecycle is unit-testable in isolation: `CatCompanionManager.lifecycle.test.ts` drives
  summon → expire → refund → destroy and the hold affordance with zero per-cat systems wired.
- `CatScaleAnimation.destroyOnComplete` is retired; `VisualEffectsSystem` only tweens
  `Transform.scale{X,Y,Z}` and removes the component on completion — it never calls
  `world.destroyEntity()` for a cat.
- `CatAISystem` is deleted; its state-machine assertions live on in
  `CatCompanionManager.lifecycle.test.ts`.
- Two call sites (`update(dt)`, `flushExpirations()`) replace one (`CatAISystem.update()`) in
  `Game.ts`'s frame loop — a deliberate, documented trade to keep timing byte-for-byte identical
  while still consolidating ownership into a single class.
