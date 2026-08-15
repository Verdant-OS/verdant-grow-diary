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
import type { Capabilities } from "@/lib/entitlements/types";
import {
  evaluateVerifiedGrowCreationGate,
  evaluateVerifiedTentCreationGate,
} from "@/lib/entitlements/freeTierGates";

export interface StarterSetupDataAccess {
  listOwnedGrows(userId: string): Promise<ReadonlyArray<StarterOwnedRow>>;
  listOwnedTents(userId: string, growId: string): Promise<ReadonlyArray<StarterOwnedRow>>;
  countOwnedTents(userId: string): Promise<number>;
  listOwnedPlants(userId: string, tentId: string): Promise<ReadonlyArray<StarterOwnedRow>>;
  createStarterGrow(userId: string): Promise<StarterOwnedRow>;
  createStarterTent(userId: string, growId: string): Promise<StarterOwnedRow>;
  createStarterPlant(userId: string, growId: string, tentId: string): Promise<StarterOwnedRow>;
}

export class StarterSetupError extends Error {
  constructor(
    message: string,
    public readonly step: "grow" | "tent" | "plant" | "auth",
    public readonly kind: "auth" | "plan_gate" | "operation" = "operation",
  ) {
    super(message);
    this.name = "StarterSetupError";
  }
}

export type StarterSetupCreatedEntity = "grow" | "tent" | "plant";

export interface StarterSetupCallbacks {
  /**
   * Fires immediately after each durable create succeeds. Callback failures
   * are ignored so analytics can never break or roll back starter setup.
   */
  onCreated?: (entity: StarterSetupCreatedEntity) => void;
}

export interface StarterSetupOptions extends StarterSetupCallbacks {
  /** Null means the plan lookup could not be verified; limited creates fail closed. */
  capabilities: Capabilities | null | undefined;
}

function notifyCreated(callbacks: StarterSetupCallbacks, entity: StarterSetupCreatedEntity): void {
  try {
    callbacks.onCreated?.(entity);
  } catch {
    // The row already exists. Observability must remain fire-and-forget.
  }
}

export async function runStarterSetup(
  userId: string | null | undefined,
  db: StarterSetupDataAccess,
  callbacks: StarterSetupOptions,
): Promise<StarterSetupResult> {
  if (!userId) {
    throw new StarterSetupError("Not signed in.", "auth", "auth");
  }

  // Read every existing row needed to decide the multi-row setup before the
  // first durable write. A Free grow must never be created only to discover
  // afterward that the required tent is already over its active-row limit.
  const grows = await db.listOwnedGrows(userId);
  const existingGrow = findStarterRowByName(grows, STARTER_GROW_NAME);
  let growId = existingGrow?.id ?? null;
  const reusedGrow = existingGrow != null;

  let existingTent: StarterOwnedRow | null = null;
  if (existingGrow) {
    const tents = await db.listOwnedTents(userId, existingGrow.id);
    existingTent = findStarterRowByName(tents, STARTER_TENT_NAME);
  }
  let tentId = existingTent?.id ?? null;
  const reusedTent = existingTent != null;

  if (!growId) {
    const gate = evaluateVerifiedGrowCreationGate(
      callbacks.capabilities,
      grows.length,
      !!callbacks.capabilities,
    );
    if (!gate.allowed) {
      throw new StarterSetupError(
        gate.blockedCopy ?? "Grow creation is unavailable.",
        "grow",
        "plan_gate",
      );
    }
  }

  if (!tentId) {
    if (!callbacks.capabilities) {
      const gate = evaluateVerifiedTentCreationGate(callbacks.capabilities, 0, false);
      throw new StarterSetupError(
        gate.blockedCopy ?? "Tent creation is unavailable.",
        "tent",
        "plan_gate",
      );
    }

    let activeTentCount = 0;
    if (!callbacks.capabilities.multiTent) {
      try {
        activeTentCount = await db.countOwnedTents(userId);
      } catch (err) {
        throw new StarterSetupError(
          err instanceof Error ? err.message : "Failed to verify active tents.",
          "tent",
        );
      }
    }
    const gate = evaluateVerifiedTentCreationGate(callbacks.capabilities, activeTentCount, true);
    if (!gate.allowed) {
      throw new StarterSetupError(
        gate.blockedCopy ?? "Tent creation is unavailable.",
        "tent",
        "plan_gate",
      );
    }
  }

  // All required plan/count checks have passed. Durable creation can begin.
  if (!growId) {
    try {
      const created = await db.createStarterGrow(userId);
      growId = created.id;
      notifyCreated(callbacks, "grow");
    } catch (err) {
      throw new StarterSetupError(
        err instanceof Error ? err.message : "Failed to create starter grow.",
        "grow",
      );
    }
  }

  if (!tentId) {
    try {
      const created = await db.createStarterTent(userId, growId);
      tentId = created.id;
      notifyCreated(callbacks, "tent");
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
      notifyCreated(callbacks, "plant");
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
