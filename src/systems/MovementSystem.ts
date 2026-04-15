import type { System } from "../ecs/System";
import type { World } from "../ecs/World";
import type { InputManager } from "../engine/InputManager";
import type { Transform } from "../ecs/components/Transform";
import type { Velocity } from "../ecs/components/Velocity";
import type { PlayerControlled } from "../ecs/components/PlayerControlled";
import { TRANSFORM } from "../ecs/components/Transform";
import { VELOCITY } from "../ecs/components/Velocity";
import { PLAYER_CONTROLLED } from "../ecs/components/PlayerControlled";
import { runtimeConfig } from "../config";
import { GameAction } from "../types";

export class MovementSystem implements System {
  constructor(private readonly input: InputManager) {}

  update(world: World, dt: number): void {
    const entities = world.query(TRANSFORM, VELOCITY, PLAYER_CONTROLLED);
    const config = runtimeConfig;

    for (const entity of entities) {
      const transform = world.getComponent<Transform>(entity, TRANSFORM);
      const velocity = world.getComponent<Velocity>(entity, VELOCITY);
      const player = world.getComponent<PlayerControlled>(entity, PLAYER_CONTROLLED);
      if (!transform || !velocity || !player) continue;

      const intent = this.input.getMovementIntent();
      const targetVx = intent.x * config.walkSpeed;
      const targetVz = intent.z * config.walkSpeed;

      // Acceleration / deceleration
      const accelFactor = player.isGrounded ? 1 : config.airControlFactor;
      const accelRate = config.walkSpeed / config.acceleration; // u/s²
      const decelRate = config.walkSpeed / config.deceleration; // u/s²

      velocity.dx = lerpVelocity(velocity.dx, targetVx * accelFactor, accelRate, decelRate, dt);
      velocity.dz = lerpVelocity(velocity.dz, targetVz * accelFactor, accelRate, decelRate, dt);

      // Facing direction — mesh rotates toward movement
      if (intent.x !== 0 || intent.z !== 0) {
        const targetAngle = Math.atan2(intent.x, intent.z);
        transform.rotation.y = lerpAngle(transform.rotation.y, targetAngle, 15 * dt);
      }

      // Jump buffer tick
      if (this.input.isActionPressed(GameAction.Jump)) {
        player.jumpBufferTimer = config.jumpBufferFrames;
      } else if (player.jumpBufferTimer > 0) {
        player.jumpBufferTimer--;
      }

      // Coyote time tick
      if (player.isGrounded) {
        player.coyoteTimer = config.coyoteFrames;
      } else if (player.coyoteTimer > 0) {
        player.coyoteTimer--;
      }

      // Execute jump if buffer is active and coyote window is open
      const canJump = player.coyoteTimer > 0;
      if (player.jumpBufferTimer > 0 && canJump) {
        velocity.dy = config.jumpImpulse;
        player.jumpBufferTimer = 0;
        player.coyoteTimer = 0;
        player.isGrounded = false;
      }

      // Gravity
      if (!player.isGrounded) {
        velocity.dy += config.gravity * dt;
      } else {
        velocity.dy = Math.max(0, velocity.dy);
      }

      // Integrate position
      transform.position.x += velocity.dx * dt;
      transform.position.y += velocity.dy * dt;
      transform.position.z += velocity.dz * dt;

      // Ground clamp — y must not go below 0 (simple flat world assumption;
      // real ground detection is handled by PhysicsEngine/CollisionSystem)
      if (transform.position.y <= 0) {
        transform.position.y = 0;
        velocity.dy = 0;
        player.isGrounded = true;
      } else if (transform.position.y > 0.01) {
        player.isGrounded = false;
      }
    }
  }
}

function lerpVelocity(
  current: number,
  target: number,
  accelRate: number,
  decelRate: number,
  dt: number,
): number {
  if (Math.abs(target) < 0.001 && Math.abs(current) > 0.001) {
    // Decelerating
    const delta = decelRate * dt;
    return Math.abs(current) <= delta ? 0 : current - Math.sign(current) * delta;
  }
  // Accelerating toward target
  const delta = accelRate * dt;
  if (current < target) return Math.min(current + delta, target);
  if (current > target) return Math.max(current - delta, target);
  return current;
}

function lerpAngle(current: number, target: number, speed: number): number {
  let diff = target - current;
  // Wrap to [-π, π]
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  if (Math.abs(diff) < 0.001) return target;
  return current + Math.sign(diff) * Math.min(Math.abs(diff), speed);
}
