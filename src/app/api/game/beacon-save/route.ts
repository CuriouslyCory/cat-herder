import { withAuth } from "@workos-inc/authkit-nextjs";
import { z } from "zod";

import { db } from "~/server/db";
import { saveDataSchema } from "~/game/state/SaveData";
import { upsertGameSave } from "~/server/game/upsertGameSave";

const beaconBodySchema = z.object({
  version: z.string(),
  saveData: saveDataSchema,
});

export async function POST(req: Request): Promise<Response> {
  const auth = await withAuth();
  if (!auth.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    const text = await req.text();
    body = JSON.parse(text) as unknown;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = beaconBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid save data" }, { status: 400 });
  }

  try {
    await upsertGameSave(db, auth.user.id, parsed.data.version, parsed.data.saveData);
  } catch {
    return Response.json({ error: "Save failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
