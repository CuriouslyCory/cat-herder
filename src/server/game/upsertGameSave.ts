import { gameSaves } from "~/server/db/schema";
import type { SaveData } from "~/game/state/SaveData";
import type { db as DbType } from "~/server/db";

export async function upsertGameSave(
  db: typeof DbType,
  userId: string,
  version: string,
  saveData: SaveData,
): Promise<void> {
  await db
    .insert(gameSaves)
    .values({ userId, version, saveData })
    .onConflictDoUpdate({
      target: gameSaves.userId,
      set: { version, saveData },
    });
}
