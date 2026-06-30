import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  adminProcedure,
} from "~/server/api/trpc";
import { maps } from "~/server/db/schema";
import { mapDataSchema } from "~/game/maps/MapDataSchema";
import { TestMap } from "~/game/maps/TestMap";

export const mapRouter = createTRPCRouter({
  /**
   * PUBLIC — players need this at boot time; no auth required.
   *
   * Returns the default map's mapData. If no default row exists (table empty
   * or invariant violated), seeds a row from the built-in TestMap and returns
   * it.  The onConflictDoNothing + re-fetch path handles the race where two
   * concurrent boot requests both see an empty table.
   */
  getDefaultMap: publicProcedure.query(async ({ ctx }) => {
    const existing = await ctx.db.query.maps.findFirst({
      where: eq(maps.isDefault, true),
    });
    if (existing) {
      return { id: existing.id, name: existing.name, mapData: existing.mapData };
    }

    // Table empty or no default — seed from built-in TestMap
    const [seeded] = await ctx.db
      .insert(maps)
      .values({
        name: TestMap.name,
        mapData: TestMap as unknown as Record<string, unknown>,
        isDefault: true,
        ownerUserId: null,
      })
      .onConflictDoNothing()
      .returning();

    if (!seeded) {
      // Race condition: another request seeded it first; re-fetch
      const race = await ctx.db.query.maps.findFirst({
        where: eq(maps.isDefault, true),
      });
      return race ? { id: race.id, name: race.name, mapData: race.mapData } : null;
    }

    return { id: seeded.id, name: seeded.name, mapData: seeded.mapData };
  }),

  /**
   * ADMIN — list all maps (summary only, no mapData blob).
   */
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: maps.id,
        name: maps.name,
        isDefault: maps.isDefault,
        createdAt: maps.createdAt,
      })
      .from(maps)
      .orderBy(maps.id);
  }),

  /**
   * ADMIN — get a single map including its full mapData.
   */
  get: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.maps.findFirst({
        where: eq(maps.id, input.id),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Map not found" });
      return row;
    }),

  /**
   * ADMIN — create or update a map.
   *
   * When `id` is absent, inserts a new (non-default) row owned by the current
   * admin user.  When `id` is present, updates name and mapData for that row
   * (isDefault is NOT changed here — use setDefault for that).
   */
  save: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().min(1).max(256),
        mapData: mapDataSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id === undefined) {
        // Create
        const [created] = await ctx.db
          .insert(maps)
          .values({
            name: input.name,
            mapData: input.mapData as unknown as Record<string, unknown>,
            isDefault: false,
            ownerUserId: ctx.user.id,
          })
          .returning();
        return created;
      }

      // Update — verify exists first
      const existing = await ctx.db.query.maps.findFirst({
        where: eq(maps.id, input.id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Map not found" });

      const [updated] = await ctx.db
        .update(maps)
        .set({
          name: input.name,
          mapData: input.mapData as unknown as Record<string, unknown>,
        })
        .where(eq(maps.id, input.id))
        .returning();
      return updated;
    }),

  /**
   * ADMIN — atomically swap the default map.
   *
   * Uses db.batch([]) to send two UPDATE statements in a single HTTP request
   * that Neon executes atomically (neon-http has no interactive transactions;
   * db.batch is the atomic mechanism).
   */
  setDefault: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the target map exists first (throw before touching DB state)
      const target = await ctx.db.query.maps.findFirst({
        where: eq(maps.id, input.id),
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Map not found" });

      await ctx.db.batch([
        // Step 1: Clear current default (safe even if no row has isDefault = true)
        ctx.db.update(maps).set({ isDefault: false }).where(eq(maps.isDefault, true)),
        // Step 2: Set new default
        ctx.db.update(maps).set({ isDefault: true }).where(eq(maps.id, input.id)),
      ]);
    }),

  /**
   * ADMIN — delete a map.
   *
   * Guards:
   *  1. Row must exist → NOT_FOUND
   *  2. Row must not be the default → FORBIDDEN
   *  3. Must not be the only remaining map → FORBIDDEN
   */
  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.maps.findFirst({
        where: eq(maps.id, input.id),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Map not found" });
      if (row.isDefault) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete the default map",
        });
      }

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(maps);
      const count = countResult[0]?.count ?? 0;

      if (count <= 1) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete the only map",
        });
      }

      await ctx.db.delete(maps).where(eq(maps.id, input.id));
    }),
});
