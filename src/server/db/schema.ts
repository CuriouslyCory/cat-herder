import { sql } from "drizzle-orm";
import { index, pgTableCreator } from "drizzle-orm/pg-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `cat-herder_${name}`);

export const posts = createTable(
  "post",
  (d) => ({
    id: d.serial().primaryKey(),
    name: d.varchar({ length: 256 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .$onUpdate(() => new Date()),
  }),
  (t) => [index("name_idx").on(t.name)],
);

// One character per WorkOS user (userId = WorkOS user.id, e.g. user_01XXXXXXXXXXXXXXXXXXXXXXXX)
export const characters = createTable("character", (d) => ({
  userId: d.varchar({ length: 256 }).primaryKey(),
  shape: d.varchar({ length: 32 }).notNull(), // "box" | "sphere" | "cylinder"
  colorHex: d.varchar({ length: 7 }).notNull(), // e.g. "#ff0000"
  sizeScale: d.real().notNull(), // 0.5 – 2.0
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: d
    .timestamp({ withTimezone: true })
    .$onUpdate(() => new Date()),
}));

export const gameSaves = createTable("game_save", (d) => ({
  userId: d.varchar({ length: 256 }).primaryKey(),
  version: d.varchar({ length: 32 }).notNull(), // e.g. "0.1"
  saveData: d.jsonb().notNull(), // opaque JSON; concrete shape defined in PRD-03
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: d
    .timestamp({ withTimezone: true })
    .$onUpdate(() => new Date()),
}));

// Reserved for PRD-03 debug menu; never auto-applied on load
export const debugOverrides = createTable("debug_override", (d) => ({
  userId: d.varchar({ length: 256 }).primaryKey(),
  overrides: d.jsonb().notNull(),
  updatedAt: d
    .timestamp({ withTimezone: true })
    .$onUpdate(() => new Date()),
}));
