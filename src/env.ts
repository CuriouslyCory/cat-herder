import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_WORKOS_CLIENT_ID: z.string().min(1),
    VITE_WORKOS_REDIRECT_URI: z.string().url(),
    VITE_NEON_DATA_API_URL: z.string().url(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
