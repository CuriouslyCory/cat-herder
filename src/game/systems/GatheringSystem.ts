import type { World } from "../ecs/World";
import type { Entity } from "../ecs/Entity";
import type { EventBus } from "../engine/EventBus";
import type { InputManager } from "../engine/InputManager";
import type { SceneManager } from "../engine/SceneManager";
import type { GameState } from "../engine/GameState";
import type { ResourceNode } from "../ecs/components/ResourceNode";
import type { Transform } from "../ecs/components/Transform";
import type { Renderable } from "../ecs/components/Renderable";
import { GameAction } from "../types";

// ---------------------------------------------------------------------------
// GatheringSystem
//
// Each fixed tick:
//   1. Tick all active cooldowns; restore visual when cooldown expires.
//   2. Find the nearest ready ResourceNode within INTERACT_RANGE of the player.
//   3. If E is pressed with a valid node in range → start gathering (unless full).
//   4. If gathering: tick progress; cancel on movement or second E press.
//   5. On complete: add resource to GameState inventory, enter cooldown, dim mesh.
// ---------------------------------------------------------------------------

/** Player must be within this many world units to interact with a node. */
const INTERACT_RANGE_SQ = 2.0 * 2.0; // 4 u²

/** Opacity applied to a node mesh while it is on cooldown. */
const COOLDOWN_OPACITY = 0.25;

export interface GatherState {
  /** [0-1] completion fraction. */
  progress: number;
  /** E.g. "+1 Grass" — shown in the HUD progress label. */
  label: string;
}

/** Duration (seconds) the "Inventory Full" notification remains visible. */
const INVENTORY_FULL_DISPLAY_TIME = 2.0;

export class GatheringSystem {
  private activeNodeEntity: Entity | null = null;
  private gatherTimer = 0;
  /** Cached gather state for HUD consumption (variable-rate render reads this). */
  private _gatherState: GatherState | null = null;
  /** Countdown timer for the "Inventory Full" HUD notification. */
  private _inventoryFullTimer = 0;

  constructor(
    private readonly inputManager: InputManager,
    private readonly sceneManager: SceneManager,
    private readonly gameState: GameState,
    private readonly eventBus: EventBus,
    private readonly getPlayerEntity: () => Entity | null,
  ) {}

  update(world: World, dt: number): void {
    const playerEntity = this.getPlayerEntity();
    if (!playerEntity) return;

    const playerTransform = world.getComponent<Transform>(playerEntity, "Transform");
    if (!playerTransform) return;

    // ── 0. Tick inventory-full notification timer ─────────────────────────────
    if (this._inventoryFullTimer > 0) {
      this._inventoryFullTimer = Math.max(0, this._inventoryFullTimer - dt);
    }

    // ── 1. Tick cooldowns ─────────────────────────────────────────────────────
    for (const entity of world.query("ResourceNode")) {
      const node = world.getComponent<ResourceNode>(entity, "ResourceNode");
      if (!node || node.cooldownRemaining <= 0) continue;

      node.cooldownRemaining = Math.max(0, node.cooldownRemaining - dt);

      if (node.cooldownRemaining === 0) {
        const renderable = world.getComponent<Renderable>(entity, "Renderable");
        if (renderable?.sceneHandle) {
          this.sceneManager.setMeshOpacity(renderable.sceneHandle, 1);
        }
      }
    }

    // ── 2. Find nearest ready node in interaction range ───────────────────────
    let nearestEntity: Entity | null = null;
    let nearestDistSq = Infinity;

    for (const entity of world.query("ResourceNode", "Transform")) {
      const node = world.getComponent<ResourceNode>(entity, "ResourceNode");
      if (!node || node.cooldownRemaining > 0) continue;

      const transform = world.getComponent<Transform>(entity, "Transform");
      if (!transform) continue;

      const dx = transform.x - playerTransform.x;
      const dz = transform.z - playerTransform.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < INTERACT_RANGE_SQ && distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearestEntity = entity;
      }
    }

    const ePressed = this.inputManager.isActionPressed(GameAction.Interact);
    const intent = this.inputManager.getMovementIntent();
    const isMoving = intent.x !== 0 || intent.z !== 0;

    // ── 3. Handle active gathering ────────────────────────────────────────────
    if (this.activeNodeEntity !== null) {
      const activeNode = world.isAlive(this.activeNodeEntity)
        ? world.getComponent<ResourceNode>(this.activeNodeEntity, "ResourceNode")
        : null;

      // Cancel on movement, second E press, or node gone
      if (!activeNode || isMoving || ePressed) {
        if (activeNode) {
          activeNode.isBeingGathered = false;
          activeNode.gatherProgress = 0;
        }
        this.activeNodeEntity = null;
        this.gatherTimer = 0;
        this._gatherState = null;
        return;
      }

      // Tick gathering progress
      this.gatherTimer += dt;
      activeNode.gatherProgress = Math.min(1, this.gatherTimer / activeNode.gatherTime);
      this._gatherState = {
        progress: activeNode.gatherProgress,
        label: `+${activeNode.yieldAmount} ${activeNode.resourceType}`,
      };

      if (this.gatherTimer >= activeNode.gatherTime) {
        // Re-check capacity before committing — inventory may have changed mid-gather.
        if (!this.gameState.hasInventorySpace(activeNode.yieldAmount)) {
          activeNode.isBeingGathered = false;
          activeNode.gatherProgress = 0;
          this.activeNodeEntity = null;
          this.gatherTimer = 0;
          this._gatherState = null;
          this._inventoryFullTimer = INVENTORY_FULL_DISPLAY_TIME;
          return;
        }

        // ── Complete ──────────────────────────────────────────────────────────
        this.gameState.addResource(activeNode.resourceType, activeNode.yieldAmount);
        this.eventBus.emit({
          type: "resource:gathered",
          resourceType: activeNode.resourceType,
          nodeEntity: this.activeNodeEntity,
        });

        activeNode.isBeingGathered = false;
        activeNode.gatherProgress = 0;
        activeNode.cooldownRemaining = activeNode.respawnTime;

        const renderable = world.getComponent<Renderable>(
          this.activeNodeEntity,
          "Renderable",
        );
        if (renderable?.sceneHandle) {
          this.sceneManager.setMeshOpacity(renderable.sceneHandle, COOLDOWN_OPACITY);
        }

        this.activeNodeEntity = null;
        this.gatherTimer = 0;
        this._gatherState = null;
      }

      return;
    }

    // ── 4. Start gathering on E press ─────────────────────────────────────────
    if (ePressed && nearestEntity !== null) {
      const candidateNode = world.getComponent<ResourceNode>(nearestEntity, "ResourceNode");
      if (!candidateNode || candidateNode.cooldownRemaining > 0) return;

      if (!this.gameState.hasInventorySpace(candidateNode.yieldAmount)) {
        this._inventoryFullTimer = INVENTORY_FULL_DISPLAY_TIME;
        return;
      }

      const node = candidateNode;

      node.isBeingGathered = true;
      node.gatherProgress = 0;
      this.activeNodeEntity = nearestEntity;
      this.gatherTimer = 0;
      this._gatherState = { progress: 0, label: `+${node.yieldAmount} ${node.resourceType}` };
    }
  }

  /**
   * Returns the current gathering progress snapshot, or null if not gathering.
   * Read once per render frame by buildHUDState().
   */
  getGatherState(): GatherState | null {
    return this._gatherState;
  }

  /** True while the "Inventory Full" notification should be visible. */
  isInventoryFull(): boolean {
    return this._inventoryFullTimer > 0;
  }
}
