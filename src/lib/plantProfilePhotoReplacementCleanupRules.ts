/**
 * plantProfilePhotoReplacementCleanupRules — pure eligibility rules
 * that decide whether a previously-persisted plant profile photo may
 * be considered for storage cleanup after a successful replacement.
 *
 * Pure. No I/O, no Supabase, no logging. Never throws.
 *
 * Even when this helper returns `eligible: true`, the caller MUST
 * still confirm the new reference is persisted AND run a
 * reference-count check before deleting anything. See
 * `plantProfilePhotoReplacementCleanupService`.
 */
import {
  PLANT_PROFILE_PHOTO_BUCKET,
  PLANT_PROFILE_PHOTO_SUBFOLDER,
  parsePlantProfilePhotoReference,
} from "@/lib/plantProfilePhotoStorageRules";

export interface PreviousPhotoCleanupInput {
  previousPhotoUrl: string | null | undefined;
  newPhotoUrl: string;
  authenticatedUserId: string;
  plantId: string;
}

export type PreviousPhotoCleanupIneligibleReason =
  | "no_previous_photo"
  | "same_reference"
  | "legacy_reference"
  | "malformed_reference"
  | "wrong_bucket"
  | "wrong_owner"
  | "wrong_plant_path";

export type PreviousPhotoCleanupDecision =
  | { eligible: true; objectPath: string }
  | { eligible: false; reason: PreviousPhotoCleanupIneligibleReason };

function trimOrNull(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/**
 * Decide whether `previousPhotoUrl` refers to a private storage
 * object that is safe to *consider* for removal.
 *
 * Only a `storage://diary-photos/<userId>/<growSeg>/plant-profiles/<plantId>/<file>`
 * reference owned by the authenticated user and scoped to the exact
 * plant being edited is eligible. Everything else is ineligible.
 */
export function evaluatePreviousPhotoCleanup(
  input: PreviousPhotoCleanupInput,
): PreviousPhotoCleanupDecision {
  const prev = trimOrNull(input.previousPhotoUrl);
  const next = trimOrNull(input.newPhotoUrl);
  if (!prev) return { eligible: false, reason: "no_previous_photo" };
  if (!next) return { eligible: false, reason: "malformed_reference" };
  if (prev === next) return { eligible: false, reason: "same_reference" };

  // The new reference must itself be a valid storage:// reference
  // owned by the authenticated user. Guards against accidental
  // deletion when persistence wrote something unexpected.
  const nextRef = parsePlantProfilePhotoReference(next, {
    viewerUserId: input.authenticatedUserId,
  });
  if (nextRef.kind !== "storage") {
    return { eligible: false, reason: "malformed_reference" };
  }

  const prevRef = parsePlantProfilePhotoReference(prev, {
    viewerUserId: input.authenticatedUserId,
  });

  if (prevRef.kind === "external" || prevRef.kind === "data") {
    return { eligible: false, reason: "legacy_reference" };
  }
  if (prevRef.kind === "preview" || prevRef.kind === "clear") {
    return { eligible: false, reason: "legacy_reference" };
  }
  if (prevRef.kind === "invalid") {
    if (prevRef.reason === "wrong-owner") {
      return { eligible: false, reason: "wrong_owner" };
    }
    if (prevRef.reason === "unknown-bucket") {
      return { eligible: false, reason: "wrong_bucket" };
    }
    return { eligible: false, reason: "malformed_reference" };
  }

  // storage kind — verify bucket, owner-segment, plant-profiles
  // subfolder, and plant-id segment.
  if (prevRef.bucket !== PLANT_PROFILE_PHOTO_BUCKET) {
    return { eligible: false, reason: "wrong_bucket" };
  }
  const segs = prevRef.path.split("/");
  // Expect: <userId>/<growSeg>/plant-profiles/<plantId>/<file>
  if (segs.length < 5) {
    return { eligible: false, reason: "malformed_reference" };
  }
  if (segs[0] !== input.authenticatedUserId) {
    return { eligible: false, reason: "wrong_owner" };
  }
  if (segs[2] !== PLANT_PROFILE_PHOTO_SUBFOLDER) {
    return { eligible: false, reason: "wrong_plant_path" };
  }
  if (segs[3] !== input.plantId) {
    return { eligible: false, reason: "wrong_plant_path" };
  }
  return { eligible: true, objectPath: prevRef.path };
}
