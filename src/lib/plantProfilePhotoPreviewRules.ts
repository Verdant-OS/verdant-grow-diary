/**
 * plantProfilePhotoPreviewRules — pure, deterministic helpers that
 * describe the local *preview* state for a plant profile photo the
 * grower has just selected but not yet uploaded.
 *
 * Preview is display-only: the original File object is what gets
 * uploaded on Save. These rules never touch storage, RLS, Edge
 * functions, AI, alerts, action queue, or device control.
 *
 * Copy is grower-safe. Storage paths, object URLs, provider
 * messages, and raw MIME-validation details never appear here.
 */
import type { PlantProfilePhotoMime } from "@/lib/plantProfilePhotoFileRules";

export type PlantProfilePhotoPreviewState =
  | { status: "none" }
  | { status: "loading"; fileName: string; mimeType: string }
  | {
      status: "image";
      fileName: string;
      mimeType: string;
      objectUrl: string;
    }
  | {
      status: "fallback";
      fileName: string;
      mimeType: string;
      reason: "browser_decode_unsupported" | "preview_error";
    };

export const PLANT_PROFILE_PHOTO_FALLBACK_HEADING = "Photo selected";

export const PLANT_PROFILE_PHOTO_FALLBACK_COPY = {
  browser_decode_unsupported:
    "Preview isn’t supported by this browser, but the original photo is ready to upload.",
  preview_error:
    "Preview could not be displayed, but the selected photo is still ready to upload.",
} as const;

/** Returns the HEIC/HEIF format badge label if applicable, else null. */
export function plantProfilePhotoFormatBadge(
  mime: string | null | undefined,
): "HEIC" | "HEIF" | null {
  if (!mime) return null;
  const m = mime.trim().toLowerCase();
  if (m === "image/heic") return "HEIC";
  if (m === "image/heif") return "HEIF";
  return null;
}

/**
 * HEIC/HEIF cannot be assumed decodable just because the picker
 * accepted the MIME type. Everything else may render directly and
 * only falls back on unexpected decode failure.
 */
export function plantProfilePhotoRequiresDecodeProbe(
  mime: PlantProfilePhotoMime | string,
): boolean {
  const m = String(mime).trim().toLowerCase();
  return m === "image/heic" || m === "image/heif";
}

/**
 * Grower-safe filename. Never surfaces storage paths or full device
 * paths; strips any directory-ish segments defensively.
 */
export function safePlantProfilePhotoFileName(
  raw: string | null | undefined,
  fallbackMime?: string | null,
): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length > 0) {
    // Strip any path separators just in case some picker leaks them.
    const base = trimmed.split(/[\\/]/).pop() ?? trimmed;
    if (base.length > 64) return `${base.slice(0, 61)}…`;
    return base;
  }
  const badge = plantProfilePhotoFormatBadge(fallbackMime);
  if (badge) return `${badge} photo`;
  return "Selected photo";
}
