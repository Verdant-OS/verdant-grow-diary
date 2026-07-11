/**
 * plantProfilePhotoFileRules — pure validator for files selected by
 * the grower via the camera or library picker in EditPlantDialog.
 *
 * Grower-safe error copy; never surfaces raw provider messages.
 * No I/O.
 */

export const PLANT_PROFILE_PHOTO_MAX_BYTES = 26_214_400; // 25 MB

export const PLANT_PROFILE_PHOTO_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type PlantProfilePhotoMime =
  (typeof PLANT_PROFILE_PHOTO_ALLOWED_MIME)[number];

const MIME_EXTENSION: Record<PlantProfilePhotoMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export type PlantProfilePhotoFileError =
  | "unsupported-type"
  | "too-large"
  | "empty"
  | "missing-mime";

export interface PlantProfilePhotoFileValidationOk {
  ok: true;
  mime: PlantProfilePhotoMime;
  extension: string;
  size: number;
}

export interface PlantProfilePhotoFileValidationFail {
  ok: false;
  reason: PlantProfilePhotoFileError;
  message: string;
}

export type PlantProfilePhotoFileValidation =
  | PlantProfilePhotoFileValidationOk
  | PlantProfilePhotoFileValidationFail;

export interface PlantProfilePhotoFileLike {
  size: number;
  type: string;
}

const MESSAGES: Record<PlantProfilePhotoFileError, string> = {
  "unsupported-type": "That file type is not supported.",
  "too-large": "Choose a photo smaller than 25 MB.",
  empty: "The selected file is empty.",
  "missing-mime": "That file type is not supported.",
};

export function validatePlantProfilePhotoFile(
  file: PlantProfilePhotoFileLike | null | undefined,
): PlantProfilePhotoFileValidation {
  if (!file) {
    return { ok: false, reason: "empty", message: MESSAGES.empty };
  }
  if (typeof file.type !== "string" || file.type.trim().length === 0) {
    return {
      ok: false,
      reason: "missing-mime",
      message: MESSAGES["missing-mime"],
    };
  }
  const mime = file.type.trim().toLowerCase() as PlantProfilePhotoMime;
  if (!(PLANT_PROFILE_PHOTO_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return {
      ok: false,
      reason: "unsupported-type",
      message: MESSAGES["unsupported-type"],
    };
  }
  if (typeof file.size !== "number" || file.size <= 0) {
    return { ok: false, reason: "empty", message: MESSAGES.empty };
  }
  if (file.size > PLANT_PROFILE_PHOTO_MAX_BYTES) {
    return { ok: false, reason: "too-large", message: MESSAGES["too-large"] };
  }
  return {
    ok: true,
    mime,
    extension: MIME_EXTENSION[mime],
    size: file.size,
  };
}

export function plantProfilePhotoExtensionForMime(
  mime: PlantProfilePhotoMime,
): string {
  return MIME_EXTENSION[mime];
}
