/**
 * plantProfilePhotoRules — pure helpers for setting/clearing a plant
 * profile photo URL via EditPlantDialog.
 *
 * Safety:
 *  - Display/persistence ONLY. No upload, no fetch, no AI, no I/O.
 *  - Whitelists `http(s)` and `data:image/*` URLs (so existing in-app
 *    photo URLs and short pasted data URLs work) and otherwise returns
 *    null with a typed reason. Never throws.
 *  - Blank / whitespace-only input → null (CLEAR), never `""`.
 *  - No schema, RLS, Edge, auth, migration changes required.
 */

export type PlantProfilePhotoNormalization =
  | { ok: true; kind: "clear"; photo_url: null }
  | { ok: true; kind: "set"; photo_url: string }
  | { ok: false; reason: "unsupported-protocol" | "invalid-url" | "too-long" };

const MAX_LEN = 2048;

export function normalizePlantProfilePhotoInput(
  raw: unknown,
): PlantProfilePhotoNormalization {
  if (typeof raw !== "string") return { ok: true, kind: "clear", photo_url: null };
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, kind: "clear", photo_url: null };
  }
  if (trimmed.length > MAX_LEN) return { ok: false, reason: "too-long" };

  // Allow safe protocols only. Reject javascript:, file:, blob:, etc.
  if (/^data:image\/(png|jpe?g|webp|gif|avif);/i.test(trimmed)) {
    return { ok: true, kind: "set", photo_url: trimmed };
  }
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return { ok: true, kind: "set", photo_url: trimmed };
    }
    return { ok: false, reason: "unsupported-protocol" };
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
}
