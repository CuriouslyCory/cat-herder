import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock functions so they can be referenced inside vi.mock factories.
// vi.mock factories are hoisted to the top of the file, so any variables they
// reference must themselves be hoisted via vi.hoisted().
// ---------------------------------------------------------------------------
const {
  mockUsersFindFirst,
  mockMapsFindFirst,
  mockInsert,
  mockInsertValues,
  mockInsertReturning,
  mockOnConflictDoNothing,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
  mockDelete,
  mockDeleteWhere,
  mockSelect,
  mockSelectFrom,
  mockSelectOrderBy,
  makeFromResult,
  mockBatch,
} = vi.hoisted(() => {
  // ── delete chain ─────────────────────────────────────────────────────────
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

  // ── select chain (used in count query AND list) ──────────────────────────
  // list uses  .select({...}).from(maps).orderBy(maps.id) → awaitable at orderBy
  // delete uses .select({...}).from(maps)                  → awaitable at from
  // Solution: mockSelectFrom returns an object that is BOTH thenable (for the
  // count/delete path) AND exposes an orderBy method (for the list path).
  // mockSelectOrderBy is a plain resolved mock used for the list path.
  const mockSelectOrderBy = vi.fn().mockResolvedValue([]);
  // countResult default; tests can call mockSelectFrom.mockReturnValueOnce(makeFromResult(...))
  const makeFromResult = (countValue: unknown[] = [{ count: 2 }]) => ({
    orderBy: mockSelectOrderBy,
    then: (
      onFulfilled?: ((v: unknown) => unknown) | null,
      onRejected?: ((e: unknown) => unknown) | null,
    ) => Promise.resolve(countValue).then(onFulfilled, onRejected),
    catch: (onRejected?: ((e: unknown) => unknown) | null) =>
      Promise.resolve(countValue).catch(onRejected),
  });
  const mockSelectFrom = vi.fn().mockReturnValue(makeFromResult());
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  // ── insert chain ─────────────────────────────────────────────────────────
  const mockInsertReturning = vi.fn().mockResolvedValue([]);
  const mockOnConflictDoNothing = vi
    .fn()
    .mockReturnValue({ returning: mockInsertReturning });
  const mockInsertValues = vi
    .fn()
    .mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing, returning: mockInsertReturning });
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

  // ── update chain ─────────────────────────────────────────────────────────
  const mockUpdateReturning = vi.fn().mockResolvedValue([]);
  const mockUpdateWhere = vi
    .fn()
    .mockReturnValue({ returning: mockUpdateReturning });
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

  // ── batch ─────────────────────────────────────────────────────────────────
  const mockBatch = vi.fn().mockResolvedValue([]);

  // ── query.*.findFirst ────────────────────────────────────────────────────
  const mockUsersFindFirst = vi.fn();
  const mockMapsFindFirst = vi.fn();

  return {
    mockUsersFindFirst,
    mockMapsFindFirst,
    mockInsert,
    mockInsertValues,
    mockInsertReturning,
    mockOnConflictDoNothing,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockUpdateReturning,
    mockDelete,
    mockDeleteWhere,
    mockSelect,
    mockSelectFrom,
    mockSelectOrderBy,
    makeFromResult,
    mockBatch,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: {
    DATABASE_URL: "postgresql://mock/mock",
    NODE_ENV: "test",
    ADMIN_BOOTSTRAP_EMAILS: "admin@example.com",
  },
}));

// Mock DB: exposes mocked query, insert, update, delete, select, and batch.
vi.mock("~/server/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    select: mockSelect,
    batch: mockBatch,
    query: {
      users: { findFirst: mockUsersFindFirst },
      maps: { findFirst: mockMapsFindFirst },
    },
  },
}));

// Mock TestMap to a minimal valid shape so tests don't pull in the full 30×30 grid.
// TerrainType enum values use PascalCase (e.g. "Grass", not "grass").
vi.mock("~/game/maps/TestMap", () => ({
  TestMap: {
    name: "TestMap",
    size: { width: 4, depth: 4 },
    cellSize: 2,
    terrain: [
      [
        { type: "Grass", height: 0, navigable: true },
        { type: "Grass", height: 0, navigable: true },
      ],
      [
        { type: "Grass", height: 0, navigable: true },
        { type: "Grass", height: 0, navigable: true },
      ],
    ],
    spawnPoints: [{ x: 0, z: 0, role: "player" }],
    resourceNodes: [],
    yarnPickups: [],
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks are in place
// ---------------------------------------------------------------------------
import { TRPCError } from "@trpc/server";
import {
  createTRPCContext,
  createCallerFactory,
} from "~/server/api/trpc";
import { mapRouter } from "~/server/api/routers/map";
import { TerrainType } from "~/game/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeCtx(user: { id: string } | null) {
  return createTRPCContext({
    headers: new Headers(),
    user: user as never,
    accessToken: null,
    organizationId: null,
  });
}

const createCaller = createCallerFactory(mapRouter);

// Minimal valid MapData that passes mapDataSchema validation (2×2, cellSize=2 → size 4×4).
const validMapData = {
  name: "MyMap",
  size: { width: 4, depth: 4 },
  cellSize: 2,
  terrain: [
    [
      { type: TerrainType.Grass, height: 0, navigable: true },
      { type: TerrainType.Grass, height: 0, navigable: true },
    ],
    [
      { type: TerrainType.Grass, height: 0, navigable: true },
      { type: TerrainType.Grass, height: 0, navigable: true },
    ],
  ],
  spawnPoints: [{ x: 0, z: 0, role: "player" as const }],
  resourceNodes: [],
  yarnPickups: [],
};

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("map.getDefaultMap (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore chains after clearAllMocks wipes mock return values
    mockInsertReturning.mockResolvedValue([]);
    mockOnConflictDoNothing.mockReturnValue({ returning: mockInsertReturning });
    mockInsertValues.mockReturnValue({
      onConflictDoNothing: mockOnConflictDoNothing,
      returning: mockInsertReturning,
    });
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockSelectOrderBy.mockResolvedValue([]);
    mockSelectFrom.mockReturnValue(makeFromResult());
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockUpdateReturning.mockResolvedValue([]);
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockBatch.mockResolvedValue([]);
  });

  it("returns existing default map without seeding", async () => {
    const existingRow = { id: 1, name: "TestMap", mapData: validMapData, isDefault: true };
    mockMapsFindFirst.mockResolvedValueOnce(existingRow);

    const ctx = await makeCtx(null); // public — no auth needed
    const caller = createCaller(ctx);

    const result = await caller.getDefaultMap();

    expect(result).toEqual({ id: 1, name: "TestMap", mapData: validMapData });
    // insert must NOT have been called
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("seeds from TestMap when no default exists and returns seeded row", async () => {
    mockMapsFindFirst.mockResolvedValueOnce(undefined); // no default found
    const seededRow = { id: 1, name: "TestMap", mapData: validMapData };
    mockInsertReturning.mockResolvedValueOnce([seededRow]);

    const ctx = await makeCtx(null);
    const caller = createCaller(ctx);

    const result = await caller.getDefaultMap();

    expect(result).toEqual({ id: 1, name: "TestMap", mapData: validMapData });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ isDefault: true }),
    );
    expect(mockOnConflictDoNothing).toHaveBeenCalled();
  });

  it("handles seeding race condition: insert returns empty, re-fetches", async () => {
    const racedRow = { id: 1, name: "TestMap", mapData: validMapData, isDefault: true };
    // First findFirst: no default; second findFirst (re-fetch): row exists
    mockMapsFindFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(racedRow);
    // Insert returns empty (another request won the race)
    mockInsertReturning.mockResolvedValueOnce([]);

    const ctx = await makeCtx(null);
    const caller = createCaller(ctx);

    const result = await caller.getDefaultMap();

    expect(result).toEqual({ id: 1, name: "TestMap", mapData: validMapData });
    expect(mockMapsFindFirst).toHaveBeenCalledTimes(2);
  });

  it("unauthenticated user can call it without UNAUTHORIZED", async () => {
    mockMapsFindFirst.mockResolvedValueOnce({
      id: 1,
      name: "TestMap",
      mapData: validMapData,
    });

    const ctx = await makeCtx(null); // no user
    const caller = createCaller(ctx);

    await expect(caller.getDefaultMap()).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------

describe("map.list (admin gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateReturning.mockResolvedValue([]);
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockSelectOrderBy.mockResolvedValue([]);
    mockSelectFrom.mockReturnValue(makeFromResult());
    mockSelect.mockReturnValue({ from: mockSelectFrom });
  });

  it("unauthenticated → UNAUTHORIZED", async () => {
    const ctx = await makeCtx(null);
    const caller = createCaller(ctx);

    await expect(caller.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mockUsersFindFirst).not.toHaveBeenCalled();
  });

  it("non-admin → FORBIDDEN", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: false });
    const ctx = await makeCtx({ id: "user_nonadmin" });
    const caller = createCaller(ctx);

    await expect(caller.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin → returns map summary array", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: true });
    const rows = [{ id: 1, name: "TestMap", isDefault: true, createdAt: new Date() }];
    // list uses db.select().from().orderBy() — orderBy is the awaitable terminal
    mockSelectOrderBy.mockResolvedValueOnce(rows);

    const ctx = await makeCtx({ id: "user_admin" });
    const caller = createCaller(ctx);

    const result = await caller.list();
    expect(result).toEqual(rows);
  });
});

// ---------------------------------------------------------------------------

describe("map.save (admin + validation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([]);
    mockOnConflictDoNothing.mockReturnValue({ returning: mockInsertReturning });
    mockInsertValues.mockReturnValue({
      onConflictDoNothing: mockOnConflictDoNothing,
      returning: mockInsertReturning,
    });
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockUpdateReturning.mockResolvedValue([]);
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockSelectOrderBy.mockResolvedValue([]);
    mockSelectFrom.mockReturnValue(makeFromResult());
    mockSelect.mockReturnValue({ from: mockSelectFrom });
  });

  it("admin, valid mapData, no id → inserts new row", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: true });
    const createdRow = { id: 2, name: "MyMap", mapData: validMapData, isDefault: false };
    mockInsertReturning.mockResolvedValueOnce([createdRow]);

    const ctx = await makeCtx({ id: "user_admin" });
    const caller = createCaller(ctx);

    const result = await caller.save({ name: "MyMap", mapData: validMapData });

    expect(result).toEqual(createdRow);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "MyMap", isDefault: false }),
    );
  });

  it("admin, invalid mapData (empty terrain) → BAD_REQUEST via Zod", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: true });

    const ctx = await makeCtx({ id: "user_admin" });
    const caller = createCaller(ctx);

    await expect(
      caller.save({
        name: "Bad",
        mapData: {
          ...validMapData,
          terrain: [], // violates mapDataSchema non-empty check
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("non-admin → FORBIDDEN", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: false });

    const ctx = await makeCtx({ id: "user_nonadmin" });
    const caller = createCaller(ctx);

    await expect(
      caller.save({ name: "MyMap", mapData: validMapData }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ---------------------------------------------------------------------------

describe("map.setDefault (atomic batched swap)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateReturning.mockResolvedValue([]);
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockBatch.mockResolvedValue([]);
  });

  it("admin, valid id → calls db.batch with two updates", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: true });
    mockMapsFindFirst.mockResolvedValueOnce({ id: 2, name: "Map2", isDefault: false });

    const ctx = await makeCtx({ id: "user_admin" });
    const caller = createCaller(ctx);

    await caller.setDefault({ id: 2 });

    expect(mockBatch).toHaveBeenCalledTimes(1);
    // batch receives an array of two items
    const batchArg = mockBatch.mock.calls[0]![0] as unknown[];
    expect(batchArg).toHaveLength(2);
  });

  it("admin, non-existent id → NOT_FOUND", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: true });
    mockMapsFindFirst.mockResolvedValueOnce(undefined);

    const ctx = await makeCtx({ id: "user_admin" });
    const caller = createCaller(ctx);

    await expect(caller.setDefault({ id: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("non-admin → FORBIDDEN", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: false });

    const ctx = await makeCtx({ id: "user_nonadmin" });
    const caller = createCaller(ctx);

    await expect(caller.setDefault({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ---------------------------------------------------------------------------

describe("map.delete (guards)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default count = 2 (multiple maps) so the "only map" guard is not hit by default
    mockSelectOrderBy.mockResolvedValue([]);
    mockSelectFrom.mockReturnValue(makeFromResult([{ count: 2 }]));
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockDeleteWhere.mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockUpdateReturning.mockResolvedValue([]);
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
  });

  it("refuses to delete the default map → FORBIDDEN", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: true });
    mockMapsFindFirst.mockResolvedValueOnce({ id: 1, isDefault: true });

    const ctx = await makeCtx({ id: "user_admin" });
    const caller = createCaller(ctx);

    try {
      await caller.delete({ id: 1 });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN");
      expect((err as TRPCError).message).toMatch(/default/i);
    }
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("refuses to delete when only one map remains → FORBIDDEN", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: true });
    mockMapsFindFirst.mockResolvedValueOnce({ id: 1, isDefault: false });
    // Only one row in the table — override the default count=2 with count=1
    mockSelectFrom.mockReturnValueOnce(makeFromResult([{ count: 1 }]));

    const ctx = await makeCtx({ id: "user_admin" });
    const caller = createCaller(ctx);

    try {
      await caller.delete({ id: 1 });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN");
      expect((err as TRPCError).message).toMatch(/only/i);
    }
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("succeeds when non-default and multiple maps exist", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: true });
    mockMapsFindFirst.mockResolvedValueOnce({ id: 2, isDefault: false });
    // Default count=2 from beforeEach is already enough; explicitly set count=3 for clarity
    mockSelectFrom.mockReturnValueOnce(makeFromResult([{ count: 3 }]));

    const ctx = await makeCtx({ id: "user_admin" });
    const caller = createCaller(ctx);

    await expect(caller.delete({ id: 2 })).resolves.toBeUndefined();
    expect(mockDelete).toHaveBeenCalled();
  });

  it("non-existent id → NOT_FOUND", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: true });
    mockMapsFindFirst.mockResolvedValueOnce(undefined);

    const ctx = await makeCtx({ id: "user_admin" });
    const caller = createCaller(ctx);

    await expect(caller.delete({ id: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("non-admin → FORBIDDEN", async () => {
    mockUsersFindFirst.mockResolvedValueOnce({ isAdmin: false });

    const ctx = await makeCtx({ id: "user_nonadmin" });
    const caller = createCaller(ctx);

    await expect(caller.delete({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
