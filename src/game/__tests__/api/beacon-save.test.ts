import { describe, it, expect, vi, beforeEach } from "vitest";

// Must be hoisted before any module imports that pull in server-only deps
vi.mock("server-only", () => ({}));
vi.mock("~/env", () => ({
  env: {
    DATABASE_URL: "postgresql://mock/mock",
    NODE_ENV: "test",
  },
}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
}));
vi.mock("~/server/game/upsertGameSave", () => ({
  upsertGameSave: vi.fn().mockResolvedValue(undefined),
}));

import { withAuth } from "@workos-inc/authkit-nextjs";
import { upsertGameSave } from "~/server/game/upsertGameSave";
import { POST } from "~/app/api/game/beacon-save/route";
import { CURRENT_VERSION } from "~/game/state/SaveData";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validPayload() {
  return {
    version: CURRENT_VERSION,
    saveData: {
      character: {
        appearance: {},
        stats: { level: 1, health: 10, maxHealth: 10 },
        inventory: [] as unknown[],
        position: { x: 0, y: 0, z: 0 },
        yarn: 10,
        oxygen: 100,
        abilities: [] as unknown[],
      },
      world: {
        currentMapId: "default",
        activeCats: [] as unknown[],
        resourceNodeCooldowns: [] as unknown[],
        hiddenTerrain: [] as unknown[],
      },
      session: { totalPlaytimeMs: 0 },
    },
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/game/beacon-save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const mockWithAuth = vi.mocked(withAuth);
const mockUpsert = vi.mocked(upsertGameSave);

function authAsUser(id = "user_123") {
  mockWithAuth.mockResolvedValueOnce({
    user: { id } as never,
    accessToken: "token",
    organizationId: null,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/game/beacon-save", () => {
  it("returns 401 when not authenticated", async () => {
    mockWithAuth.mockResolvedValueOnce({ user: null, accessToken: null } as never);

    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON body", async () => {
    authAsUser();
    const req = new Request("http://localhost/api/game/beacon-save", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 when saveData fails Zod validation", async () => {
    authAsUser();
    const bad = { version: CURRENT_VERSION, saveData: {} };

    const res = await POST(makeRequest(bad));

    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 200 and calls upsertGameSave with valid payload", async () => {
    authAsUser("user_abc");
    const payload = validPayload();

    const res = await POST(makeRequest(payload));

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      {},
      "user_abc",
      CURRENT_VERSION,
      payload.saveData,
    );
  });

  it("returns 500 when upsertGameSave throws", async () => {
    authAsUser();
    mockUpsert.mockRejectedValueOnce(new Error("DB down"));

    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(500);
  });
});
