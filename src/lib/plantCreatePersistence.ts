import type { SupabaseClient } from "@supabase/supabase-js";
import {
  confirmCreatedPlantRow,
  type ConfirmedCreatedPlant,
} from "@/lib/confirmedPlantCacheService";
import { isUuid } from "@/lib/isUuid";

export interface PlantCreateAttemptScope {
  plantId: string;
  ownerId: string;
  growId: string;
  tentId: string | null;
}

export type PlantCreateReconciliationResult =
  | { status: "confirmed"; confirmed: ConfirmedCreatedPlant }
  | { status: "not_found" | "unavailable" };

/** Mint one exact row identity before a logical Create Plant write begins. */
export function newPlantCreateAttemptId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!isUuid(id)) throw new Error("secure_random_unavailable");
  return id.toLowerCase();
}

export function isAmbiguousPlantInsertError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "23505") return true;
  if (code !== "" && code != null) return false;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    /failed to fetch|fetch failed|network(?:error| request failed)|load failed/i.test(message)
  );
}

/**
 * Confirm only the preallocated row for this exact owner and hierarchy.
 * The id check prevents a malformed response or an impossible UUID collision
 * from being promoted as the logical create attempt.
 */
export function confirmPlantCreateAttemptRow(
  value: unknown,
  attempt: PlantCreateAttemptScope,
): ConfirmedCreatedPlant | null {
  const confirmed = confirmCreatedPlantRow(value, {
    ownerId: attempt.ownerId,
    growId: attempt.growId,
    tentId: attempt.tentId,
  });
  return confirmed?.row.id === attempt.plantId ? confirmed : null;
}

/**
 * Re-read only the preallocated id through the signed-in client's normal
 * SELECT RLS. Cross-account rows remain indistinguishable from not-found.
 */
export async function reconcilePlantCreateAttempt(
  client: Pick<SupabaseClient, "from">,
  attempt: PlantCreateAttemptScope,
): Promise<PlantCreateReconciliationResult> {
  try {
    const { data, error } = await client
      .from("plants" as never)
      .select("*")
      .eq("id", attempt.plantId)
      .eq("user_id", attempt.ownerId)
      .maybeSingle();
    if (error) return { status: "unavailable" };
    if (!data) return { status: "not_found" };
    const confirmed = confirmPlantCreateAttemptRow(data, attempt);
    return confirmed ? { status: "confirmed", confirmed } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
