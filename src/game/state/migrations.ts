import { saveDataSchema, CURRENT_VERSION } from "./SaveData";
import type { SaveData } from "./SaveData";

export class SaveMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveMigrationError";
  }
}

type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;

// Stub: shows the pattern for when CURRENT_VERSION advances to "0.2".
// Will be moved into MIGRATIONS once "0.2" becomes the new current version.
export function migration_0_1_to_0_2(
  data: Record<string, unknown>,
): Record<string, unknown> {
  // No schema changes between 0.1 and 0.2 -- no-op transform.
  return { ...data };
}

// Active chain: entries are applied in order for saves older than CURRENT_VERSION.
// Add entries here when CURRENT_VERSION bumps.
const MIGRATIONS: Array<[from: string, to: string, fn: MigrationFn]> = [];

const KNOWN_VERSIONS = new Set<string>([CURRENT_VERSION]);

export function migrateIfNeeded(data: unknown): SaveData {
  if (typeof data !== "object" || data === null) {
    throw new SaveMigrationError("Save data must be an object.");
  }

  const raw = data as Record<string, unknown>;
  const version = raw["version"];

  if (typeof version !== "string") {
    throw new SaveMigrationError(
      "Save data is missing a valid 'version' field.",
    );
  }

  if (!KNOWN_VERSIONS.has(version)) {
    throw new SaveMigrationError(
      `Unknown save version "${version}". This save was created by a newer or incompatible version of the game.`,
    );
  }

  // Content lives under raw["saveData"] when coming from tRPC getSave, or
  // directly at raw when given a flat save document.
  const content = (
    typeof raw["saveData"] !== "undefined" ? raw["saveData"] : raw
  ) as Record<string, unknown>;

  if (version === CURRENT_VERSION) {
    return saveDataSchema.parse(content);
  }

  // Chain migrations from older version up to CURRENT_VERSION.
  let current: Record<string, unknown> = content;
  let ver = version;

  while (ver !== CURRENT_VERSION) {
    const step = MIGRATIONS.find(([from]) => from === ver);
    if (!step) {
      throw new SaveMigrationError(
        `No migration path from version "${ver}" to "${CURRENT_VERSION}".`,
      );
    }
    const [, to, fn] = step;
    current = fn(current);
    ver = to;
  }

  return saveDataSchema.parse(current);
}
