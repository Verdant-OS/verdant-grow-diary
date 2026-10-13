/**
 * AI Coach photo intake bounds.
 *
 * Plant-profile photos may be 25 MB HEIC/HEIF. Coach inline Gemini
 * processing accepts at most 7 MiB and only JPEG, PNG, WEBP, and GIF.
 * Reject the gap here, before Storage upload and before credit spend.
 * No I/O.
 */

import {
  validatePlantProfilePhotoFile,
  type PlantProfilePhotoFileLike,
  type PlantProfilePhotoFileValidation,
} from "@/lib/plantProfilePhotoFileRules";

/** Matches GEMINI_INLINE_IMAGE_MAX_BYTES. Reject only when size is greater. */
export const AI_COACH_INLINE_PHOTO_MAX_BYTES = 7 * 1024 * 1024;

const COACH_REJECTED_MIME = new Set(["image/heic", "image/heif"]);

const TOO_LARGE_MESSAGE = "Choose a photo smaller than 7 MB.";
const UNSUPPORTED_MESSAGE = "That file type is not supported.";

export function validateAiCoachPhotoFile(
  file: PlantProfilePhotoFileLike | null | undefined,
): PlantProfilePhotoFileValidation {
  const validated = validatePlantProfilePhotoFile(file);
  if (!validated.ok) {
    if (validated.reason === "too-large") {
      return { ok: false, reason: "too-large", message: TOO_LARGE_MESSAGE };
    }
    return validated;
  }
  if (COACH_REJECTED_MIME.has(validated.mime)) {
    return { ok: false, reason: "unsupported-type", message: UNSUPPORTED_MESSAGE };
  }
  if (validated.size > AI_COACH_INLINE_PHOTO_MAX_BYTES) {
    return { ok: false, reason: "too-large", message: TOO_LARGE_MESSAGE };
  }
  return validated;
}
