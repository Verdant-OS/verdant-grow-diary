/**
 * plantProfilePhotoReplacementCleanupService — orchestrates the
 * safe retirement of a plant's previous private storage object after
 * a successful photo replacement.
 *
 * Ordering (see docs/plant-profile-photo-upload-v1.md):
 *   1. New object already uploaded and plant row already updated.
 *   2. Confirm the plant's current `photo_url` equals the new
 *      durable storage reference. If not: skip removal.
 *   3. Query current `plants.photo_url` rows equal to the previous
 *      reference. If any remain, or if the query fails: skip.
 *   4. Only when zero remaining references exist may
 *      `removeUploadedPlantProfilePhoto` be invoked with the parsed
 *      object path (not the full storage:// URI).
 *
 * Never throws. Callers translate the typed result into sanitized
 * grower-facing copy. No service-role, no admin-CLI imports, no
 * Edge Functions, no logging of storage paths / provider text /
 * signed URLs.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  evaluatePreviousPhotoCleanup,
  type PreviousPhotoCleanupInput,
} from "@/lib/plantProfilePhotoReplacementCleanupRules";
import { removeUploadedPlantProfilePhoto } from "@/lib/plantProfilePhotoUploadService";

export type PreviousPhotoCleanupResult =
  | { status: "not_needed"; reason: string }
  | { status: "removed" }
  | { status: "protected"; reason: "still_referenced" }
  | {
      status: "skipped_for_safety";
      reason:
        | "persistence_unconfirmed"
        | "reference_check_failed"
        | "ineligible_reference";
    }
  | { status: "remove_failed" };

// Narrow shape of the Supabase client surface we touch — makes the
// service trivially injectable in tests without pulling the full
// generated client type.
export interface CleanupSupabaseLike {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq?: (col: string, val: string) => unknown;
        limit?: (n: number) => unknown;
      } & PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
  storage: typeof supabase.storage;
}

export interface RetirePreviousPlantPhotoInput
  extends PreviousPhotoCleanupInput {
  /** Test seam. Defaults to the app's authenticated Supabase client. */
  client?: unknown;
  /** Test seam. Defaults to production remove helper. */
  remove?: (path: string) => Promise<{ ok: boolean }>;
}

interface RowsResult {
  data: Array<{ id?: string; photo_url?: string | null }> | null;
  error: unknown;
}

async function selectByPhotoUrl(
  client: any,
  photoUrl: string,
): Promise<RowsResult> {
  try {
    const res = await client
      .from("plants")
      .select("id,photo_url")
      .eq("photo_url", photoUrl);
    return { data: (res?.data as any) ?? null, error: res?.error ?? null };
  } catch (err) {
    return { data: null, error: err };
  }
}

async function confirmNewPersisted(
  client: any,
  plantId: string,
  newRef: string,
): Promise<"confirmed" | "unconfirmed" | "failed"> {
  try {
    const res = await client
      .from("plants")
      .select("id,photo_url")
      .eq("id", plantId);
    if (res?.error) return "failed";
    const rows = (res?.data as Array<{ photo_url?: string | null }>) ?? null;
    if (!rows || rows.length === 0) return "unconfirmed";
    const current = rows[0]?.photo_url ?? null;
    return current === newRef ? "confirmed" : "unconfirmed";
  } catch {
    return "failed";
  }
}

async function defaultRemove(path: string): Promise<{ ok: boolean }> {
  try {
    await removeUploadedPlantProfilePhoto(path);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Retire the previous private storage object for a plant profile
 * photo, only if every safety check passes. Never throws.
 */
export async function retirePreviousPlantProfilePhoto(
  input: RetirePreviousPlantPhotoInput,
): Promise<PreviousPhotoCleanupResult> {
  const decision = evaluatePreviousPhotoCleanup({
    previousPhotoUrl: input.previousPhotoUrl,
    newPhotoUrl: input.newPhotoUrl,
    authenticatedUserId: input.authenticatedUserId,
    plantId: input.plantId,
  });
  if (decision.eligible === false) {
    const r = decision.reason;
    if (
      r === "wrong_owner" ||
      r === "wrong_bucket" ||
      r === "wrong_plant_path" ||
      r === "malformed_reference"
    ) {
      return {
        status: "skipped_for_safety",
        reason: "ineligible_reference",
      };
    }
    return { status: "not_needed", reason: r };
  }

  const client = (input.client ?? supabase) as any;

  // 1) Confirm the plant row now points at the new reference.
  const persisted = await confirmNewPersisted(
    client,
    input.plantId,
    input.newPhotoUrl,
  );
  if (persisted === "failed" || persisted === "unconfirmed") {
    return {
      status: "skipped_for_safety",
      reason: "persistence_unconfirmed",
    };
  }

  // 2) Reference-count check for the *previous* durable reference.
  const refs = await selectByPhotoUrl(client, input.previousPhotoUrl as string);
  if (refs.error || !Array.isArray(refs.data)) {
    return {
      status: "skipped_for_safety",
      reason: "reference_check_failed",
    };
  }
  if (refs.data.length > 0) {
    return { status: "protected", reason: "still_referenced" };
  }

  // 3) Safe to delete. Pass ONLY the parsed object path.
  const remove = input.remove ?? defaultRemove;
  const out = await remove(decision.objectPath);
  if (!out.ok) return { status: "remove_failed" };
  return { status: "removed" };
}
