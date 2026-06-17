/**
 * plantProfileMetadataUpdate — narrowly-scoped helper that updates ONLY
 * `medium` and `pot_size` on the plants table for a single plant.
 *
 * Hard contract:
 *  - Allow-list of exactly two columns: `medium`, `pot_size`.
 *  - Blank / whitespace strings collapse to `null` (clears the field).
 *  - Extra keys in the input are dropped, not forwarded.
 *  - No other plants columns can be mutated through this helper.
 *  - No Action Queue, alerts, AI, sensor, or device-control side effects.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PlantProfileMetadataDraft {
  medium?: string | null;
  potSize?: string | null;
}

export interface PlantProfileMetadataUpdatePayload {
  medium: string | null;
  pot_size: string | null;
}

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build the strict, allow-listed write payload. Pure & deterministic.
 * Exposed for tests so we can assert no extra columns leak through.
 */
export function buildPlantProfileMetadataPayload(
  draft: PlantProfileMetadataDraft,
): PlantProfileMetadataUpdatePayload {
  return {
    medium: normalize(draft.medium),
    pot_size: normalize(draft.potSize),
  };
}

export async function updatePlantProfileMetadata(
  plantId: string,
  draft: PlantProfileMetadataDraft,
): Promise<PlantProfileMetadataUpdatePayload> {
  if (typeof plantId !== "string" || plantId.length === 0) {
    throw new Error("updatePlantProfileMetadata: plantId is required");
  }
  const payload = buildPlantProfileMetadataPayload(draft);
  const { error } = await supabase
    .from("plants")
    .update(payload)
    .eq("id", plantId);
  if (error) {
    throw new Error(`updatePlantProfileMetadata: ${error.message}`);
  }
  return payload;
}
