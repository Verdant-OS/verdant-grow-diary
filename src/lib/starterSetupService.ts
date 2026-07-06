/**
 * starterSetupService — orchestrates the "Skip setup — try Quick Log on
 * a sample plant" flow.
 *
 * Behavior:
 *   1. List the user's owned grows / tents / plants (RLS enforces owner
 *      scope server-side; we filter defensively here too).
 *   2. Reuse existing starter rows if their names match the canonical
 *      "Starter Grow" / "Starter Tent" / "Sample Plant" markers.
 *   3. Only create the missing pieces. Repeat clicks are idempotent
 *      because step 2 finds the rows we created previously.
 *
 * Safety boundaries:
 *   - No sensor readings inserted.
 *   - No diary_entries, alerts, AI Doctor sessions, Action Queue rows,
 *     or edge-function calls performed here.
 *   - No device-control code paths referenced.
 *   - No schema changes; only the grow/tent/plant columns already
 *     exposed by the existing create dialogs are written.
 *
 * The service is written against a small `StarterSetupDataAccess`
 * adapter so it is fully unit-testable without a live Supabase client.
 */

import {
  findStarterRowByName,
  STARTER_GROW_NAME,
  STARTER_PLANT_NAME,
  STARTER_TENT_NAME,
  type StarterOwnedRow,
  type StarterSetupResult,
} from "@/lib/starterSetupRules";

export interface StarterSetupDataAccess {
  listOwnedGrows(userId: string): Promise<ReadonlyArray<StarterOwnedRow>>;
  listOwnedTents(
    userId: string,
    growId: string,
  ): Promise<ReadonlyArray<StarterOwnedRow>>;
  listOwnedPlants(
    userId: string,
    tentId: string,
  ): Promise<ReadonlyArray<StarterOwnedRow>>;
  createStarterGrow(userId: string): Promise<StarterOwnedRow>;
  createStarterTent(
    userId: string,
    growId: string,
  ): Promise<StarterOwnedRow>;
  createStarterPlant(
    userId: string,
    growId: string,
    tentId: string,
  ): Promise<StarterOwnedRow>;
}

export class StarterSetupError extends Error {
  constructor(
    message: string,
    public readonly step: "grow" | "tent" | "plant" | "auth",
  ) {
    super(message);
    this.name = "StarterSetupError";
  }
}

export async function runStarterSetup(
  userId: string | null | undefined,
  db: StarterSetupDataAccess,
): Promise<StarterSetupResult> {
  if (!userId) {
    throw new StarterSetupError("Not signed in.", "auth");
  }

  // 1) Grow.
  const grows = await db.listOwnedGrows(userId);
  const existingGrow = findStarterRowByName(grows, STARTER_GROW_NAME);
  let growId: string;
  let reusedGrow = false;
  if (existingGrow) {
    growId = existingGrow.id;
    reusedGrow = true;
  } else {
    try {
      const created = await db.createStarterGrow(userId);
      growId = created.id;
    } catch (err) {
      throw new StarterSetupError(
        err instanceof Error ? err.message : "Failed to create starter grow.",
        "grow",
      );
    }
  }

  // 2) Tent, scoped to that grow.
  const tents = await db.listOwnedTents(userId, growId);
  const existingTent = findStarterRowByName(tents, STARTER_TENT_NAME);
  let tentId: string;
  let reusedTent = false;
  if (existingTent) {
    tentId = existingTent.id;
    reusedTent = true;
  } else {
    try {
      const created = await db.createStarterTent(userId, growId);
      tentId = created.id;
    } catch (err) {
      throw new StarterSetupError(
        err instanceof Error ? err.message : "Failed to create starter tent.",
        "tent",
      );
    }
  }

  // 3) Plant, scoped to that tent.
  const plants = await db.listOwnedPlants(userId, tentId);
  const existingPlant = findStarterRowByName(plants, STARTER_PLANT_NAME);
  let plantId: string;
  let reusedPlant = false;
  if (existingPlant) {
    plantId = existingPlant.id;
    reusedPlant = true;
  } else {
    try {
      const created = await db.createStarterPlant(userId, growId, tentId);
      plantId = created.id;
    } catch (err) {
      throw new StarterSetupError(
        err instanceof Error ? err.message : "Failed to create starter plant.",
        "plant",
      );
    }
  }

  return {
    growId,
    tentId,
    plantId,
    reused: { grow: reusedGrow, tent: reusedTent, plant: reusedPlant },
  };
}
