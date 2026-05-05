import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { characters, gameSaves, debugOverrides } from "~/server/db/schema";
import { saveDataSchema } from "~/game/state/SaveData";

export const gameRouter = createTRPCRouter({
  getCharacter: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.characters.findFirst({
      where: eq(characters.userId, ctx.user.id),
    });
    return row ?? null;
  }),

  upsertCharacter: protectedProcedure
    .input(
      z.object({
        shape: z.enum(["box", "sphere", "cylinder"]),
        colorHex: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color, e.g. #ff0000"),
        sizeScale: z.number().min(0.5).max(2.0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(characters)
        .values({
          userId: ctx.user.id,
          shape: input.shape,
          colorHex: input.colorHex,
          sizeScale: input.sizeScale,
        })
        .onConflictDoUpdate({
          target: characters.userId,
          set: {
            shape: input.shape,
            colorHex: input.colorHex,
            sizeScale: input.sizeScale,
          },
        });
    }),

  getSave: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.gameSaves.findFirst({
      where: eq(gameSaves.userId, ctx.user.id),
    });
    if (!row) return null;
    return { version: row.version, saveData: row.saveData };
  }),

  upsertSave: protectedProcedure
    .input(
      z.object({
        version: z.string(),
        saveData: saveDataSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(gameSaves)
        .values({
          userId: ctx.user.id,
          version: input.version,
          saveData: input.saveData,
        })
        .onConflictDoUpdate({
          target: gameSaves.userId,
          set: {
            version: input.version,
            saveData: input.saveData,
          },
        });
    }),

  deleteSave: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(gameSaves)
      .where(eq(gameSaves.userId, ctx.user.id));
  }),

  getDebugOverrides: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.debugOverrides.findFirst({
      where: eq(debugOverrides.userId, ctx.user.id),
    });
    return row?.overrides ?? null;
  }),

  upsertDebugOverrides: protectedProcedure
    .input(z.object({ overrides: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(debugOverrides)
        .values({
          userId: ctx.user.id,
          overrides: input.overrides,
        })
        .onConflictDoUpdate({
          target: debugOverrides.userId,
          set: { overrides: input.overrides },
        });
    }),
});
