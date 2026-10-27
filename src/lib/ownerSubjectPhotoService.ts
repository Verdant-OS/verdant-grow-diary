import { supabase } from "@/integrations/supabase/client";
import { plantProfilePhotoExtensionForMime } from "@/lib/plantProfilePhotoFileRules";
import type { PlantProfilePhotoMime } from "@/lib/plantProfilePhotoFileRules";
import { PLANT_PROFILE_PHOTO_BUCKET } from "@/lib/plantProfilePhotoStorageRules";
import {
  buildOwnerSubjectPhotoObjectPath,
  formatOwnerSubjectPhotoReference,
  type OwnerSubjectPhotoKind,
} from "@/lib/ownerSubjectPhotoRules";

export async function uploadOwnerSubjectPhoto(input: {
  file: Blob;
  mime: PlantProfilePhotoMime;
  userId: string;
  kind: OwnerSubjectPhotoKind;
  subjectId: string;
  storage?: Pick<typeof supabase, "storage">["storage"];
}): Promise<{ path: string; reference: string }> {
  const storage = input.storage ?? supabase.storage;
  const path = buildOwnerSubjectPhotoObjectPath({
    userId: input.userId,
    kind: input.kind,
    subjectId: input.subjectId,
    extension: plantProfilePhotoExtensionForMime(input.mime),
  });
  const { error } = await storage.from(PLANT_PROFILE_PHOTO_BUCKET).upload(path, input.file, {
    contentType: input.mime,
    upsert: false,
  });
  if (error) {
    throw new Error("owner-subject-photo-upload-failed");
  }
  return { path, reference: formatOwnerSubjectPhotoReference(path) };
}

/**
 * Best-effort removal of an uploaded photo whose row write definitively
 * failed. A failed removal leaves an unreferenced private object; it never
 * surfaces as a save error.
 */
export async function removeOwnerSubjectPhoto(input: {
  path: string;
  storage?: Pick<typeof supabase, "storage">["storage"];
}): Promise<void> {
  const storage = input.storage ?? supabase.storage;
  try {
    await storage.from(PLANT_PROFILE_PHOTO_BUCKET).remove([input.path]);
  } catch {
    // Unreferenced object stays; nothing points at it.
  }
}
