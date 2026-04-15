# Cat Herder - Balance & Tuning Spreadsheet (MVP)

**Last Updated**: 2026-04-14  
**Status**: Placeholders for playtest validation

---

## 1. Gathering Economy

### Resource Gather Time Matrix

| Resource | Base Gather Time (s) | Tier 1 Gathering | Tier 2 Gathering | Tier 3 Gathering | Notes |
|----------|----------------------|------------------|------------------|------------------|-------|
| Grass    | 1.5s                 | 1.5s (1.0x)      | 1.2s (0.8x)      | 1.0s (0.67x)     | Most abundant |
| Sticks   | 1.5s                 | 1.5s (1.0x)      | 1.2s (0.8x)      | 1.0s (0.67x)     | Forest area |
| Water    | 2.0s                 | 2.0s (1.0x)      | 1.6s (0.8x)      | 1.3s (0.65x)     | Limited; pond only |
| Catnip   | 2.5s                 | 2.5s (1.0x)      | 2.0s (0.8x)      | 1.7s (0.68x)     | Rare; L5+ only |

**Interpretation**: Time to collect from single node. Tier 2 Gathering reduces time by 20%; Tier 3 by ~33%.

---

### Resource Yield Matrix

| Resource | Base Yield | Tier 1 Gathering | Tier 2 Gathering | Tier 3 Gathering + AOE | Notes |
|----------|------------|------------------|------------------|------------------------|-------|
| Grass    | 1          | 1                | 1.3              | 1.6 (+ 0.8 from 2nd node) | Highest volume |
| Sticks   | 1          | 1                | 1.3              | 1.6 (+ 0.8 from 2nd node) | Lower spawn rate |
| Water    | 1          | 1                | 1.3              | 1.6 (+ 0.8 from 2nd node) | Scarcest |
| Catnip   | 1          | 1                | 1.3              | 1.6 (+ 0.8 from 2nd node) | Prestige |

**Interpretation**: 
- Tier 1 = baseline (no multiplier)
- Tier 2 = +30% per node
- Tier 3 = +60% per node + can grab 2nd nearby node at 50% efficiency
- Example: Tier 3 Gathering on Grass node → 1.6 units, plus AOE pickup of adjacent node for 0.8 units = 2.4 total

---

## 2. Node Spawn & Respawn

### Respawn Timer Configuration

| Resource | Respawn Time (s) | Nodes Per Session | Span Per Session (min) | Rationale |
|----------|------------------|-------------------|------------------------|-----------|
| Grass    | 30               | Unlimited         | 20–30                  | Ubiquitous; no scarcity |
| Sticks   | 45               | 5–8 (15 per map)  | 10–15                  | Gating resource; slower cycle |
| Water    | 60               | 2–4 (2 per map)   | 2–4                    | Bottleneck; forces diversification |
| Catnip   | 120              | 1–2 (2 per map)   | 0.5–1                  | Premium; long cooldown |

**Design Rationale**:
- Grass respawns fast (no frustration when nodes cluster)
- Water/Sticks respawn slower (creates "resource puzzle" decisions)
- Catnip is long-cooldown prestige (rare even at L10)

**Playtest Target**: 
- Player should gather 5–10 Grass, 2–3 Sticks, 1 Water per 10-minute session
- Should never feel "out of resources" but should occasionally lack Sticks/Water forcing backtracking

---

## 3. Inventory Capacity

### Capacity Tuning Points

| Ability Tier | Max Slots | Ratio to Grass Nodes | Ratio to Sticks Nodes | Session Behavior | Testing Notes |
|--------------|-----------|----------------------|-----------------------|------------------|---------------|
| Base (Tier 0) | 10        | 1.25:1               | 2:1                   | Forces frequent drops | [PLACEHOLDER] |
| Tier 1       | 15        | 1.87:1               | 3:1                   | Mild pressure         | [PLACEHOLDER] |
| Tier 2       | 20        | 2.5:1                | 4:1                   | Comfortable           | [PLACEHOLDER] |
| Tier 3       | 25        | 3.12:1               | 5:1                   | Relaxed               | [PLACEHOLDER] |

**Hypothesis**: 
- Tier 0 (10 slots) = too tight; breaks gathering flow if nodes spawn densely
- Tier 1 (15 slots) = "sweet spot" for first playtest
- Tier 2 (20 slots) = comfortable; minimal inventory management friction
- Tier 3 (25 slots) = reduces scarcity tension (acceptable at L8+, when player is experienced)

**First Playtest**: Lock at Tier 0 (10 slots) for all players; measure time spent managing inventory. If > 20% of session, increase to 15.

---

## 4. Ability Cooldowns

### Ability Cooldown Table

| Ability       | Tier 1 | Tier 2 | Tier 3 | Tuning Lever | Feel Target |
|---------------|--------|--------|--------|--------------|-------------|
| Gathering     | —      | —      | —      | gather_time  | Snappy; not interrupted |
| Herding       | 8.0s   | 7.0s   | 6.0s   | herding_cooldown | Frequent but not spammable |
| Movement (Sprint) | —  | —      | 10.0s  | sprint_cooldown | 2x speed, 5s duration, 10s cooldown feels good |

**Feel Targets**:
- **Herding (8s base)**: Should feel like "activate, wait a beat, activate again" (not instant spam). `[PLACEHOLDER]` - test vs. 5s and 10s in parallel sessions.
- **Sprint (10s cooldown)**: Off-cooldown roughly every 10 seconds of play; sprint window is 5s, so average uptime ~33%. `[PLACEHOLDER]` - feel if this is enough or too much.

---

## 5. Leveling & Experience Progression

### Level Up Thresholds

| Level | Total Gathered (Cumulative) | AP Gained | Implied Sessions (20 resources/session) | Narrative Milestone |
|-------|-----------------------------|-----------|-----------------------------------------|---------------------|
| 1     | 0                           | 1         | 0                                       | Start               |
| 2     | 100                         | 1         | 5                                       | —                   |
| 3     | 250                         | 1         | 12.5 ≈ Session 2–3                      | Herding Unlocked    |
| 4     | 450                         | 1         | 22.5 ≈ Session 4–5                      | —                   |
| 5     | 700                         | 1         | 35 ≈ Session 5–7                        | **Journeyman**      |
| 6     | 1000                        | 1         | 50 ≈ Session 7–10                       | —                   |
| 7     | 1350                        | 1         | 67.5 ≈ Session 10–14                    | —                   |
| 8     | 1750                        | 1         | 87.5 ≈ Session 14–17                    | —                   |
| 9     | 2200                        | 1         | 110 ≈ Session 18–22                     | —                   |
| 10    | 2700                        | 1         | 135 ≈ Session 22–27                     | **Master Herder**   |

**Curve Shape**: Quadratic-ish (accelerating requirement as level increases). This is intentional to slow progression curve.

**Playtest Goals**:
- Level 3 should occur in session 2–3 (feels like "unlocked something cool fast")
- Level 5 should occur in session 5–7 (2 weeks of casual daily play)
- Level 10 should require 3–4 weeks of consistent engagement (not burnout timeline)

**Gather Rate Assumption**: 
- **Base rate**: 1 resource/3 seconds average (accounting for movement + gather delays)
- **Per session (20 min)**: ~120 resources at start; ~180 at Tier 3 Gathering
- **Adjustment**: If playtest shows 20 resources/session, curve is 2-3x too slow; recalculate

---

## 6. Building Unlock Progression

### Resource Cost & Gate Timing

| Building       | Grass | Sticks | Water | Level Gate | Estimated Unlock | Design Purpose |
|----------------|-------|--------|-------|-----------|------------------|-----------------|
| Shelter        | —     | —      | —     | Start     | Session 0        | Home base       |
| Barn           | 30    | 10     | —     | L1        | Session 2–3      | Doubles cat spawn |
| Herding Pen    | 50    | 20     | 10    | L3        | Session 4–5      | Cat housing     |
| Herding Yard   | 100   | 50     | 25    | L5        | Session 8–10     | Herding T3 unlock |

**Tuning Hypothesis**:
- Barn should feel achievable in 2–3 sessions (fast reward loop)
- Herding Pen milestone should align with Herding ability unlock (L3)
- Herding Yard should feel like "late-game goal" (Session 8+)

**Economy Check**: 
- By Session 5, player has gathered ~500 resources (Barn: 40 cost, Pen: 80 cost = 120 total)
- Remaining capacity: 380 resources — enough buffer for player flexibility
- No bottleneck (all resources roughly same rarity)

---

## 7. Herding System Tuning

### Herding Ability Parameters

| Parameter          | Tier 1 | Tier 2 | Tier 3 | Notes |
|-------------------|--------|--------|--------|-------|
| Detection Radius  | 3m     | 4m     | 5m     | Max distance to detect cats |
| Cat Movement Speed | 0.5 m/s | 0.7 m/s | 1.0 m/s | Speed toward herder |
| Follow Duration   | 3s     | 5s     | — (continuous) | How long cat pursues herder |
| Cooldown          | 8s     | 7s     | 6s     | Time between activations |
| Max Cats Herdable | 1      | 2      | 4      | Simultaneous cats under herding |

**Design Rationale**:
- Tier 1: Single cat, short range (feels like "I can call one cat")
- Tier 2: Multiple cats, extended reach (feels like "I'm a better herder")
- Tier 3: Continuous herding, full farm potential (feels like "I've mastered herding")

**Herding to Pen Mechanic**:
- Player activates Herding ability on cat in detection radius
- Cat moves toward player at specified speed
- If cat reaches Herding Pen building → cat is captured
- Captured cat = "inside" farm; generates +1 Relationship/min passive income
- Relationship tracks taming; at 100 relationship → bonus resource generation

**Playtest Target**: 
- Herding 1 cat from wild spawn to Pen should take ~30 seconds (feels achievable)
- Herding 3 cats simultaneously (T3) should feel chaotic but doable

---

## 8. Passive Income (Farm Buildings)

### Passive Resource Generation

| Building    | Resource | Generation Rate | Triggered By | Cap | Notes |
|-------------|----------|-----------------|--------------|-----|-------|
| Barn        | Grass    | +0.5/min per cat | Cat inside | 4 cats max | Doubles spawn rate |
| Herding Pen | Relationship | +1/min per cat | Captured cat | 100 max per cat | Unlock happiness mechanic |
| Herding Yard | (none)   | —               | —            | —   | Unlocks Herding T3 |

**Economy Impact**:
- 1 captured cat = 1 Grass/min passive
- Player manually gathers ~100 resources/session; passive generates ~30/session (1 cat, 30 min)
- Benefit scales with cat count but caps at ~4 cats (diminishing returns)

**Design Purpose**: 
- Rewards long-term planning (building Pen → ongoing benefit)
- Allows "idle" engagement (log in, check farm, see progress)
- Not mandatory (player can ignore and focus on active gathering)

---

## 9. Movement Speed Tuning

> **Canonical source**: Map & Movement System § 2.1 — base walk speed is **4.5 u/s**. All tier calculations derive from this value.

### Speed Progression Table

| Ability Tier | Speed (u/s) | % Increase | Traversal Time (50m map diagonal ≈ 70.7u) | Feel |
|--------------|-------------|----------|-----------------------------------|------|
| Tier 0 (base) | 4.5        | 0%       | 15.7 seconds                      | Deliberate, weighted |
| Tier 1       | 5.4        | +20%     | 13.1 seconds                      | Noticeably faster |
| Tier 2       | 6.075      | +35%     | 11.6 seconds                      | Comfortable |
| Tier 3       | 6.75       | +50%     | 10.5 seconds                      | Zippy |
| Tier 3 + Sprint | 13.5    | +200%    | 5.2 seconds                       | Quick burst |

**Playtest Goals**:
- Base speed (4.5 u/s) should feel deliberate but not ponderous — movement has weight per Map & Movement System spec (0.3s accel, 0.2s decel)
- Tier 3 (6.75 u/s) should feel noticeably faster; sprint at 13.5 u/s should feel like a quick burst
- Map size and speed must be balanced: if 50m diagonal takes ~16 seconds at base, gathering cycle + traversal = ~30 seconds per resource loop (acceptable)

**Note on Dash**: The Map & Movement System spec defines a base Dash at 7.2 u/s (`Shift` + direction, consumes stamina). This is **deferred to post-MVP** — speed bursts in MVP are gated behind the Tier 3 sprint ability unlock. See PRD-02 Non-Goals.

**Tuning Lever**: `[PLACEHOLDER]` Adjust base speed if traversal feels tedious or trivial after first playtest.

---

## 10. Damage Scaling (Combat Abilities — Post-MVP)

**Currently N/A for MVP.** Included for reference in future expansion.

---

## 11. Economy Simulation (Paper Test)

### 20-Minute Session (Level 1, No Abilities)

**Scenario**: Player starts with empty inventory, base stats, gathers for 20 minutes.

| Time | Action | Resources In | Resources Out | Notes |
|------|--------|--------------|---------------|-------|
| 0:00 | Spawn at Shelter | 0 | 0 | |
| 0:30 | Walk to Grass node | 0 | 0 | 30s walk |
| 1:30 | Gather Grass (1.5s) | +1 Grass | 0 | First resource |
| 2:00 | Move to next Grass | 1 | 0 | |
| 3:00 | Gather Grass | +1 Grass | 0 | |
| ... | (Continue gathering Grass, moving between nodes) | | | |
| 18:00 | Inventory full (10 slots) | 10 | 0 | Must decide: continue or cash in? |
| 18:30 | Walk back to Shelter | 10 | 0 | |
| 19:30 | Deposit resources | 0 | 10 Grass in farm | |
| 20:00 | Session ends | 0 | 10 Grass total gathered | |

**Calculation**:
- Gather time per node: 1.5s
- Movement time (rough avg): 1.5s per node transition
- Per node cycle: 3s average
- 20 minutes = 1200 seconds
- Nodes possible: 1200 / 3 = 400 node interactions
- But inventory caps at 10, so realistic max: ~15 cycles (walk out, gather 10, walk back, repeat) = 10 gathered
- More realistically: ~12 nodes per cycle including travel → 10 per cycle, 12 gather events max

**Expected outcome for L1**: ~10-15 resources/session (tight but not grindy)

**Adjust for Tier 2 Gathering** (gather_time = 1.2s):
- Per node cycle: 2.7s average
- Nodes possible in 1200s: 444 interactions
- With inventory cap: 20 slots × 1.3 yield = 26 resources per trip
- Expected outcome: ~26 resources/session (roughly 2x better)

**Economy Check**: This scales reasonably. Tier 1 → Tier 2 = 1.3x efficiency gain, which justifies ability point investment.

---

## 12. Balancing Decisions & Assumptions

### Assumption 1: Sessions are 20 ± 5 minutes
- **Impact**: If sessions are 5 min, progression is 4x slower (adjust level curve)
- **How to measure**: Log first 50 playtest sessions; calculate avg session duration
- **Adjustment**: If sessions average 10 minutes, recalculate thresholds

### Assumption 2: Players unlock Herding by Session 3
- **Impact**: If Herding doesn't unlock until Session 5, Pen building feels too late
- **How to measure**: Playtest; track at what level players reach each milestone
- **Adjustment**: Shift level-ups to accelerate/decelerate as needed

### Assumption 3: Inventory management should not exceed 5% of session time
- **Impact**: If players spend 10 minutes managing inventory, increase capacity or reduce nodes
- **How to measure**: Playtest observer notes; measure time spent in inventory UI
- **Adjustment**: If >5%, increase capacity tier by 5 slots or reduce node density

### Assumption 4: Resource types are balanced in desirability
- **Impact**: If players never gather Water, Pen building is inaccessible
- **How to measure**: Playtest; measure average gather counts per resource type
- **Adjustment**: If one resource is ignored, rebalance spawn rate or requirements

---

## 13. Red Flags & Balance Breaks

### Economy Breaking Points

| Red Flag | Symptom | If Found | Action |
|----------|---------|----------|--------|
| Infinite loop | Ability costs < ability reward for Tier N | Stop progression at Tier 2; no Tier 3 unlock | Cap ability points; add resource sinks |
| Soft lock | Player can't gather required resources for next unlock | Player stuck at L3 forever (can't reach L5) | Reduce unlock cost; add new resource source |
| Bloat | Player has more resources than can store indefinitely | Inventory maxes out; player farming idle resources | Add new building to spend resources or cap passive income |
| Progression wall | Massive jump in difficulty between levels | L4→L5 requires 3x as many resources as L3→L4 | Smooth curve; use quadratic, not exponential |
| Trivial meta | Optimal strategy is obvious; no meaningful choice | Always gather Grass; ignore Sticks; Pen building ignored | Add alternate progression paths; make resources interdependent |

**Playtester Instructions**: Flag any of the above during sessions. Halt and escalate to design.

---

## 14. Tuning Workflow

### Before First Playtest
1. Lock all `[PLACEHOLDER]` values to stated defaults
2. Print this spreadsheet; bring to playtest
3. Assign one observer per playtester (notes on feel, not score)
4. Time each session; record resource gather counts per type
5. After session, interview player: "What felt good? What was tedious? Any decisions you had to make?"

### After First Playtest
1. Aggregate data: avg session length, resources gathered, level reached
2. Identify 1–2 highest-impact tuning changes (e.g., "gather time is too long" or "inventory too tight")
3. Make changes; document rationale
4. Run 2 more sessions (parallel, different players) to validate feel change
5. Update this spreadsheet with new baseline; version and commit

### Iteration Cadence (MVP)
- Playtest 1: 3 players (days 1–2) → identify critical feel issues
- Tweak 1: Adjust gather_time, movement_speed, inventory cap (day 3)
- Playtest 2: 3 players (days 4–5) → validate feel, check progression speed
- Tweak 2: Fine-tune cooldowns, resource respawns (day 6)
- Playtest 3: 5 players (days 7–10) → full balance pass, check for soft locks
- Final tuning: Any last adjustments before first release build (day 11)

---

## 15. Version History

| Version | Date       | Changes | Author |
|---------|------------|---------|--------|
| 0.1     | 2026-04-14 | Initial tuning spreadsheet | GDD |

