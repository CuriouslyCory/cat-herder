import { pgTable, text, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";

// ─── Characters ───────────────────────────────────────────────────────────────

export const characters = pgTable("characters", {
  userId: text("user_id").primaryKey(),
  shape: text("shape").notNull(),
  colorHex: text("color_hex").notNull(),
  sizeScale: numeric("size_scale", { precision: 4, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Game Saves ───────────────────────────────────────────────────────────────

export const gameSaves = pgTable("game_saves", {
  userId: text("user_id").primaryKey(),
  version: text("version").notNull(),
  saveData: jsonb("save_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Debug Overrides ─────────────────────────────────────────────────────────

export const debugOverrides = pgTable("debug_overrides", {
  userId: text("user_id").primaryKey(),
  overrides: jsonb("overrides").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
