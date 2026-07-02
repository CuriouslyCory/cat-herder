# ADR-0003: Save-codec as single owner of the save-data shape

**Date**: 2026-07-02
**Status**: Accepted
**Deciders**: #28 planning

## Context

Adding one saved field previously meant editing four places that had to stay in lockstep:

1. `GameState.serialize()` / `GameState.restore()` — internal `{ player, world }` shape.
2. The hand-written converters `toExternalSaveData()` / `fromExternalSaveData()` in
   `src/game/state/Persistence.ts`.
3. The Zod `saveDataSchema` object literal in `src/game/state/SaveData.ts`.
4. The non-position dirty-path list `NON_POSITION_PATHS`, also in `Persistence.ts`.

Missing one of these silently produced a field that saves but never restores, or never marks
the save dirty. There was no test that would fail if a field were declared on only one side.

## Decision

1. **`SaveCodec.SAVE_FIELDS` (`src/game/state/SaveCodec.ts`) is the single source of truth
   for the save-data shape.** Each entry declares a field's internal path, external path,
   Zod schema, and dirty-tracking classification exactly once, in the exact order the
   external shape must serialize in.

2. **Everything else is derived, not hand-maintained in parallel:**
   - `encode()` / `decode()` replace the hand-written `toExternalSaveData()` /
     `fromExternalSaveData()` converters (re-exported from `Persistence.ts` under their
     original names for call-site and test-import stability).
   - `buildSaveDataSchema()` replaces the hand-written Zod object literal in `SaveData.ts`;
     `saveDataSchema = buildSaveDataSchema()` is now derived, grouping `SAVE_FIELDS` by
     top-level external section into nested `z.object`s.
   - `NON_POSITION_DIRTY_PATHS` replaces the hand-written `NON_POSITION_PATHS` list, by
     flattening every field's non-position dirty paths in declaration order.
   - `POSITION_DIRTY_PATH` (`"player.position"`) is exported once for `Persistence`'s
     separately-throttled subscription.

3. **The external `{ character, world, session }` shape is FROZEN and byte-compatible with
   pre-#28 saves — no migration.** `CURRENT_VERSION` stays `"0.1"`; `MIGRATIONS` stays
   empty. `JSON.stringify` of an emitted save is byte-identical before vs after this change:
   same keys, same nesting, same key *insertion order*. This is proven by the executable
   test `src/game/__tests__/state/SaveCodec.test.ts` (`describe("byte-compatibility", ...)`),
   which locks both key membership and insertion order against the pre-#28 hand-authored
   literal, and must keep passing as new fields are added.

4. **Shape changes now go through `CURRENT_VERSION` + `MIGRATIONS`, never by editing the
   external key layout in place.** If a saved field's external name, nesting, or position
   in a section must change, bump `CURRENT_VERSION`, add a migration function in
   `migrations.ts`, and only then change the corresponding `SAVE_FIELDS` entry.

5. **Two intentional asymmetries are codified in the descriptor list, not left as
   incidental converter behavior:**
   - The `resourceNodes` (internal) ↔ `resourceNodeCooldowns` (external) rename is a single
     `SaveField` entry with differing `internalPath` / `externalPath`.
   - `session.totalPlaytimeMs` has `internalPath: null` and `encodeConstant: 0`: `encode()`
     always writes `0` (not sourced from state); `decode()` skips fields with a null
     internal path entirely, so `session` never enters `GameState`. This mirrors the
     pre-#28 behavior where `toExternalSaveData` hard-coded `{ totalPlaytimeMs: 0 }` and
     `fromExternalSaveData` dropped `session`.

6. **The `node_${x}_${z}` cooldown-id convention (ADR-0002 §5) is unaffected.** The codec
   treats `nodeId` as an opaque string; the spawner in `Game.ts` that generates these ids is
   untouched.

## Consequences

**Positive**
- One list to update when adding a saved field; the round-trip test in `SaveCodec.test.ts`
  fails if a field is wired up on only the internal or only the external side.
- The dirty-set test fails if a field's throttling classification is wrong (e.g. position
  misclassified as non-position, or a new field forgotten from dirty tracking entirely).
- `SaveData.ts` and `Persistence.ts` no longer contain a hand-maintained field list; a
  reviewer can grep for `z.object` literals in `SaveData.ts` or a `NON_POSITION_PATHS`
  literal in `Persistence.ts` and confirm neither survives.

**Negative / risks**
- `buildSaveDataSchema()`'s runtime construction (grouping a `Map` by section) is
  statically typed via mapped types over the `SAVE_FIELDS` tuple rather than being directly
  inferred; this requires one explicit, documented type assertion at the end of that
  function. The exact schema shape is still verified by the schema-equivalence tests.
- `SaveCodec.ts` imports the `SaveData` external type from `SaveData.ts` as a type-only
  import specifically to avoid a runtime import cycle with `SaveData.ts` (which imports
  `buildSaveDataSchema` from `SaveCodec.ts` at runtime). Type-only imports are erased at
  compile time, so no runtime cycle exists, but this ordering constraint must be preserved
  by future edits.

## Alternatives considered

### Keep the hand-written converters/schema/dirty-list, add a lint rule or codegen check
Would require a custom lint rule (e.g. AST-based) cross-referencing four files, or a
codegen step. Rejected as more machinery than a single declarative list plus a round-trip
test, for the same guarantee.

### Derive the internal `GameState.SaveData` shape from `SAVE_FIELDS` too
Would fully unify all four representations, including `GameState`'s internal `PlayerState`
/ `WorldState` interfaces. Rejected for this issue: `GameState.serialize()` /
`GameState.restore()` and the path-based `get`/`set`/`onChange` API are out of scope, and
collapsing them risks behavior changes to the reactive store beyond the stated
"byte-compatible refactor" goal. `SAVE_FIELDS.internalPath` already documents the mapping
into that shape; a future issue could revisit deriving `GameState`'s types from it.
