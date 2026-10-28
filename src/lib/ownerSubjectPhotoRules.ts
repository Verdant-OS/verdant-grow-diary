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

/**
 * True only when a database write error proves nothing committed, so an
 * object uploaded for that write is unreferenced and safe to remove. A
 * structured PostgREST/Postgres code is a terminal rejection; a missing code
 * (network loss) or a unique collision (possible replay) may have committed
 * and must keep the object.
 */
export function isDefinitiveUnreferencedPhotoError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() !== "" && code !== "23505";
}
