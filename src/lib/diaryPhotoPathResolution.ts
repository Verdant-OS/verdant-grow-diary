/**
 * diaryPhotoPathResolution — pure helpers for resolving a diary entry's
 * photo storage path when it was only recorded on the companion
 * `details.photo_url` field.
 *
 * `quicklog_save_event`'s diary mirror never sets the top-level
 * `photo_url` column -- it only stores the raw storage path inside
 * `details.photo_url` (see
 * supabase/migrations/20260707130000_quicklog_save_event_trust_boundary_hardening.sql:290).
 * Any reader that only looks at the top-level column misses those rows.
 *
 * This module does the pure path bookkeeping only. Turning a raw storage
 * path into a signed, renderable URL still requires a Supabase Storage
 * call -- callers own that I/O and pass the resulting map back in.
 */

interface RawDiaryPhotoRow {
  photo_url?: unknown;
  details?: unknown;
}

function detailsPhotoPath(row: RawDiaryPhotoRow): string | null {
  const det = row.details;
  if (!det || typeof det !== "object") return null;
  const v = (det as Record<string, unknown>).photo_url;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Top-level `photo_url` wins; falls back to the companion `details.photo_url`. */
export function resolveDiaryPhotoPath(row: RawDiaryPhotoRow): string | null {
  const top =
    typeof row.photo_url === "string" && row.photo_url.length > 0 ? row.photo_url : null;
  return top ?? detailsPhotoPath(row);
}

/** Distinct storage paths across rows that are not already an http(s) URL. */
export function collectUnsignedDiaryPhotoPaths(
  rows: readonly RawDiaryPhotoRow[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const path = resolveDiaryPhotoPath(row);
    if (path && !/^https?:\/\//i.test(path)) seen.add(path);
  }
  return Array.from(seen);
}

/**
 * Returns NEW row objects with `photo_url` resolved to a signed URL where
 * one is available for the row's raw path. Never mutates the input rows --
 * callers may be holding a shared cache (e.g. a React Query result also
 * read by other components) that must not be corrupted in place.
 */
export function withSignedDiaryPhotoUrls<T extends RawDiaryPhotoRow>(
  rows: readonly T[] | null | undefined,
  signedUrlByPath: ReadonlyMap<string, string>,
): T[] {
  return (rows ?? []).map((row) => {
    const path = resolveDiaryPhotoPath(row);
    if (path && signedUrlByPath.has(path)) {
      return { ...row, photo_url: signedUrlByPath.get(path) };
    }
    return row;
  });
}
