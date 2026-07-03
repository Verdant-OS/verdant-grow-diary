/**
 * starterSetupRules — pure constants + helpers for the onboarding
 * "Skip setup — try Quick Log on a sample plant" path.
 *
 * No React, no Supabase, no I/O. Only the naming contract, safety
 * markers, and prefill-payload builder live here so tests can pin them
 * without touching the network.
 *
 * Safety boundaries (enforced by tests):
 *   - No sensor readings are ever produced by this path.
 *   - No AI Doctor, alerts, or Action Queue writes are ever produced.
 *   - No device-control code paths are referenced.
 *   - Starter records are grower-owned real rows, clearly named
 *     "Starter …" / "Sample Plant" — never labeled live/demo telemetry.
 */

import type { PlantQuickLogPrefill } from "@/lib/plantQuickLogPrefillRules";

export const STARTER_GROW_NAME = "Starter Grow";
export const STARTER_TENT_NAME = "Starter Tent";
export const STARTER_PLANT_NAME = "Sample Plant";

/** Copy shown next to the button in Onboarding. Kept here so tests can pin it. */
export const STARTER_SETUP_BUTTON_LABEL =
  "Skip setup — try Quick Log on a sample plant";
export const STARTER_SETUP_HELPER_COPY =
  "Verdant will create an editable starter Grow, Tent, and Plant so you can make your first real Quick Log now. No fake logs or sensor readings are added.";
export const STARTER_SETUP_ERROR_COPY =
  "We couldn't finish creating your starter setup. Nothing was partially applied — please try again.";

/** A subset of grow/tent/plant shape the service needs. Owner-scoped by RLS. */
export interface StarterOwnedRow {
  readonly id: string;
  readonly name: string | null;
}

export interface StarterSetupResult {
  readonly growId: string;
  readonly tentId: string;
  readonly plantId: string;
  readonly reused: {
    readonly grow: boolean;
    readonly tent: boolean;
    readonly plant: boolean;
  };
}

/**
 * Find an existing starter row by exact name match. Case-sensitive on
 * purpose — we control the writer, and loose matching risks colliding
 * with real grower-authored grows/tents/plants that happen to include
 * the word "starter".
 */
export function findStarterRowByName<T extends StarterOwnedRow>(
  rows: ReadonlyArray<T>,
  starterName: string,
): T | null {
  for (const row of rows) {
    if (row.name === starterName) return row;
  }
  return null;
}

/**
 * Build the Quick Log prefill payload for the starter plant/tent/grow.
 * Mirrors the shape AppShell's `verdant:open-quicklog` listener already
 * consumes, so no new event contract is introduced.
 */
export function buildStarterQuickLogPrefill(
  result: StarterSetupResult,
): PlantQuickLogPrefill {
  return {
    plantId: result.plantId,
    plantName: STARTER_PLANT_NAME,
    growId: result.growId,
    tentId: result.tentId,
    tentName: STARTER_TENT_NAME,
    eventType: "observation",
    suggestSnapshot: true,
  };
}
