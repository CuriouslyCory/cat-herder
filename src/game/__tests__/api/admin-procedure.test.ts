import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock functions so they can be referenced inside vi.mock factories.
// vi.mock factories are hoisted to the top of the file, so any variables they
// reference must themselves be hoisted via vi.hoisted().
// ---------------------------------------------------------------------------
const { mockFindFirst, mockOnConflictDoNothing, mockValues, mockInsert } =
  vi.hoisted(() => {
    const mockFindFirst = vi.fn();
    const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi
      .fn()
      .mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    return { mockFindFirst, mockOnConflictDoNothing, mockValues, mockInsert };
  });

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: {
    DATABASE_URL: "postgresql://mock/mock",
    NODE_ENV: "test",
    ADMIN_BOOTSTRAP_EMAILS: "admin@example.com",
  },
}));

// Mock DB: tests configure mockFindFirst to control query results.
// The insert chain mock is used in upsertUser bootstrap tests.
vi.mock("~/server/db", () => ({
  db: {
    insert: mockInsert,
    query: {
      users: { findFirst: mockFindFirst },
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks are in place
// ---------------------------------------------------------------------------
import { TRPCError } from "@trpc/server";
import {
  createTRPCContext,
  createTRPCRouter,
  adminProcedure,
  createCallerFactory,
} from "~/server/api/trpc";
import { upsertUser } from "~/server/game/upsertUser";
import { db } from "~/server/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal tRPC context for test purposes.
 * Passing user: null simulates an unauthenticated request.
 */
async function makeCtx(user: { id: string } | null) {
  return createTRPCContext({
    headers: new Headers(),
    user: user as never,
    accessToken: null,
    organizationId: null,
  });
}

/**
 * Minimal inline router that exposes a single adminProcedure endpoint.
 * We use this instead of shipping a throwaway production endpoint.
 */
const testRouter = createTRPCRouter({
  adminOnly: adminProcedure.query(() => ({ ok: true })),
});

const createCaller = createCallerFactory(testRouter);

// ---------------------------------------------------------------------------
// adminProcedure tests
// ---------------------------------------------------------------------------

describe("adminProcedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset insert chain after clearAllMocks wipes mock return values
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });
    // Default: no row found (safest default for admin gate)
    mockFindFirst.mockResolvedValue(undefined);
  });

  it("unauthenticated → throws UNAUTHORIZED and does not call findFirst", async () => {
    const ctx = await makeCtx(null);
    const caller = createCaller(ctx);

    try {
      await caller.adminOnly();
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as TRPCError).code).toBe("UNAUTHORIZED");
    }

    // findFirst must not be called — auth check happens before admin check
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("authenticated non-admin → throws FORBIDDEN", async () => {
    mockFindFirst.mockResolvedValueOnce({ isAdmin: false });
    const ctx = await makeCtx({ id: "user_123" });
    const caller = createCaller(ctx);

    try {
      await caller.adminOnly();
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN");
    }
  });

  it("authenticated, no user row → throws FORBIDDEN", async () => {
    mockFindFirst.mockResolvedValueOnce(undefined);
    const ctx = await makeCtx({ id: "user_orphan" });
    const caller = createCaller(ctx);

    try {
      await caller.adminOnly();
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN");
    }
  });

  it("authenticated admin → passes through and returns result", async () => {
    mockFindFirst.mockResolvedValueOnce({ isAdmin: true });
    const ctx = await makeCtx({ id: "user_admin" });
    const caller = createCaller(ctx);

    const result = await caller.adminOnly();

    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// upsertUser bootstrap tests
// ---------------------------------------------------------------------------

describe("upsertUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore insert chain return values after clearAllMocks
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it("first insert sets isAdmin for a bootstrap email", async () => {
    // findFirst returns the row as if just inserted with isAdmin: true
    mockFindFirst.mockResolvedValueOnce({ isAdmin: true });

    const result = await upsertUser(db, "user_1", "admin@example.com");

    expect(result).toEqual({ isAdmin: true });
    // Confirm insert was called with isAdmin: true for the bootstrap email
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", isAdmin: true }),
    );
    expect(mockOnConflictDoNothing).toHaveBeenCalled();
  });

  it("conflict path does not flip isAdmin (simulates previously demoted admin)", async () => {
    // findFirst returns false — simulating a demoted user; the conflict did nothing
    mockFindFirst.mockResolvedValueOnce({ isAdmin: false });

    const result = await upsertUser(db, "user_1", "admin@example.com");

    // Result reflects what is stored in the DB, not what bootstrap would have set
    expect(result).toEqual({ isAdmin: false });
    // onConflictDoNothing was still called (not onConflictDoUpdate)
    expect(mockOnConflictDoNothing).toHaveBeenCalled();
  });

  it("non-bootstrap email gets isAdmin: false", async () => {
    mockFindFirst.mockResolvedValueOnce({ isAdmin: false });

    const result = await upsertUser(db, "user_2", "notadmin@example.com");

    expect(result).toEqual({ isAdmin: false });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ isAdmin: false }),
    );
  });

  it("returns isAdmin: false when no row found after upsert (unexpected DB state guard)", async () => {
    mockFindFirst.mockResolvedValueOnce(undefined);

    const result = await upsertUser(db, "user_3", "someone@example.com");

    expect(result).toEqual({ isAdmin: false });
  });
});
