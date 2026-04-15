# Cat Herder - Game Design Document (MVP)

**Version**: 0.2  
**Last Updated**: 2026-04-14  
**Scope**: MVP (Character Creation → Playable Session Loop)  
**Status**: Design Phase

---

## 1. Design Pillars

The game must deliver these core experiences in MVP, in priority order:

1. **Satisfying Resource Gathering** - The player feels productive; each action yields visible reward
2. **Farm as Expression** - The farm is *their* farm; it grows and changes based on decisions
3. **Intentional Progression** - Each level/ability unlock enables new gameplay possibilities (not just power)
4. **Zen Engagement** - Gameplay is forgiving, repeatable, and stress-free (Stardew Valley tone)

---

## 2. Core Gameplay Loop (MVP)

### Moment-to-Moment (0-30 seconds)
**Action**: Player moves character to a resource node (bush, water, wild cat) and interacts.

**Feedback**:
- Visual: Resource floats from node to player, number populates in UI ("+5 Grass")
- Audio: Soft collection chime
- Feel: Immediate, no wait—instant gratification

**Output**: Resource added to inventory; resource node enters cooldown (respawns in 30–60 seconds based on resource type)

**Design Note**: This is the core verb. Everything else supports it. If this doesn't feel good, nothing else matters.

---

### Session Loop (15–30 minutes)

**Goal Structure**:
1. Player enters map with empty inventory
2. Gathers resources from scattered nodes for 15–20 minutes
3. Returns to farm building or storage to deposit resources
4. Sees farm state change (new building unlocked, cat visibly happier, progress bar advances)
5. Repeats or logs off with sense of progress

**Tension**: Inventory is limited (capacity: `[PLACEHOLDER - test 10 vs. 20 slots]`). Player must choose:
- Gather more of one resource type, or diversify?
- Cash in resources now, or continue gathering?
- Return to farm to unlock new building, or maximize this session's haul?

**Resolution**:
- **Win**: Deposit resources → farm upgrades → unlock new area or ability → "one more session" hook
- **Lose**: Never feels like failure in MVP (no combat, no death, no bankruptcy)

**Session End Hook**: Display next unlock that's 80% complete. "Gather 20 more grass and unlock Herding Pen!"

---

### Long-Term Loop (Sessions → Story Arc)

**Progression Gating**:
1. Resource accumulation unlocks farm buildings (Barn → Pen → Herding Yard)
2. Farm buildings unlock character abilities (Herding, Taming, Speed Boost)
3. Character abilities reveal new map areas (shallow water → deep fishing hole)
4. New areas offer premium resources → unlock rare buildings → visual farm transformation

**Character Level** (`[PLACEHOLDER]` max level 10 for MVP):
- Levels gained by accumulating a resource sink (e.g., every 100 total resources gathered = +1 level)
- Level-ups grant ability point (1 pt per level-up) to unlock/upgrade abilities
- No mandatory stat scaling; abilities drive power progression

**Retention Hook**: 
- Daily login bonus (small resource) — establishes habit
- Visual farm progression (visible building animation, cat animations) — satisfying payoff

---

## 3. Progression System

### Character Levels

| Level | Total Resources Gathered (Cumulative) | Ability Points | Narrative Milestone |
|-------|---------------------------------------|----------------|---------------------|
| 1     | 0                                     | 1              | Apprentice Herder   |
| 2     | 100                                  | 1              | —                   |
| 3     | 250                                  | 1              | —                   |
| 4     | 450                                  | 1              | —                   |
| 5     | 700                                  | 1              | Journeyman Herder   |
| 6     | 1000                                 | 1              | —                   |
| 7     | 1350                                 | 1              | —                   |
| 8     | 1750                                 | 1              | —                   |
| 9     | 2200                                 | 1              | —                   |
| 10    | 2700                                 | 1              | Master Herder       |

**Tuning Notes**: 
- Curve is quadratic-ish to slow progression as players advance (intentional pacing)
- `[PLACEHOLDER]` - playtest to ensure level 5 is reached in 3–4 sessions, level 10 in 2–3 weeks of casual play
- Each milestone level (5, 10) unlocks a new map area or special building

### Attributes (Derived from Abilities)

Attributes are **not** manually assigned; they flow from ability loadout. This keeps character creation simple.

| Attribute      | Source                          | MVP Default | Purpose                |
|----------------|---------------------------------|-------------|------------------------|
| Speed          | Movement ability tier           | 4.5 u/s     | Walk/run speed (per Map & Movement System spec) |
| Carrying Cap   | Inventory ability tier          | 10 slots    | Max inventory slots    |
| Gather Speed   | Gathering ability tier          | 1.0x        | Time to collect resource |
| Herding Range  | Herding ability tier            | 3.0m        | Detect cats in radius  |
| Taming Potency | Taming ability tier             | Base        | Relationship gain/pet  |

**Design Rationale**: Attributes as derivatives mean balancing abilities is the only tuning required. Engineers don't hardcode stats separately.

---

## 4. Abilities System (Extensible Framework)

### Ability Tiers (Progression)
Each ability has 3 tiers in MVP. Unlocking requires ability points.

```
Tier 1 (Cost: 1 AP) → Base effect
Tier 2 (Cost: 1 AP) → Effect +30% / +15% cooldown reduction / +1 range
Tier 3 (Cost: 1 AP) → Effect +50% / +25% cooldown reduction / specialized bonus
```

### Core Abilities (MVP Launch Set)

#### 1. Gathering (Always Owned)
**Purpose**: Core resource collection mechanic  
**Player Fantasy**: "I'm a skilled farmer; I gather more per action"  
**Mechanics**:
- Tier 1: Gathering takes 1.5s per node; base yield = resource value × 1.0
- Tier 2: Gathering takes 1.2s per node; yield = resource value × 1.3
- Tier 3: Gathering takes 1.0s per node; yield = resource value × 1.6; AOE gather (2-node radius, 50% efficiency)

**Input**: Player holds interaction button on resource node  
**Output**: Resource added to inventory after animation/cooldown  
**Cooldown**: Node is unavailable for 30–60s after collect (varies by resource type, see Resource System)  
**Tuning Levers**: gather_time, yield_multiplier, aoe_radius, node_cooldown  
**Edge Cases**:
- What if inventory is full? (Fail state: node untouchable until inventory has space)
- What if player moves away during gather? (Animation cancels, no penalty)

---

#### 2. Herding (Unlocked at Level 3)
**Purpose**: Attract wild cats to farm for passive resources  
**Player Fantasy**: "The cats trust me; I can call them home"  
**Mechanics**:
- Tier 1: Detect wild cats in 3m radius; call emits sound, cats move toward herder (0.5m/s) for 3s, then idle
- Tier 2: Radius 4m; cats move at 0.7m/s; cats follow for 5s before idling (allows herding to pen)
- Tier 3: Radius 5m; cats move at 1.0m/s; cats enter "Herding" state (can be guided to buildings)

**Input**: Player activates ability (button press) → cats in range respond  
**Output**: Cats pathfind toward herder; if guided to Herding Pen building, cat is "captured" and generates passive resource (see Farm System)  
**Cooldown**: 8 seconds between ability activations (`[PLACEHOLDER]` - feel test if 8s is too punishing)  
**Tuning Levers**: detection_radius, movement_speed, follow_duration, cooldown, attraction_strength  
**Dependencies**: Herding Pen building must exist on farm for capture reward  

---

#### 3. Inventory Expansion (Unlocked at Level 2)
**Purpose**: Increase carrying capacity without bloat  
**Player Fantasy**: "I'm a better organizer; I carry more"  
**Mechanics**:
- Tier 1: Capacity +5 slots (from 10 → 15)
- Tier 2: Capacity +5 slots (from 15 → 20)
- Tier 3: Capacity +5 slots (from 20 → 25); inventory sorting UI unlock

**Input**: Spend ability point to unlock tier  
**Output**: Max slots increase immediately; any inventory reorg triggers save  
**Tuning Notes**: Only 3 tiers in MVP; no expansion beyond level 3. Prevents "infinite carrying" balance breaks.

---

#### 4. Movement Speed (Unlocked at Level 1)
**Purpose**: Reduce traversal friction as players explore larger maps  
**Player Fantasy**: "I'm faster on the farm"  
**Mechanics**:
- Tier 1: Base speed +20% (4.5 → 5.4 u/s)
- Tier 2: Base speed +35% (4.5 → 6.075 u/s)
- Tier 3: Base speed +50% (4.5 → 6.75 u/s); sprint ability unlock (hold `Shift` for 2x speed, 5s max, 10s cooldown)

**Tuning Notes**: Movement speed is feel-critical. Base speed 4.5 u/s is canonical (per Map & Movement System spec). `[PLACEHOLDER]` - test at different speeds to ensure farm size matches locomotion pacing.

**Note on Dash vs Sprint**: The Map & Movement System spec defines a Dash at 7.2 u/s as a future base ability. For MVP, speed bursts are gated behind Tier 3 sprint (progression-based). Dash as a base ability is deferred to post-MVP. See Map & Movement System § 2.1.

---

### Ability Struct (Engineering Reference)

```
Ability:
  id: string (e.g., "gathering", "herding", "movement")
  name: string
  description: string
  unlocked_at_level: int
  current_tier: int (1-3)
  max_tier: int
  cooldown_remaining: float (seconds)
  cooldown_base: float (seconds)
  
  effects: {
    tier_1: { parameters... }
    tier_2: { parameters... }
    tier_3: { parameters... }
  }
  
  on_activate(): void
  on_tick(delta_time): void
  get_current_effect(): EffectData
```

---

## 5. Resource & Farm System

### Resource Types (MVP Set)

| Resource    | Icon | Description                     | Base Gather Time | Node Cooldown | Building Cost | Notes                           |
|-------------|------|---------------------------------|------------------|---------------|-----------|---------------------------------|
| Grass       | 🌿   | Common plant; cat food           | 1.5s             | 30s           | —         | Everywhere; unlimited nodes     |
| Sticks      | 🪵   | Wood scraps; construction        | 1.5s             | 45s           | —         | Forest/edge; 5–8 per session    |
| Water       | 💧   | Fresh water; cat health          | 2.0s (standing) | 60s           | 5 Grass + 3 Sticks | Pond area; limited access      |
| Catnip      | 🍃   | Premium resource; cat happiness  | 2.5s             | 120s          | 10 Grass + 5 Sticks | Rare spawn; unlocked at L5      |
| Cat Treats  | 🐟   | Crafted; speeds taming           | —                | —             | Crafting recipe | Unlocked after first pen built  |

**Design Rationale**: 
- Grass is ubiquitous (no resource scarcity frustration)
- Sticks/Water gate farm progression (players must diversify gathering)
- Catnip/Treats are prestige resources (long-term engagement)
- No infinite loops: all resources have gathering time ≥ 1.5s

### Farm Building System (MVP Scope)

**Buildings are unlocked by resource deposit totals, not purchased.**

| Building       | Unlock Condition            | Gives to Farm | Passive Output | Notes |
|----------------|---------------------------|--------------|--------|-------|
| Shelter        | Start of game (free)       | Visual style | None | Home base; cats idle here |
| Barn           | Deposit 30 Grass + 10 Sticks | +1 cat spawn | +0.5 Grass/min per cat | Doubles wild cat spawn rate |
| Herding Pen    | Deposit 50 Grass + 20 Sticks + 10 Water | Cat housing | +1 Cat Relationship/min | Captured cats generate happiness |
| Herding Yard   | Deposit 100 Grass + 50 Sticks + 25 Water | Training area | Unlock Herding Tier 3 | Unlocks advanced herding ability |

**Design Rationale**:
- No currency (no economy edge cases in MVP)
- Buildings unlock via milestones (clear player goals)
- Each building adds visual charm to farm (player expression)
- Passive outputs are modest (grinding optional, not mandatory)

### Farm State Data Model

```
Farm:
  buildings: {
    [building_id]: {
      type: string ("barn", "pen", "yard")
      position: (x, y, z)
      level: int (always 1 in MVP)
      cats_inside: [cat_id, ...]
      last_harvest_time: timestamp
    }
  }
  
  cats_on_map: {
    [cat_id]: {
      name: string
      position: (x, y, z)
      state: enum ("wild", "herding", "captured")
      relationship: float (0-100)
      last_location: building_id (null if wild)
    }
  }
  
  total_resources_gathered: int (cumulative for leveling)
  session_start_time: timestamp
```

---

## 6. Character Customization (MVP)

**Scope**: Appearance only. Stats are ability-driven (see Progression System).

### Character Creator Flow

1. **Choose Shape**: Circle, Square, Triangle (3 options)
   - *Why*: Easy to animate, clear silhouettes, no uncanny valley
2. **Choose Color**: Palette of 8 colors (warm, cool, neutral tones)
   - *Why*: Personality without needing rigged models
3. **Choose Size**: Small, Medium, Large (3 options)
   - *Mechanical Effect*: None in MVP (purely cosmetic)
   - *Why*: Kept for future use (size could affect speed or reach); flag for expansion

**Data Model**:
```
Character:
  appearance: {
    shape: enum ("circle", "square", "triangle")
    color_hex: string
    size_scale: float (0.8, 1.0, 1.2)
  }
  
  stats: {
    level: int
    experience: int
    abilities: [Ability, ...]
    attributes: { ... } (derived from abilities)
  }
  
  inventory: {
    slots: [ResourceStack, ...]
    max_capacity: int
  }
  
  position: (x, y, z)
  facing: float (radians)
```

---

## 7. Map & World (MVP Scope)

### Map Layout

```
      [Forest - Sticks Spawn]
           |
      [Shelter] ← Home Base
     /    |    \
[Grass] [Water] [Catnip Area]
        [Pond]   (Unlocked L5)
```

**Dimensions**: `[PLACEHOLDER - 50u x 50u grid; test if too large/small for 20min session]` (Note: use "units" not "meters" for consistency with Map & Movement System spec. All traversal calculations in the Balance Spreadsheet use this 50u baseline.)

**Spawn Rules**:
- Grass nodes: 8–12 scattered randomly, respawn 30s after collect
- Stick nodes: 3–5 in forest area, respawn 45s
- Water node: 1 (pond), respawn 60s
- Catnip nodes: 2 (hidden, unlocked at L5), respawn 120s

**Wild Cat Spawning**:
- 2 cats spawn at start in wilderness (not near Shelter)
- 1 additional cat spawns per 5 minutes of play (soft cap at 8 cats)
- Cats idle in random spots; herd-able with Herding ability

---

## 8. Debug Menu Features

### Dev-Only Interface (In-Game Overlay)

**Character Development**:
- [ ] Set Level (0–10)
- [ ] Set Experience (0–2700)
- [ ] Unlock/Lock specific abilities
- [ ] Set ability tiers (1–3 per ability)
- [ ] Set inventory capacity (5–50 slots)
- [ ] Teleport to map location (XYZ input)
- [ ] Spawn character appearance variations on demand

**Economy/Resources**:
- [ ] Add resource to inventory (dropdown + quantity input)
- [ ] Clear inventory
- [ ] Max all resources (debug shortcut)
- [ ] Log current resource gather rates (per minute)
- [ ] Toggle infinite inventory (no capacity limit)

**Map/World**:
- [ ] Spawn/Despawn wild cats (+ name + position)
- [ ] Spawn/Despawn resource nodes
- [ ] Toggle resource node respawn timers (instant vs. normal)
- [ ] Trigger building unlock (dropdown of buildings)
- [ ] Teleport to map areas (preset locations)
- [ ] Toggle fog of war/visibility helpers

**Gameplay Tweaks (Hot Tuning)**:
- [ ] Adjust gather_time multiplier (0.5x–3.0x slider)
- [ ] Adjust movement_speed multiplier (0.5x–2.0x)
- [ ] Adjust cooldown multiplier (all abilities)
- [ ] Set time scale (0.5x–2.0x for fast playtesting)
- [ ] Toggle herding line-of-sight helpers (debug visualization)

**Session & Progression**:
- [ ] Reset character to level 1 (keep appearance)
- [ ] Save/Load named profiles (e.g., "test_herding_T3")
- [ ] Log current session stats (resources gathered/min, time played, level progress %)

### UI Overlay Format
- Toggle with `Ctrl+D` (in-game only, hidden in production builds)
- Semi-transparent dark panel (top-left corner, non-intrusive)
- Organized in collapsible tabs: Character | Resources | Map | Tweaks | Session

**Engineering Note**: All debug values write to a session log for analysis (do not persist to save file).

---

## 9. Data Model & Persistence

### Save File Structure

```json
{
  "version": "0.1",
  "character": {
    "appearance": { "shape": "circle", "color": "#FF6B9D", "size_scale": 1.0 },
    "stats": {
      "level": 3,
      "total_resources_gathered": 450,
      "abilities": [
        { "id": "gathering", "tier": 2, "unlocked": true },
        { "id": "movement", "tier": 1, "unlocked": true },
        { "id": "herding", "tier": 0, "unlocked": false }
      ],
      "ability_points_available": 1
    },
    "inventory": {
      "items": [
        { "resource_id": "grass", "quantity": 8 },
        { "resource_id": "water", "quantity": 2 }
      ],
      "max_capacity": 15
    }
  },
  "farm": {
    "buildings": {
      "shelter": { "type": "shelter", "position": [25, 25, 0], "cats_inside": [] },
      "barn": { "type": "barn", "position": [30, 25, 0], "cats_inside": ["cat_001", "cat_003"] }
    },
    "cats": {
      "cat_001": { "name": "Whiskers", "position": [30, 28, 0], "state": "captured", "relationship": 45 }
    },
    "unlocked_buildings": ["shelter", "barn"]
  },
  "session": {
    "started_at": "2026-04-14T14:30:00Z",
    "total_playtime_minutes": 45
  }
}
```

### Persistence Strategy
- **Auto-save**: Every 30 seconds during play
- **On-Exit Save**: Full dump when player closes game
- **Backup**: Keep last 2 save files (overwrite cycle) to prevent corruption
- **Location**: `.../user_data/saves/` directory (one save file per character slot)

---

## 10. First Playable Checklist (MVP Verification)

- [ ] Character creator works; appearance persists in-game
- [ ] Player spawns on test map; can move freely
- [ ] At least 2 resource types scatter on map
- [ ] Interact with resource → collected into inventory
- [ ] Inventory UI displays current resources
- [ ] Resource node respawns after cooldown
- [ ] Leveling math works: gather resources, see XP accumulate, watch level increase at thresholds
- [ ] Ability unlock screen shows available abilities based on level
- [ ] Unlock an ability (e.g., Herding) → cooldown timer is active
- [ ] Debug menu opens/closes cleanly; tweaks persist in session
- [ ] Save file is written on exit; can reload character with same stats/position/inventory
- [ ] Game runs at 60 FPS (or target framerate) on dev machine
- [ ] No console errors on clean startup

---

## 11. Known Placeholders & Tuning Needs

| Placeholder                       | Reason                                   | Tuning Process                                            |
|-----------------------------------|------------------------------------------|----------------------------------------------------------|
| Inventory capacity (10 slots)     | Feel-critical; affects gathering rhythm | Playtest at 10, 15, 20; measure session length impact   |
| Herding cooldown (8 seconds)      | Feel-critical; affects ability usage    | Playtest feel; should feel frequent but not spammable   |
| Gather time (1.5s base)           | Feel-critical; must feel snappy         | Compare 1.0s vs 1.5s vs 2.0s side-by-side               |
| Node respawn times (30-60s)       | Affects resource availability           | Playtest if farming feels grindy or too scarce          |
| Level 5 unlock milestone          | Should occur ~session 3-4                | Track level progression across first 10 playtests       |
| Map size (50m x 50m)              | Affects traversal feel                  | Compare 30x30 vs 50x50 vs 80x80 for optimal pacing      |
| Catnip spawn rate (unlocked L5)   | Should feel rare but achievable         | Ensure 5-10 catnip gathered by level 10                 |

---

## 12. Design Reconciliation Notes

### Cat Companion System vs Cat Herding System

This GDD describes two distinct cat-related systems that will need reconciliation post-MVP:

1. **Cat Herding** (GDD §§ 4-5): Wild cats are herded to farm buildings for passive resource generation. Cats have relationship scores, states (wild/herding/captured), and names. Driven by the Herding ability.
2. **Cat Companions** (Map & Movement System § 4): Cats are summoned with yarn as puzzle/traversal tools. Each has a unique ability (Loaf, Zoomies, Curiosity Cat, Pounce, etc.). Driven by yarn economy.

**MVP scope follows the Cat Companion system** (PRD-02). The Herding/Farm/Building progression from this GDD is deferred to post-MVP phases.

**Open design question**: How do these systems coexist long-term? Possible approaches:
- Herded wild cats could become "unlocked" companion types in the roster
- Farm buildings could reduce yarn costs for specific companion types
- Companion cats and herded cats could be entirely separate systems (different gameplay loops)

This reconciliation should be resolved before the Herding ability is implemented.

---

## 13. Out of Scope (Post-MVP)

These features are **not** included in MVP but are mentioned for roadmap clarity:

- [ ] Combat or damage mechanics
- [ ] NPC dialogue or story sequences
- [ ] Multiplayer or social features
- [ ] Advanced crafting (recipes beyond Cat Treats)
- [ ] Seasonal systems or daily quests
- [ ] Leaderboards or competitive progression
- [ ] Console/controller support (keyboard + mouse only for MVP)
- [ ] Accessibility options (beyond colorblind palette consideration)
- [ ] Base Dash mechanic (7.2 u/s, `Shift` + direction) — deferred; MVP uses Tier 3 sprint instead
- [ ] Mouse click-to-move / A* pathfinding — deferred per PRD-02

---

## 14. Design Decisions & Rationales

### Why no currency/economy in MVP?

**Decision**: Resources are stored directly; no "currency conversion" step.

**Rationale**: 
- Reduces state complexity (no "player gold" separate from inventory)
- Prevents early economy balance breaks
- Keeps progression linear and predictable
- Lowers cognitive load for new players

**Expansion**: Post-MVP can introduce currency as a resource type with conversion rules.

---

### Why are stats ability-driven, not level-derived?

**Decision**: Abilities unlock → attributes change. No hardcoded "level 3 = +10 damage" scaling.

**Rationale**:
- Abilities are designer-transparent (change ability, attribute scales automatically)
- Playtesting is iterative (tuning one ability file vs. touching stat tables everywhere)
- Expansion scales naturally (add new ability → new attribute combinations possible)

---

### Why no skill trees in MVP?

**Decision**: Linear ability progression (unlock by level; tier up with points).

**Rationale**:
- Reduces decision paralysis (no "optimal path" analysis needed)
- Keeps first-time player onboarding simple
- All players reach same endpoint (balance testable)
- Post-MVP can introduce branching trees without breaking current progression

---

### Why make farm buildings passive income sources?

**Decision**: Captured cats generate passive resources (no active management required).

**Rationale**:
- Avoids "daily chore" feeling (optional engagement, not mandatory)
- Rewards long-term planning (building Pen → payoff over multiple sessions)
- Reduces session friction (gather actively OR check farm passively)

---

## 15. Version History

| Version | Date       | Changes                                           | Author |
|---------|------------|---------------------------------------------------|--------|
| 0.1     | 2026-04-14 | Initial MVP design document                       | GDD    |
| 0.2     | 2026-04-14 | Cross-document consistency pass: aligned base speed to 4.5 u/s (per Map & Movement System), recalculated movement tier progression, added Dash/click-to-move deferral notes, added cat system reconciliation section, renumbered sections | Consistency Review |

---

## 16. Next Steps

1. **Engineering**: Build data model from Section 9; implement auto-save
2. **Engineering**: Integrate debug menu (Section 8); ensure hot-tuning works
3. **Prototype**: Build character creator and first playable session (gather 1 resource, level up)
4. **Playtest**: Run 3 sessions with unfamiliar players; measure feel (gather_time, cooldowns, movement speed)
5. **Iterate**: Adjust `[PLACEHOLDER]` values based on playtest feedback; document changes in version history
6. **Balance Pass**: Once all features are implemented, run economy simulation (see Section 5); validate progression curve

