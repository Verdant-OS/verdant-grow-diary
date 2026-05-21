/**
 * Pure rules for deriving a read-only photo history view-model from
 * normalized diary entries.
 *
 * NO database access. NO RPC. NO writes. The presenter MUST consume this
 * module's output and MUST NOT reach into raw `details` JSON.
 */
import type { NormalizedDiaryEntry } from "./diaryEntryRules";

export interface PhotoHistoryRow {
  id: string;
  /** ISO string when valid, otherwise null. */
  occurredAt: string | null;
  occurredAtLabel: string;
  growId: string | null;
  plantId: string | null;
  tentId: string | null;
  stage: string | null;
  eventType: string;
  /** Safe http(s) URL or null when missing/invalid. */
  photoUrl: string | null;
  caption: string;
  warnings: string[];
}

const CAPTION_PREVIEW_MAX = 200;

function previewCaption(note: string): string {
  const trimmed = (note ?? "").trim();
  if (trimmed.length <= CAPTION_PREVIEW_MAX) return trimmed;
  return trimmed.slice(0, CAPTION_PREVIEW_MAX - 1).trimEnd() + "…";
}

/**
 * Accept only http(s) URLs. Reject `javascript:`, `data:`, blank strings,
 * and any non-string value.
 */
function sanitizeUrl(raw: unknown): { url: string | null; warning: string | null } {
  if (raw === undefined || raw === null) {
    return { url: null, warning: null };
  }
  if (typeof raw !== "string") {
    return { url: null, warning: "photo_url:invalid-type" };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { url: null, warning: "photo_url:blank" };
  }
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { url: null, warning: "photo_url:unsupported-protocol" };
    }
    return { url: trimmed, warning: null };
  } catch {
    return { url: null, warning: "photo_url:invalid" };
  }
}

function isPhotoEntry(entry: NormalizedDiaryEntry, sanitizedUrl: string | null): boolean {
  if (entry.eventType === "photo") return true;
  // Any entry that successfully carries a photo URL is treated as a photo
  // entry for gallery purposes regardless of stored event_type.
  if (sanitizedUrl !== null) return true;
  return false;
}

function toRow(entry: NormalizedDiaryEntry): PhotoHistoryRow | null {
  const sanitized = sanitizeUrl(entry.photoUrl);

  // Entry qualifies as a photo if event_type === "photo" OR a valid URL is present.
  // For "photo" entries with no valid URL we still surface a row with a warning.
  if (!isPhotoEntry(entry, sanitized.url)) return null;

  const seen = new Set<string>();
  const warnings: string[] = [];
  const push = (w: string) => {
    if (!seen.has(w)) {
      seen.add(w);
      warnings.push(w);
    }
  };
  for (const w of entry.warnings) push(w);
  if (sanitized.warning) push(sanitized.warning);
  if (entry.eventType === "photo" && sanitized.url === null && !sanitized.warning) {
    push("photo_url:missing");
  }

  return {
    id: entry.id,
    occurredAt: entry.createdAt,
    occurredAtLabel: entry.createdAtLabel,
    growId: entry.growId,
    plantId: entry.plantId,
    tentId: entry.tentId,
    stage: entry.stage,
    eventType: entry.eventType,
    photoUrl: sanitized.url,
    caption: previewCaption(entry.note),
    warnings,
  };
}

/**
 * Deterministic newest-first ordering:
 *   1. Entries with a valid `occurredAt` first, sorted by timestamp desc.
 *   2. Entries without a valid timestamp last, sorted by id asc.
 */
function compareNewestFirst(a: PhotoHistoryRow, b: PhotoHistoryRow): number {
  const aHas = a.occurredAt !== null;
  const bHas = b.occurredAt !== null;
  if (aHas && bHas) {
    const da = Date.parse(a.occurredAt as string);
    const db = Date.parse(b.occurredAt as string);
    if (db !== da) return db - da;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }
  if (aHas) return -1;
  if (bHas) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildPhotoHistory(
  entries: readonly NormalizedDiaryEntry[],
): PhotoHistoryRow[] {
  if (!entries || entries.length === 0) return [];
  const rows: PhotoHistoryRow[] = [];
  for (const e of entries) {
    const r = toRow(e);
    if (r) rows.push(r);
  }
  rows.sort(compareNewestFirst);
  return rows;
}
