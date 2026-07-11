/**
 * plantProfilePhotoUploadService — thin async wrapper around Supabase
 * Storage for uploading a validated profile photo file into the
 * private `diary-photos` bucket at an owner-scoped object path.
 *
 * Responsibilities:
 *  - Build the object path via the pure helper (never uses the raw
 *    filename).
 *  - Upload with `upsert: false` so we cannot overwrite an existing
 *    object.
 *  - Return the durable `storage://` reference for persistence in
 *    `plants.photo_url`. NEVER returns a signed URL for persistence.
 *  - Provide a `removeUploadedObject` helper the orchestrator uses to
 *    clean up an orphaned upload when the follow-up plant update
 *    fails.
 *
 * Does NOT update the `plants` row. Does NOT invoke Edge Functions.
 * Does NOT use the service role.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildPlantProfilePhotoObjectPath,
  formatPlantProfilePhotoStorageReference,
  PLANT_PROFILE_PHOTO_BUCKET,
} from "@/lib/plantProfilePhotoStorageRules";
import type { PlantProfilePhotoMime } from "@/lib/plantProfilePhotoFileRules";
import { plantProfilePhotoExtensionForMime } from "@/lib/plantProfilePhotoFileRules";

export interface UploadPlantProfilePhotoInput {
  file: Blob;
  mime: PlantProfilePhotoMime;
  userId: string;
  plantId: string;
  growId: string | null | undefined;
  /** Test seam: injected storage client. */
  storage?: Pick<typeof supabase, "storage">["storage"];
  /** Test seam: injected object-path builder. */
  buildPath?: typeof buildPlantProfilePhotoObjectPath;
}

export interface UploadPlantProfilePhotoResult {
  bucket: typeof PLANT_PROFILE_PHOTO_BUCKET;
  path: string;
  /** Durable `storage://` reference — persist this on `plants.photo_url`. */
  reference: string;
}

export async function uploadPlantProfilePhoto(
  input: UploadPlantProfilePhotoInput,
): Promise<UploadPlantProfilePhotoResult> {
  const storage = input.storage ?? supabase.storage;
  const builder = input.buildPath ?? buildPlantProfilePhotoObjectPath;
  const extension = plantProfilePhotoExtensionForMime(input.mime);
  const path = builder({
    userId: input.userId,
    growId: input.growId ?? null,
    plantId: input.plantId,
    extension,
  });
  const { error } = await storage
    .from(PLANT_PROFILE_PHOTO_BUCKET)
    .upload(path, input.file, {
      contentType: input.mime,
      upsert: false,
    });
  if (error) {
    // Sanitized: do not leak provider text back to the grower.
    throw new Error("plant-profile-photo-upload-failed");
  }
  return {
    bucket: PLANT_PROFILE_PHOTO_BUCKET,
    path,
    reference: formatPlantProfilePhotoStorageReference(
      PLANT_PROFILE_PHOTO_BUCKET,
      path,
    ),
  };
}

export async function removeUploadedPlantProfilePhoto(
  path: string,
  storage: Pick<typeof supabase, "storage">["storage"] = supabase.storage,
): Promise<void> {
  try {
    await storage.from(PLANT_PROFILE_PHOTO_BUCKET).remove([path]);
  } catch {
    // Best-effort cleanup; swallow so the orchestrator's user-facing
    // error is the upload/plant-update failure, not a cleanup crash.
  }
}
