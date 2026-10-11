/**
 * Owner-scoped diary-photos paths for tent and harvest badge photos.
 * The first path segment is the owner id. Persistence uses a storage://
 * reference, never a signed URL.
 */
import { PLANT_PROFILE_PHOTO_BUCKET } from "@/lib/plantProfilePhotoStorageRules";

export type OwnerSubjectPhotoKind = "tent" | "harvest";

export function buildOwnerSubjectPhotoObjectPath(input: {
  userId: string;
  kind: OwnerSubjectPhotoKind;
  subjectId: string;
  extension: string;
  randomId?: () => string;
}): string {
  const randomId = input.randomId ?? (() => crypto.randomUUID());
  const extension = input.extension.replace(/^\./, "").toLowerCase();
  const folder = input.kind === "tent" ? "tents" : "harvests";
  return `${input.userId}/${folder}/${input.subjectId}/${randomId()}.${extension}`;
}

export function formatOwnerSubjectPhotoReference(path: string): string {
  return `storage://${PLANT_PROFILE_PHOTO_BUCKET}/${path}`;
}
