import { z } from "zod";

import { CatType, ResourceType } from "../types";

export const CURRENT_VERSION = "0.1";

const vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const saveDataSchema = z.object({
  character: z.object({
    appearance: z.record(z.string(), z.unknown()),
    stats: z.object({
      level: z.number().int().min(0).max(10),
      health: z.number().min(0),
      maxHealth: z.number().positive(),
    }),
    inventory: z.array(
      z.object({
        resourceType: z.nativeEnum(ResourceType),
        quantity: z.number().int().min(0),
      }),
    ),
    position: vec3Schema,
    yarn: z.number().min(0),
    oxygen: z.number().min(0),
    abilities: z.array(z.string()),
  }),
  world: z.object({
    currentMapId: z.string(),
    activeCats: z.array(
      z.object({ catType: z.nativeEnum(CatType), position: vec3Schema }),
    ),
    resourceNodeCooldowns: z.array(
      z.object({
        nodeId: z.string(),
        cooldownRemaining: z.number().min(0),
      }),
    ),
    hiddenTerrain: z.array(z.number().int()),
  }),
  session: z.object({
    totalPlaytimeMs: z.number().min(0),
  }),
});

export type SaveData = z.infer<typeof saveDataSchema>;
