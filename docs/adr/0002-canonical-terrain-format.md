# ADR-0002: Canonical terrain[][] format as single source of truth

**Date**: 2026-06-29
**Status**: Accepted
**Deciders**: #14 planning

## Context

The `MapData` type accumulated three overlapping ways to express spatial data:
1. `terrain[][]` — a full per-cell grid (type, height, navigable).
2. `blocks[]` — per-cell overrides intended for the MapEditor.
3. `waterZones[]` / `hiddenTerrainZones[]` — rectangular zone arrays.

`MapManager.loadMap()` only ever consumed `terrain[][]`. The other three were serialized by the MapEditor but never read back by MapManager or any system. They persisted as dead schema weight.

Separately, `resourceNodes` and `yarnPickups` were optional fields never populated in `TestMap.ts`; instead, `Game.ts` contained hardcoded spawner methods (`spawnTestMapResourceNodes`, `spawnTestMapYarnPickups`) that encoded positions as inline arithmetic. This coupled the game bootstrap to a specific map and made resource layout invisible to map data.

## Decision

1. **`terrain[][]` is the single source of truth.** Remove `blocks[]`, `waterZones[]`, and `hiddenTerrainZones[]` from the `MapData` type and Zod schema. Water cells are `TerrainType.Water` cells; hidden cells are `TerrainType.Hidden` cells. Add an optional `depth?` number to `TerrainCell` to preserve semantic water-depth data without a separate zone array.

2. **`terrain[row][col]` orientation is canonical.** Row indexes Z (north→south), col indexes X (west→east), consistent with `coords.ts` (`worldToCell` returns `{col, row}`).

3. **`resourceNodes` and `yarnPickups` are required map fields.** They are part of a map's definition, not engine bootstrapping code. `MapDataResourceNode` and `MapDataYarnPickup` interfaces remain unchanged; only their optionality is promoted to required.

4. **`respawnTime` on `MapDataResourceNode` is kept.** It overrides the type-level `RESOURCE_CONFIGS` default, allowing per-instance tuning. If the field equals `RESOURCE_CONFIGS[type].respawnTime`, the behaviour is identical.

5. **Cooldown ids stay `node_${x}_${z}`.** The generic spawner uses the same template string as the old hardcoded spawner, so existing persisted saves decode correctly without migration.

## Consequences

**Positive**
- MapData is now self-describing: loading a map JSON gives the full picture without reading Game.ts.
- Removing three dead array types shrinks the schema surface.
- Map-driven spawning makes it trivial to add or modify resource/yarn layouts by editing map data rather than engine code.
- Non-empty + rectangular terrain validation at schema parse time surfaces malformed maps early.

**Negative / risks**
- Any existing serialized MapData JSON files that contain `blocks`, `waterZones`, or `hiddenTerrainZones` fields will fail schema validation. Mitigation: the only serialized map in the repo is TestMap (hand-authored in TypeScript, not JSON); the MapEditor serializer must be updated to omit the removed fields.
- `resourceNodes` and `yarnPickups` become required, breaking any test or fixture that constructs a bare `MapData` object. Mitigation: update all test fixtures to include the fields (even as empty arrays).

## Alternatives considered

### Keep `blocks[]` alongside `terrain[][]`
Rationale would be to let the MapEditor express per-cell overrides without rebuilding the full grid. Rejected because MapManager never read `blocks[]` — it is dead code. The MapEditor can re-export a complete `terrain[][]` instead.

### Sparse cell map (Map<string, TerrainCell>)
A `Map<"col,row", TerrainCell>` would store only non-default cells, reducing file size for sparse maps. Rejected because (a) dense grids are simpler to validate for rectangularity, (b) the greedy-rectangle merger in `buildZones` already handles large uniform zones efficiently, and (c) array indexing is O(1) vs hash lookup.

### Keep `waterZones[]` for depth data only
Would avoid adding `depth?` to `TerrainCell`. Rejected because it reintroduces a parallel data structure for a single optional number, and current WaterSystem does not use depth at all — `depth?` on TerrainCell is lower coupling.
