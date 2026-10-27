/**
 * Owner-scoped diary-photos paths for tent and harvest badge photos.
 * The first path segment is the owner id. Persistence uses a storage://
 * reference, never a signed URL.
 */
import { PLANT_PROFILE_PHOTO_BUCKET } from "@/lib/plantProfilePhotoStorageRules";
import { harvestWeightAsGrams } from "@/lib/harvestWeightUnitNormalization";

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
 * Shape the `harvests` row a harvest photo attaches to. `grow_type` must
 * come from the verified parent grow; with no verified type there is no
 * row (never a hard-coded default). `yield_grams` is the dry weight in
 * canonical grams, or null when no valid dry weight was entered.
 */
export function buildHarvestPhotoRow(input: {
  harvestId: string;
  userId: string;
  growId: string;
  growType: string | null | undefined;
  dryWeight: string | null | undefined;
  weightUnit: string | null | undefined;
  photoReference: string;
}): {
  id: string;
  user_id: string;
  grow_id: string;
  grow_type: string;
  yield_grams: number | null;
  photo_url: string;
} | null {
  const growType = typeof input.growType === "string" ? input.growType.trim() : "";
  if (!growType) return null;
  return {
    id: input.harvestId,
    user_id: input.userId,
    grow_id: input.growId,
    grow_type: growType,
    yield_grams: harvestWeightAsGrams({ value: input.dryWeight, unit: input.weightUnit }),
    photo_url: input.photoReference,
  };
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
