import type { System } from "../ecs/System";
import type { World } from "../ecs/World";
import type { InputManager } from "../engine/InputManager";
import type { PhysicsEngine } from "../engine/PhysicsEngine";
import type { Transform } from "../ecs/components/Transform";
import type { Velocity } from "../ecs/components/Velocity";
import type { PlayerControlled } from "../ecs/components/PlayerControlled";
import type { SwimmingState } from "../ecs/components/SwimmingState";
import { GameAction } from "../types";
import { runtimeConfig } from "../config";

/**
 * MovementSystem — walk, jump, coyote time, and jump buffer.
 *
 * Frame position in the loop:
 *   InputManager.poll() → **MovementSystem** → PhysicsEngine.step() → …
 *
 * Responsibilities per frame:
 *  1. Sync ECS Transform from the physics body (result of the previous frame's step).
 *  2. Tick coyote-time and jump-buffer counters.
 *  3. Trigger a jump when the buffer and ground conditions align.
 *  4. Compute horizontal velocity (with acceleration / deceleration).
 *  5. Write the new velocity to the physics body so PhysicsEngine.step() picks it up.
 *  6. Rotate the entity's mesh to face the current movement direction.
 *
 * MovementSystem never touches keyboard state directly — all input is read
 * through InputManager so the coupling is minimal and testable.
 */
export class MovementSystem implements System {
  constructor(
    private readonly inputManager: InputManager,
    private readonly physics: PhysicsEngine,
  ) {}

  update(world: World, dt: number): void {
    const entities = world.query("Transform", "Velocity", "PlayerControlled");

    for (const entity of entities) {
      const transform = world.getComponent<Transform>(entity, "Transform")!;
      const velocity = world.getComponent<Velocity>(entity, "Velocity")!;
      const player = world.getComponent<PlayerControlled>(
        entity,
        "PlayerControlled",
      )!;

      const handle = this.physics.getHandleByEntity(entity);
      if (!handle) continue;

      // ── 1. Sync ECS position from physics (prev-frame result) ─────────────
      const pos = this.physics.getPosition(handle);
      if (pos) {
        transform.x = pos.x;
        transform.y = pos.y;
        transform.z = pos.z;
      }

      // ── Swimming branch — replaces all land physics when in water ─────────
      const swimming = world.getComponent<SwimmingState>(entity, "SwimmingState");
      if (swimming !== null) {
        this.applySwimmingPhysics(handle, transform, velocity, swimming, dt);
        continue;
      }

      const grounded = this.physics.isBodyGrounded(handle);

      // ── 2. Coyote time ────────────────────────────────────────────────────
      // Arms when the player walks off an edge (grounded last frame → airborne
      // this frame). Ticks down by one each airborne frame.
      if (grounded) {
        player.coyoteTimer = 0;
      } else if (player.isGrounded) {
        // Transition: just left the ground → arm the coyote window.
        player.coyoteTimer = runtimeConfig.coyoteFrames;
      } else if (player.coyoteTimer > 0) {
        player.coyoteTimer--;
      }
      player.isGrounded = grounded;

      const canJump = grounded || player.coyoteTimer > 0;

      // ── 3. Jump buffer ────────────────────────────────────────────────────
      // Stores a jump request for up to jumpBufferFrames so a jump pressed
      // just before landing still fires on the next grounded frame.
      if (this.inputManager.isActionPressed(GameAction.Jump)) {
        player.jumpBufferTimer = runtimeConfig.jumpBufferFrames;
      } else if (player.jumpBufferTimer > 0) {
        player.jumpBufferTimer--;
      }

      // ── 4. Determine vertical velocity ───────────────────────────────────
      // Y is owned by PhysicsEngine (gravity integration). MovementSystem only
      // injects the initial jump impulse; every other frame it passes the
      // existing physics Y velocity through unchanged.
      const physVel = this.physics.getVelocity(handle);
      let vy = physVel?.y ?? 0;

      if (player.jumpBufferTimer > 0 && canJump) {
        vy = runtimeConfig.jumpImpulse;
        player.jumpBufferTimer = 0;
        player.coyoteTimer = 0;
      }

      // ── 5. Horizontal velocity ────────────────────────────────────────────
      const intent = this.inputManager.getMovementIntent();
      const cfg = runtimeConfig;

      // Air control reduces the effective target speed while airborne.
      const controlFactor = grounded ? 1.0 : cfg.airControlFactor;
      const targetX = intent.x * cfg.walkSpeed * controlFactor;
      const targetZ = intent.z * cfg.walkSpeed * controlFactor;

      // Acceleration rate (u/s²): walkSpeed / time-to-reach-full-speed
      const accelRate = cfg.walkSpeed / cfg.acceleration;
      const decelRate = cfg.walkSpeed / cfg.deceleration;

      // Use accel rate when there is input on that axis; decel when releasing.
      const newVx = moveToward(
        velocity.dx,
        targetX,
        (intent.x !== 0 ? accelRate : decelRate) * dt,
      );
      const newVz = moveToward(
        velocity.dz,
        targetZ,
        (intent.z !== 0 ? accelRate : decelRate) * dt,
      );

      // Keep ECS velocity in sync for systems that may inspect it.
      velocity.dx = newVx;
      velocity.dz = newVz;
      velocity.dy = vy;

      // ── 6. Write velocity to physics body ─────────────────────────────────
      this.physics.setVelocity(handle, { x: newVx, y: vy, z: newVz });

      // ── 7. Rotate mesh to face movement direction ─────────────────────────
      // atan2(x, z) measures angle from +Z toward +X in the XZ plane.
      if (intent.x !== 0 || intent.z !== 0) {
        transform.rotationY = Math.atan2(intent.x, intent.z);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private — swimming physics
  // ---------------------------------------------------------------------------

  /**
   * Apply swimming movement physics for an entity that has SwimmingState.
   *
   * Horizontal: blends from walkSpeed → swimSpeedSurface/Dive using transitionBlend
   *             so the speed change at the water boundary is smooth (no pop).
   * Vertical:   Buoyancy — float at waterSurfaceY + collisionRadius by default.
   *             Diving (Shift held) — descend at swimSpeedVertical.
   *             Ascending (released Shift while submerged) — rise at swimSpeedAscend.
   */
  private applySwimmingPhysics(
    handle: import("../engine/PhysicsEngine").BodyHandle,
    transform: Transform,
    velocity: Velocity,
    swimming: SwimmingState,
    dt: number,
  ): void {
    const cfg = runtimeConfig;

    // Update dive state from input
    swimming.isDiving = this.inputManager.isActionHeld(GameAction.Dive);

    // Ramp blend in over ~0.3s to smooth the speed transition at water entry
    swimming.transitionBlend = Math.min(1, swimming.transitionBlend + dt / 0.3);

    // Target horizontal speed based on dive state, blended from walk speed on entry
    const targetSpeedH = swimming.isDiving ? cfg.swimSpeedDive : cfg.swimSpeedSurface;
    const blendedSpeed = lerp(cfg.walkSpeed, targetSpeedH, swimming.transitionBlend);
    const accelRate = targetSpeedH / cfg.swimAcceleration;

    const intent = this.inputManager.getMovementIntent();
    const newVx = moveToward(velocity.dx, intent.x * blendedSpeed, accelRate * dt);
    const newVz = moveToward(velocity.dz, intent.z * blendedSpeed, accelRate * dt);

    // Y position of player center when floating on the water surface
    const floatY = swimming.waterSurfaceY + cfg.collisionRadius;

    let vy: number;
    if (swimming.isDiving) {
      // Descend at dive speed
      vy = -cfg.swimSpeedVertical;
    } else if (transform.y < floatY - 0.02) {
      // Below surface — rise
      vy = cfg.swimSpeedAscend;
    } else {
      // At or above surface — float: zero Y velocity and snap to float level
      vy = 0;
      transform.y = floatY;
      this.physics.setPosition(handle, { x: transform.x, y: floatY, z: transform.z });
    }

    velocity.dx = newVx;
    velocity.dz = newVz;
    velocity.dy = vy;

    this.physics.setVelocity(handle, { x: newVx, y: vy, z: newVz });

    if (intent.x !== 0 || intent.z !== 0) {
      transform.rotationY = Math.atan2(intent.x, intent.z);
    }
  }
}

/**
 * Moves `current` toward `target` by at most `maxDelta`.
 * Returns `target` exactly if within range (avoids float jitter at rest).
 */
function moveToward(
  current: number,
  target: number,
  maxDelta: number,
): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
