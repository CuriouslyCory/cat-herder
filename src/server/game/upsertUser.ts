import { env } from "~/env";
import { users } from "~/server/db/schema";
import type { db as DbType } from "~/server/db";

/**
 * Upsert a user row on first authenticated touch.
 *
 * Design decisions:
 * - `.onConflictDoNothing()` means a second login never modifies the stored
 *   `isAdmin` value. Bootstrap is consulted only when inserting a new row.
 * - The follow-up `findFirst` returns the actual stored value regardless of
 *   whether this call inserted or conflicted, which is correct without a
 *   transaction because neon-http does not support interactive transactions.
 *
 * Known trade-off: because we use `.onConflictDoNothing()`, a WorkOS email
 * change will NOT be reflected in the `email` column after the first insert.
 * If email sync is required later, switch to:
 *   `.onConflictDoUpdate({ target: users.userId, set: { email } })`
 */
export async function upsertUser(
  db: typeof DbType,
  userId: string,
  email: string,
): Promise<{ isAdmin: boolean }> {
  const bootstrapEmails = (env.ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdminByBootstrap = bootstrapEmails.includes(email.toLowerCase());

  // Insert with bootstrap flag; if the row already exists, do nothing
  // (preserves any existing isAdmin value, including manual demotions).
  await db
    .insert(users)
    .values({ userId, email, isAdmin: isAdminByBootstrap })
    .onConflictDoNothing();

  // Re-read to return the actual stored value (insert path or conflict path).
  const row = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.userId, userId),
  });

  return { isAdmin: row?.isAdmin ?? false };
}
