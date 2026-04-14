**Cat Herder**

## 1. Core Perspective & Camera System

### 1.1 Camera Projection
- **Primary View**: Angled top-down perspective (approximately 45° azimuth, 60° elevation) that simulates classic 2D action-adventure style while providing 3D spatial readability
- **Camera Behavior**: Fixed position with slight dynamic offset based on movement direction (2-3 unit lead in facing direction)
- **Depth Simulation**: Uses forced perspective and depth sorting to create layered verticality illusion on a 3D plane
- **Secondary View**: Side-scrolling perspective triggers in specific zones (caves, certain rifts, vertical shafts) - requires seamless camera transition (0.5s blend)

### 1.2 Visual Layering Requirements
- **Render Priority**: Dynamic z-sorting based on y-axis position + height offset
- **Shadow Casting**: All entities cast elliptical shadows onto ground plane for spatial anchoring
- **Height Indicators**: Subtle vertical position indicators for floating/climbing entities (optional debug visualization for development)

## 2. Ground Movement (2D Plane)

### 2.1 Basic Locomotion
- **Input**: `WASD` / `Arrow Keys` for 8-directional movement, or **mouse click-to-move** (A* pathfinding with 0.3s acceleration curve)
- **Movement Speed**: 
  - Walk: 4.5 units/second
  - Dash (`Shift` + direction): 7.2 units/second (consumes minor stamina)
- **Acceleration/Deceleration**: 0.3s ramp-up, 0.2s ramp-down for responsive but weighted feel
- **Collision**: Circle collision (radius: 0.4 units) with 0.1 unit skin width for wall sliding

### 2.2 Rotation & Facing
- **Movement Direction**: Character sprite rotates to face movement vector (8-directional sprite animation blending)
- **Manual Facing**: Mouse cursor position aims independently (for cat companion placement, targeting)
- **Lock-On (`Middle-click`)**: Snaps rotation to target entity with 15° dead zone

## 3. Z-Axis Topology & Vertical Movement

### 3.1 Jump System
- **Base Jump**: Press `Spacebar` for immediate vertical impulse of 3.5 units
- **Apex Height**: 1.2 units above ground (clears small obstacles, tables, low ledges)
- **Air Control**: 70% horizontal movement retention during jump
- **Coyote Time**: 5 frames (0.08s) post-ground-loss for input forgiveness
- **Jump Buffer**: 5 frames pre-landing to queue next jump

### 3.2 Swimming & Diving
- **Water Entry**: Automatic transition when y-position overlaps water volume
- **Surface Swim**: Normal 360° movement (speed: 3.2 units/second)
- **Dive (`S` / mouse click on depth)**: Submerge at 2 units/second
- **Swim Up (`W` / `Spacebar`)**: Ascend at 2.5 units/second
- **Oxygen System**: 30-second breath meter (depletes 1% per 0.3s underwater)
  - Visual: Circular gauge appears at top-center when submerged
  - Warning: Flashing red pulse at 20% remaining
  - Depletion: -1 heart damage per second after meter empties
- **Depth Layers**: Swimming areas have vertical depth of 8-15 units with collectibles at varying depths

## 4. Cat Companion System

The cat companion system is the core puzzle-solving and traversal mechanic. Players recruit cat companions throughout the world, each with a unique ability based on classic cat behaviors. Summoned cats act as temporary terrain, movement enhancers, or utility tools.

### 4.1 Companion Management
- **Cat Limit**: 3-5 simultaneously active cats (scales with player progression)
- **Cost System**: Each cat consumes 1-5 yarn balls from the player's yarn reserve
- **Dismissal**: `Right-click` active cat to dismiss (yarn is returned)
- **Visual Feedback**: Active yarn cost displayed as floating yarn balls above each summoned cat

### 4.2 Terrain-Creating Companions

**The Loaf** — *Cats sitting in the most inconvenient places*
- **Ability**: Plops down and becomes a solid, immovable platform block
- **Height**: Low tier (1.0-2.5u) — stackable with other Loafs to reach High tier
- **Use Cases**: Stepping stones, blocking paths, holding down pressure switches
- **Yarn Cost**: 1
- **Visual**: Cat tucks paws under, becomes a perfect bread loaf shape; purrs contentedly

**The Stretch** — *Cats stretching to absurd lengths*
- **Ability**: Extends body horizontally to bridge gaps
- **Span**: 2-4 units depending on cat level
- **Use Cases**: Crossing chasms, connecting disconnected platforms
- **Yarn Cost**: 2
- **Visual**: Comically elongated cat spanning the gap, looks mildly annoyed

**The Hairball** — *The universal cat experience*
- **Ability**: Launches a sticky mass in an arc that hardens into terrain on impact
- **Use Cases**: Filling holes, creating angled ramps, plugging water flows
- **Placement**: Aimed with mouse cursor arc trajectory
- **Yarn Cost**: 2
- **Visual**: Cat convulses dramatically, produces an oversized hairball; shakes head with dignity

**The Box Cat** — *If I fits, I sits*
- **Ability**: Manifests a cardboard box and sits in it — the box becomes solid terrain
- **Unique Property**: Floats on water surfaces (cats + boxes = buoyancy)
- **Use Cases**: Stackable blocks, weighted pressure plates, water traversal platforms
- **Yarn Cost**: 2
- **Visual**: Box materializes from nowhere, cat immediately hops in, eyes peeking over the edge

**The Scratch Post** — *Cats scratch everything vertical*
- **Ability**: Claws a wall surface, creating temporary climbable footholds
- **Duration**: Claw marks persist for 15 seconds before fading
- **Use Cases**: Vertical traversal, reaching High tier without stacking
- **Yarn Cost**: 3
- **Visual**: Cat rapidly scratches wall with visible glowing claw marks left behind

### 4.3 Movement-Enhancing Companions

**The Zoomies** — *3 AM energy bursts*
- **Ability**: Cat bolts in a direction, leaving a glowing speed trail
- **Effect**: Player running along the trail receives 2x speed boost
- **Duration**: Trail persists for 8 seconds
- **Use Cases**: Crossing timed sections, long jumps, outrunning hazards
- **Yarn Cost**: 2
- **Visual**: Cartoon dust cloud trail, cat's eyes go wide and manic, fur stands on end

**The Pounce** — *The predatory leap*
- **Ability**: Cat crouches as a launch pad — player stands on cat and is launched upward/forward
- **Effect**: Launches player 3.5 units vertically (reaches High tier in one move)
- **Use Cases**: Reaching High tier directly, crossing medium gaps, accessing secret areas
- **Yarn Cost**: 3
- **Visual**: Classic pre-pounce butt wiggle wind-up animation, then explosive spring upward

**The Scaredy Cat** — *Startled puff-up*
- **Ability**: Cat puffs up to 3x size when startled, becoming a bouncy surface
- **Trigger**: Activates on enemy proximity or player command
- **Use Cases**: Trampolines, redirecting projectiles, temporary enemy barriers
- **Yarn Cost**: 2
- **Visual**: Classic arched-back, puffed-tail, wide-eyed Halloween cat silhouette

### 4.4 Utility Companions

**The Knock-Off** — *Cats pushing things off edges*
- **Ability**: Methodically pushes nearby objects (boulders, blocks, enemies) off ledges
- **Use Cases**: Clearing blocked paths, creating stepping stones on lower tiers, activating switches below
- **Yarn Cost**: 1
- **Visual**: Slow, deliberate paw push... pause... makes direct eye contact with player... push again

**The Kneading** — *Making biscuits*
- **Ability**: Kneads terrain, softening hard ground into traversable or moldable surface
- **Use Cases**: Creating depressions for water channels, softening barriers, compacting loose terrain into walkable ground
- **Yarn Cost**: 3
- **Visual**: Rhythmic paw-paw-paw animation with a deeply content, half-lidded expression

**The Water Hater** — *Cats despising water with every fiber of their being*
- **Ability**: Cat's intense displeasure temporarily freezes/solidifies water surfaces in a radius
- **Radius**: 3 units around the cat
- **Duration**: Persists while cat is active; player must stay within radius
- **Use Cases**: Crossing water without swimming, creating ice platforms for other cats to stand on
- **Yarn Cost**: 4
- **Visual**: Cat glares at water with such concentrated contempt that it crystallizes; tail twitches irritably

**The Curiosity Cat** — *Curiosity reveals hidden things*
- **Ability**: Sniffs out and reveals hidden paths, secret platforms, and invisible terrain
- **Effect**: Ghost-terrain shimmers into visibility and becomes temporarily solid and walkable
- **Duration**: Revealed terrain persists for 20 seconds
- **Use Cases**: Exploration puzzles, finding alternate routes, discovering secret areas
- **Yarn Cost**: 2
- **Visual**: Ears perk up, nose twitches rapidly, hidden terrain shimmers into view with sparkle effect

### 4.5 Cat-Assisted Navigation

**Pathfinding Requirements**:
- System must account for active cat companions as temporary terrain
- Loafs, Box Cats, Hairballs, and Stretch cats create valid navmesh surfaces
- Cat lifespan: Persistent until manually dismissed (right-click) or overwritten by cat limit

**Navigation Enhancement Summary**:

| Challenge | Cat Solution |
|---|---|
| Cross a gap | **Stretch** bridges it, or **Hairball** fills it |
| Reach High tier | **Pounce** launches directly, or **Scratch Post** climbs wall |
| Cross water | **Box Cat** floats across, or **Water Hater** freezes path |
| Timed corridor | **Zoomies** speed trail |
| Vertical wall | **Scratch Post** creates climbable surface |
| Pressure plate puzzle | **Loaf** sits on it (immovably, as cats do) |
| Bounce to height | **Scaredy Cat** puffs into bouncy surface |
| Clear blocked path | **Knock-Off** pushes obstacle away |
| Find hidden routes | **Curiosity Cat** reveals secret terrain |
| Mold terrain | **Kneading** softens or compacts ground |

## 5. Map & Navigation Systems

### 5.1 2D Map Representation
- **Map View**: Press `M` to open overhead 2D map
- **Player Icon**: Character face icon with directional arrow showing facing
- **Height Indication**: 
  - Current layer highlighted with pulsing border
  - Lower layers shown as faded/dimmed
  - Upper layers as brighter regions
- **Waypoints**: Paw-print-shaped icons, color-coded by region
  - **Activation**: Interact once to unlock
  - **Fast Travel**: Select on map for instant travel (2s load screen)
  - **Cooldown**: None (unlimited use)

### 5.2 Dungeon Maps
- **Toggle**: Press `M` in dungeons, then `Left`/`Right` arrow keys to switch between Overworld/Dungeon view
- **Room States**: 
  - Unvisited: Darkened
  - Visited: Revealed layout
  - Completed: Checkmark overlay
- **Still World Overlay**: Shows corresponding rift layout when toggled

## 6. Technical Implementation Notes

### 6.1 Coordinate System
- **World Space**: 3D coordinates (x, y, z) but gameplay constrained to 2D plane with height as attribute
- **Map Space**: 2D grid representation where each cell stores:
  - Ground height (float)
  - Collision type (enum)
  - Navigability mask (bitfield for jump/cat companion requirements)
  - Current cat companion occupancy (bool)

### 6.2 Physics Requirements
- **Gravity**: -12 units/second² when airborne
- **Ground Snap**: 0.05 unit tolerance for landing
- **Edge Detection**: Raycast downward from entity base to detect ground/water
- **Platform Parenting**: Moving platforms must update rider's position without jitter (0.01 unit precision)

### 6.3 Animation Blending
- **Movement**: Blend tree based on velocity magnitude and direction
- **Height Transitions**: Additive animations for jumping, landing, diving
- **Cat Interaction**: Player reaches toward bound companions (IK target at entity position)

## 7. Edge Cases & Validation

### 7.1 Invalid States
- **Prevent**: Binding to static terrain, summoning cats inside collision geometry
- **Fallback**: If bound cat cannot path to target position, break bind with visual/audio feedback (cat hisses)
- **Cat Clipping**: Auto-raise cat to valid height if summoned inside ground (max 3 attempts, then fail with "cat refuses" animation)

### 7.2 Performance Considerations
- **Cat Pooling**: Pre-instantiate 20 cat companion prefabs per type, recycle on dismissal
- **Navmesh Updates**: Only recalculate navmesh for areas within 15 units of cat placement
- **Layer Culling**: Render only current and adjacent height tiers beyond 20 unit radius

### 7.3 Save System
- **Persistent State**: Save active cat positions, types, and yarn reserve level
- **Quick Resume**: On load, validate cat positions against current terrain (dismiss if invalid)

---

## 8. Input & Controls

> **Platform Priority**: Desktop (keyboard + mouse) is the **primary MVP target**. Mobile touch is **secondary**. Gamepad/controller support is planned for future development (see Appendix A).

### 8.1 Desktop (Keyboard + Mouse) Controls — *MVP Primary*

#### Movement & Navigation
| Action | Keyboard/Mouse Mapping | UX Rationale |
|--------|------------------------|--------------|
| **360° Movement** | `WASD` or `Arrow Keys` (8-directional) + **Mouse click-to-move** | Offers both precision (WASD for combat) and casual pathing (click-to-move for exploration). Click-to-move uses A* pathfinding with 0.3s acceleration curve. |
| **Jump** | `Spacebar` (tap) | Universal convention; 5-frame coyote time and jump buffering maintained. |
| **Dash** | `Shift` + direction (hold) | Mimics sprint mechanics in PC games; prevents accidental dashes. 0.2s activation delay. |


**Technical Implementation:**
```javascript
// Prevent browser scroll on arrow keys
document.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
  }
});

// Unified movement tracking
const keys = { w: false, a: false, s: false, d: false };
document.addEventListener('keydown', (e) => {
  if (e.key in keys) keys[e.key] = true;
});
```

#### Cat Companion & Aiming Controls
| Action | Keyboard/Mouse Mapping | UX Rationale |
|--------|------------------------|--------------|
| **Cat Placement** | **Mouse position** = aim target; **Left-click** = summon cat | Direct 1:1 mapping; cursor changes to cat silhouette when in valid range. Right-click rotates cat facing direction. |
| **Bind (X)** | `E` key + mouse hover target | Context-sensitive: pressing `E` while hovering binds nearest valid target within 8 units. |
| **Reverse Bond (R)** | `Q` key (hold) | Hold for 0.5s to activate; prevents accidental activation during combat. Visual progress ring appears. |
| **Cat Selection** | `1-9` number keys or scroll wheel | Quick-select from recruited cat roster. Active cat type shown in HUD. |

**Mouse Cursor States:**
- **Default**: Standard arrow
- **Cat Placement**: Cat silhouette preview ghost at target location
- **Bind Mode**: Chain link icon
- **Reverse Bond**: Animated tether line to bound entity

#### UI & Menu Controls
| Action | Keyboard/Mouse Mapping | UX Rationale |
|--------|------------------------|--------------|
| **Open Map** | `M` key | Standard PC convention. |
| **Fast Travel** | Click waypoint on map | Direct interaction; no intermediate selection step. |
| **Cat Roster** | `C` key | Opens full cat companion inventory/management screen. |
| **Pause/Menu** | `Esc` key | Universal PC expectation. |

### 8.2 Mobile (Touch) Controls — *Secondary Priority*

#### Core Philosophy: **Minimalist Floating Controls**
Based on Terraria's mobile UX research, **floating joysticks** that appear on first touch outperform static controls. The UI remains hidden until interaction, maximizing screen real estate.

#### Movement & Actions
| Action | Touch Mapping | UX Rationale |
|--------|---------------|--------------|
| **360° Movement** | **Floating Left Joystick** | Appears at first touch in left 40% of screen. Disappears after 2s of inactivity. Dead zone: 15% radius to prevent drift. |
| **Jump** | **Swipe up** on right side of screen | Gesture-based to avoid button clutter; 0.3s swipe detection window. |
| **Dash** | **Double-tap** joystick direction | Natural extension of movement; 0.4s double-tap window. |

**Visual Design:**
- **Joystick**: 80px diameter, 40% opacity when idle, 80% when active
- **Active Zone**: Left 40% of screen (configurable in settings)
- **Feedback**: Haptic tap on jump/dash; vibrate pattern for low stamina

#### Cat Companion Controls (Touch)
| Action | Touch Mapping | UX Rationale |
|--------|---------------|--------------|
| **Cat Placement** | **Tap-to-place mode**: Tap empty space → cat preview appears → tap again to confirm | Two-step process prevents accidental placement in combat. Preview shows ghost cat with facing handle. |
| **Cat Selection** | **Swipe horizontal** on cat icon bar (bottom of screen) | Scrollable roster of recruited cats; active cat highlighted. |
| **Bind (X)** | **Long-press** on entity (0.5s) | Long-press reduces accidental binds during frantic movement. Entity glows when bindable. |
| **Reverse Bond** | **Pinch inward** from entity to player | Gesture mimics "pulling" entity toward player. Works only when entity is already bound. |
| **Aim Cat Direction** | **Second virtual joystick** (appears on right 40% of screen) | Only appears when placing directional cats (Hairball arc, Stretch orientation). Floating design prevents thumb occlusion. |

**State Machine UI:**
- **Exploration Mode**: No UI visible except minimal cat bar
- **Cat Placement Mode**: Right-side joystick + rotation slider appears
- **Bind Mode**: All bindable entities highlighted; tap to select

#### Advanced Features
| Action | Touch Mapping | UX Rationale |
|--------|---------------|--------------|
| **Map** | **Pinch-out gesture** | Mimics zoom-out to "view the world." |
| **Fast Travel** | **Tap waypoint on map** | Direct manipulation; map closes automatically after selection. |

### 8.3 Responsive Design & Accessibility

#### Adaptive UI Scaling
- **Button Sizes**: Scale based on screen diagonal:
  - `< 5"`: 60px minimum
  - `5-7"`: 80px
  - `> 7"` (tablets): 100px
- **Joystick Position**: Auto-adjust for left/right-handed preference (detected by first-touch location)
- **Transparency**: Auto-increase to 60% when player stands still for 3s+

#### Accessibility Features
- **One-Handed Mode**: Compresses both joysticks to left/right edges; uses swipe gestures for actions
- **Input Assist**: Toggle in settings:
  - **Aim Assist**: Cat placement snaps to valid targets within 2 units
  - **Coyote Time Extension**: +5 frames for jumps
- **Colorblind Mode**: High-contrast outlines for all interactive elements
- **Haptic Strength**: Adjustable 0-100% (default 70%)

#### Performance Considerations
- **Touch Event Throttling**: Limit to 60Hz to reduce battery drain
- **Gesture Recognition**: Use `touch-action: none` CSS to prevent browser zoom/pan
- **Canvas Optimization**: Render controls on separate canvas layer to avoid full-screen redraws

### 8.4 Cross-Platform Consistency

#### Unified Input API
Use a library like `responsive-gamepad` to normalize inputs:

```javascript
import { ResponsiveGamepad } from 'responsive-gamepad';

ResponsiveGamepad.enable();
const state = ResponsiveGamepad.getState();

// Same code for all platforms
if (state.DPAD_UP) player.jump();
if (state.ACTION_BOTTOM) player.summonCat();
```

#### Cloud Save for Preferences
- Store key bindings and joystick position preferences per device
- Sync across devices if user logs in (optional)

## 9. Onboarding & Tutorial Design

### 9.1 Contextual Tooltips
- **First Launch (Desktop)**: Overlay shows "Use WASD to move" with key icons
- **First Launch (Mobile)**: Overlay shows "Tap here to move" at first touch location
- **First Cat**: Forces player to summon a Loaf on a marked spot; "Place your cat here" tooltip pulses (desktop: "Left-click to place")
- **Bind Tutorial**: Player must press `E` while hovering target (desktop) or long-press (mobile); appropriate tooltip appears
- **Jump Hints**: Spacebar icon (desktop) or swipe-up arrow (mobile) appears when player first approaches a ledge

### 9.2 Progressive Disclosure
- **First 5 minutes**: Only movement and jump available
- **After first cat recruitment**: Cat placement tutorial triggers
- **After 3 cats recruited**: Bind tutorial and cat selection UI appears

## 10. Risk Mitigation

### 10.1 Accidental Input Prevention
- **Palm Rejection**: Ignore touches > 100px radius (detects palm on tablets)
- **Edge Guard**: 20px invisible border ignores touches (prevents accidental home gesture)
- **Commitment Windows**: High-impact actions (Reverse Bond) require 0.5s holds

### 10.2 Fallback Controls
- **Keyboard on Mobile**: Bluetooth keyboard auto-detected; switches to desktop layout
- **Mouse on Mobile**: USB-C mouse supported; shows desktop cursor UI

---

**Design Philosophy**: The movement system bridges classic 2D action-adventure accessibility with modern verticality, ensuring the angled perspective never obscures gameplay while providing satisfying spatial puzzles through the cat companion system. Each cat's ability is rooted in recognizable feline behavior — making mechanics intuitive and delightful to discover. The 2D map must accurately represent this 3D topology through visual layering and clear height communication.

---

## Appendix A: Gamepad / Controller Mappings (Future Development)

> **Status**: Not in MVP scope. These mappings are preserved for future implementation when controller support is added.

### A.1 Controller Input Mapping

| Action | Controller Mapping | Notes |
|--------|-------------------|-------|
| **360° Movement** | Left analog stick | Full analog 360-degree input |
| **Manual Facing / Aim** | Right analog stick | Independent aiming for cat placement, targeting |
| **Jump** | `B` button (tap) | |
| **Dash** | Hold `B` while moving | |
| **Dive (Swimming)** | `A` button (hold) | |
| **Swim Up** | `B` button | |
| **Bind** | `X` + `R` | |
| **Reverse Bond** | Hold `R` during Bind | |
| **Cat Dismissal** | `ZR` | |
| **Lock-On** | `ZL` | Snaps rotation to target entity with 15° dead zone |
| **Open Map** | `[-]` button | |
| **Dungeon Map Toggle** | `[-]`, then `Left`/`Right` on D-Pad | |

### A.2 Implementation Considerations
- Use a unified input API (e.g., `responsive-gamepad`) to normalize controller inputs alongside keyboard/mouse
- Deadzone: 15% on analog sticks to prevent drift
- Rumble feedback for combat hits, cat placement confirmation, and low-stamina warning