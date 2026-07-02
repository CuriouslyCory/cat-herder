import { z } from "zod";

import { buildSaveDataSchema } from "./SaveCodec";

export const CURRENT_VERSION = "0.1";

// The save-data shape is owned by SaveCodec.SAVE_FIELDS (see SaveCodec.ts).
// This schema is derived from that single declaration list, not hand-written.
export const saveDataSchema = buildSaveDataSchema();

export type SaveData = z.infer<typeof saveDataSchema>;
