import { CatType } from "../../types";
import type { CatDefinition } from "../CatDefinition";

export { LoafDefinition } from "./Loaf";
export { ZoomiesDefinition } from "./Zoomies";
export { CuriosityCatDefinition } from "./CuriosityCat";
export { PounceDefinition } from "./Pounce";

import { LoafDefinition } from "./Loaf";
import { ZoomiesDefinition } from "./Zoomies";
import { CuriosityCatDefinition } from "./CuriosityCat";
import { PounceDefinition } from "./Pounce";

/**
 * Authoritative registry of all cat definitions.
 *
 * CatCompanionManager (and any other system) should read from this map rather
 * than importing individual definition files.  Adding a new cat type requires:
 *   1. A new CatType enum entry in types.ts
 *   2. A new definition file in this directory
 *   3. An export + registry entry below
 */
export const CAT_REGISTRY: ReadonlyMap<CatType, CatDefinition> = new Map([
  [CatType.Loaf, LoafDefinition],
  [CatType.Zoomies, ZoomiesDefinition],
  [CatType.CuriosityCat, CuriosityCatDefinition],
  [CatType.Pounce, PounceDefinition],
]);
