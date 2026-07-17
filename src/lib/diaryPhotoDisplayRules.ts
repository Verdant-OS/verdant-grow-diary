/**
 * diaryPhotoDisplayRules — pure validation for persisted diary-photo
 * references before a caller asks private storage for a temporary display URL.
 *
 * This module deliberately does not create URLs, contact storage, or inspect
 * authentication state. A caller supplies the authenticated viewer id and may
 * only request a signed URL for a returned `storage` reference.
 */

export const DIARY_PHOTO_BUCKET = "diary-photos" as const;
export const DIARY_PHOTO_STORAGE_SCHEME = "storage://" as const;

/** Limits are intentionally conservative for object-storage paths. */
export const MAX_DIARY_PHOTO_REFERENCE_LENGTH = 4096;
export const MAX_DIARY_PHOTO_STORAGE_PATH_LENGTH = 1024;
export const MAX_DIARY_PHOTO_STORAGE_SEGMENTS = 16;
export const MAX_DIARY_PHOTO_STORAGE_SEGMENT_LENGTH = 255;

export type DiaryPhotoDisplayReferenceInvalidReason =
  | "invalid-type"
  | "too-long"
  | "control-chars"
  | "unsupported-scheme"
  | "unsupported-bucket"
  | "malformed-storage-reference"
  | "missing-viewer"
  | "wrong-owner"
  | "leading-slash"
  | "query-or-hash"
  | "path-too-long"
  | "too-many-segments"
  | "segment-too-long"
  | "invalid-path"
  | "invalid-url";

/**
 * `external` is already safe to display. `storage` is deliberately a raw
 * object path for a later owner-scoped signing adapter, never UI copy.
 */
export type DiaryPhotoDisplayReference =
  | { kind: "clear" }
  | { kind: "external"; url: string }
  | { kind: "storage"; path: string }
  | { kind: "invalid"; reason: DiaryPhotoDisplayReferenceInvalidReason };

export interface ParseDiaryPhotoDisplayReferenceOptions {
  /** Authenticated viewer id. Required before a private path is accepted. */
  viewerUserId?: string | null;
}

export interface DiaryPhotoReferenceRowLike {
  photo_url?: unknown;
  details?: unknown;
}

function hasControlChars(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(value);
}

function hasUsableViewerId(
  options: ParseDiaryPhotoDisplayReferenceOptions,
): options is ParseDiaryPhotoDisplayReferenceOptions & { viewerUserId: string } {
  return typeof options.viewerUserId === "string" && options.viewerUserId.trim().length > 0;
}

function parsePrivateDiaryPhotoPath(
  path: string,
  options: ParseDiaryPhotoDisplayReferenceOptions,
): DiaryPhotoDisplayReference {
  if (path.length > MAX_DIARY_PHOTO_STORAGE_PATH_LENGTH) {
    return { kind: "invalid", reason: "path-too-long" };
  }
  if (path.startsWith("/")) {
    return { kind: "invalid", reason: "leading-slash" };
  }
  if (path.includes("?") || path.includes("#")) {
    return { kind: "invalid", reason: "query-or-hash" };
  }
  if (path.includes("\\")) {
    return { kind: "invalid", reason: "invalid-path" };
  }

  const segments = path.split("/");
  if (segments.length < 3) {
    return { kind: "invalid", reason: "invalid-path" };
  }
  if (segments.length > MAX_DIARY_PHOTO_STORAGE_SEGMENTS) {
    return { kind: "invalid", reason: "too-many-segments" };
  }

  for (const segment of segments) {
    if (segment.length === 0 || segment === "." || segment === ".." || hasControlChars(segment)) {
      return { kind: "invalid", reason: "invalid-path" };
    }
    if (segment.length > MAX_DIARY_PHOTO_STORAGE_SEGMENT_LENGTH) {
      return { kind: "invalid", reason: "segment-too-long" };
    }
  }

  if (!hasUsableViewerId(options)) {
    return { kind: "invalid", reason: "missing-viewer" };
  }
  if (segments[0] !== options.viewerUserId) {
    return { kind: "invalid", reason: "wrong-owner" };
  }

  return { kind: "storage", path };
}

function parseStorageReference(
  raw: string,
  options: ParseDiaryPhotoDisplayReferenceOptions,
): DiaryPhotoDisplayReference {
  const rest = raw.slice(DIARY_PHOTO_STORAGE_SCHEME.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex <= 0) {
    return { kind: "invalid", reason: "malformed-storage-reference" };
  }

  const bucket = rest.slice(0, slashIndex);
  if (bucket !== DIARY_PHOTO_BUCKET) {
    return { kind: "invalid", reason: "unsupported-bucket" };
  }

  return parsePrivateDiaryPhotoPath(rest.slice(slashIndex + 1), options);
}

function isHttpUrlCandidate(raw: string): boolean {
  return /^https?:\/\//i.test(raw);
}

function isSchemeCandidate(raw: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(raw);
}

/**
 * Classify a persisted photo reference without I/O.
 *
 * Legacy bare diary paths and canonical `storage://diary-photos/...` values
 * become `storage` only after the path is structurally valid and owned by the
 * supplied viewer. Existing http(s) URLs remain display-only `external` URLs.
 */
export function parseDiaryPhotoDisplayReference(
  raw: unknown,
  options: ParseDiaryPhotoDisplayReferenceOptions = {},
): DiaryPhotoDisplayReference {
  if (raw === null || raw === undefined) return { kind: "clear" };
  if (typeof raw !== "string") return { kind: "invalid", reason: "invalid-type" };

  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "clear" };
  if (trimmed.length > MAX_DIARY_PHOTO_REFERENCE_LENGTH) {
    return { kind: "invalid", reason: "too-long" };
  }
  if (hasControlChars(trimmed)) {
    return { kind: "invalid", reason: "control-chars" };
  }

  if (trimmed.startsWith(DIARY_PHOTO_STORAGE_SCHEME)) {
    return parseStorageReference(trimmed, options);
  }

  if (isHttpUrlCandidate(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return { kind: "external", url: trimmed };
      }
      return { kind: "invalid", reason: "unsupported-scheme" };
    } catch {
      return { kind: "invalid", reason: "invalid-url" };
    }
  }

  if (isSchemeCandidate(trimmed)) {
    return { kind: "invalid", reason: "unsupported-scheme" };
  }

  return parsePrivateDiaryPhotoPath(trimmed, options);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDisplayableReference(
  reference: DiaryPhotoDisplayReference,
): reference is Extract<DiaryPhotoDisplayReference, { kind: "external" | "storage" }> {
  return reference.kind === "external" || reference.kind === "storage";
}

/**
 * Parses the row's canonical top-level value first, then the historical
 * `details.photo_url` fallback only when the top-level value is not usable.
 * The caller receives a typed result and never needs to reach into raw JSON.
 */
export function parseDiaryPhotoDisplayReferenceFromRow(
  row: DiaryPhotoReferenceRowLike | null | undefined,
  options: ParseDiaryPhotoDisplayReferenceOptions = {},
): DiaryPhotoDisplayReference {
  if (!row) return { kind: "clear" };

  const topLevel = parseDiaryPhotoDisplayReference(row.photo_url, options);
  if (isDisplayableReference(topLevel)) return topLevel;

  const nestedPhotoUrl = isRecord(row.details) ? row.details.photo_url : undefined;
  const nested = parseDiaryPhotoDisplayReference(nestedPhotoUrl, options);
  if (isDisplayableReference(nested)) return nested;

  // Preserve the most useful invalid result for diagnostics. A top-level
  // invalid value is preferred when no valid historical fallback exists.
  if (topLevel.kind === "invalid") return topLevel;
  return nested;
}
