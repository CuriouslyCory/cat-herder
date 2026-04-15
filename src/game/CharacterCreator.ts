import type { World } from "../ecs/World";
import type { MapManager } from "./MapManager";
import type { NeonClient } from "../modules/persistence/NeonClient";
import type { CharacterAppearance } from "../ui/CharacterCreatorUI";
import { CharacterCreatorUI } from "../ui/CharacterCreatorUI";
import { createTransform } from "../ecs/components/Transform";
import { createRenderable } from "../ecs/components/Renderable";
import { createVelocity } from "../ecs/components/Velocity";
import { createCollider } from "../ecs/components/Collider";
import { createPlayerControlled } from "../ecs/components/PlayerControlled";
import type { Entity } from "../ecs/Entity";

interface CharacterRecord {
  user_id: string;
  shape: string;
  color_hex: string;
  size_scale: string; // comes back as string from PostgREST
}

export class CharacterCreator {
  constructor(
    private readonly world: World,
    private readonly mapManager: MapManager,
    private readonly neonClient: NeonClient,
    private readonly userId: string,
  ) {}

  /**
   * Check if a character exists in DB; if so, spawn it directly.
   * If not, show the creator UI, then save + spawn on confirm.
   */
  async initialize(): Promise<Entity> {
    const existing = await this.neonClient.select<CharacterRecord>("characters", {
      user_id: `eq.${this.userId}`,
    });

    if (existing.length > 0 && existing[0]) {
      const rec = existing[0];
      return this.spawnCharacter({
        shape: rec.shape as CharacterAppearance["shape"],
        color: rec.color_hex,
        size: parseFloat(rec.size_scale) as CharacterAppearance["size"],
      });
    }

    return new Promise<Entity>((resolve) => {
      const ui = new CharacterCreatorUI((appearance) => {
        ui.dismiss();
        this.saveCharacter(appearance)
          .then(() => {
            const entity = this.spawnCharacter(appearance);
            resolve(entity);
          })
          .catch(console.error);
      });
    });
  }

  private async saveCharacter(appearance: CharacterAppearance): Promise<void> {
    await this.neonClient.upsert("characters", {
      user_id: this.userId,
      shape: appearance.shape,
      color_hex: appearance.color,
      size_scale: appearance.size,
    });
  }

  private spawnCharacter(appearance: CharacterAppearance): Entity {
    const spawnPoints = this.mapManager.getSpawnPoints().filter((sp) => sp.type === "player");
    const spawn = spawnPoints[0] ?? { x: 30, z: 30 };

    const entity = this.world.createEntity();
    const s = appearance.size;

    this.world.addComponent(
      entity,
      createTransform(
        { x: spawn.x, y: s / 2, z: spawn.z },
        { x: 0, y: 0, z: 0 },
        { x: s, y: s, z: s },
      ),
    );

    this.world.addComponent(
      entity,
      createRenderable({
        geometry: appearance.shape,
        size: [s, s, s],
        color: appearance.color,
        castShadow: true,
      }),
    );

    this.world.addComponent(entity, createVelocity());
    this.world.addComponent(
      entity,
      createCollider("sphere", { x: 0.4 * s, y: s, z: 0.4 * s }),
    );
    this.world.addComponent(entity, createPlayerControlled());

    return entity;
  }
}
