import type { QuickLogV2SavePayload } from "./quickLogV2SavePayload";
import type { ResolvedQuickLogV2Target } from "./quickLogV2Rules";

export interface PendingQuickLogNote {
  version: 1;
  ownerId: string;
  createdAt: string;
  payload: QuickLogV2SavePayload;
  resolved: ResolvedQuickLogV2Target;
  // File objects cannot survive reload. Retain intent, never fabricate Files.
  attachments: { photo: boolean; video: boolean };
}

export const NOTE_RECOVERY_UNAVAILABLE =
  "Note recovery storage is unavailable or cannot be read safely. No new Note was sent. Keep this draft and restore storage access before retrying.";
export const NOTE_RECOVERY_PENDING =
  "An earlier Note is unresolved. Retry to check the original entry and destination.";
export const NOTE_RECOVERY_CLEAR_FAILED =
  "Your Note is saved. We couldn’t finish preparing the next Note. Try again before logging another.";

export type PendingNoteRead =
  | { status: "empty" }
  | { status: "pending"; record: PendingQuickLogNote }
  | { status: "blocked" };

function storageKey(ownerId: string): string {
  return `verdant:quick-log:pending-note:v1:${ownerId}`;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function nullableNumber(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  if (!object(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every(jsonValue);
}

/** A closed, versioned projection; unknown/corrupt data never means "no pending Note". */
function validRecord(value: unknown, ownerId: string): value is PendingQuickLogNote {
  if (!object(value) || !onlyKeys(value, ["version", "ownerId", "createdAt", "payload", "resolved", "attachments"])) return false;
  if (value.version !== 1 || value.ownerId !== ownerId || !ownerId.trim()) return false;
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return false;
  const p = value.payload;
  const r = value.resolved;
  const a = value.attachments;
  if (!object(p) || !onlyKeys(p, [
    "p_target_type", "p_target_id", "p_action", "p_volume_ml", "p_note",
    "p_temperature_c", "p_humidity_pct", "p_vpd_kpa", "p_occurred_at",
    "p_details", "p_stage", "p_idempotency_key",
  ])) return false;
  if (p.p_action !== "note" || !["plant", "tent"].includes(p.p_target_type as string)) return false;
  if (typeof p.p_target_id !== "string" || !p.p_target_id.trim()) return false;
  if (typeof p.p_idempotency_key !== "string" || p.p_idempotency_key.length < 8 || p.p_idempotency_key.length > 200) return false;
  if (p.p_volume_ml !== null || !nullableString(p.p_note)) return false;
  if (![p.p_temperature_c, p.p_humidity_pct, p.p_vpd_kpa].every(nullableNumber)) return false;
  if (p.p_occurred_at !== null && (typeof p.p_occurred_at !== "string" || !Number.isFinite(Date.parse(p.p_occurred_at)))) return false;
  if (p.p_stage !== undefined && !nullableString(p.p_stage)) return false;
  if (p.p_details !== undefined && p.p_details !== null && (!object(p.p_details) || !jsonValue(p.p_details))) return false;
  if (!object(r) || !onlyKeys(r, ["ok", "targetType", "targetId", "tentId", "plantId", "growId"])) return false;
  if (r.ok !== true || r.targetType !== p.p_target_type || r.targetId !== p.p_target_id) return false;
  if (![r.tentId, r.plantId, r.growId].every(nullableString)) return false;
  if (p.p_target_type === "plant" ? r.plantId !== p.p_target_id : r.tentId !== p.p_target_id || r.plantId !== null) return false;
  return object(a) && onlyKeys(a, ["photo", "video"]) && typeof a.photo === "boolean" && typeof a.video === "boolean";
}

export function readPendingQuickLogNote(ownerId: string | null): PendingNoteRead {
  if (!ownerId) return { status: "blocked" };
  try {
    const raw = window.sessionStorage.getItem(storageKey(ownerId));
    if (raw === null) return { status: "empty" };
    const record: unknown = JSON.parse(raw);
    return validRecord(record, ownerId) ? { status: "pending", record } : { status: "blocked" };
  } catch {
    return { status: "blocked" };
  }
}

function sameRecord(a: PendingQuickLogNote, b: PendingQuickLogNote): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Synchronous same-tab claim before any Note dispatch. A second mounted sheet
 * must recover the first record, never overwrite it. No expiry or consume-on-read.
 */
export function claimPendingQuickLogNote(record: PendingQuickLogNote):
  | { status: "claimed"; record: PendingQuickLogNote }
  | Exclude<PendingNoteRead, { status: "empty" }> {
  try {
    if (!validRecord(record, record.ownerId)) return { status: "blocked" };
    const current = readPendingQuickLogNote(record.ownerId);
    if (current.status === "blocked") return current;
    if (current.status === "pending") {
      return sameRecord(current.record, record) ? { status: "claimed", record: current.record } : current;
    }
    const raw = JSON.stringify(record);
    window.sessionStorage.setItem(storageKey(record.ownerId), raw);
    // A blocked/no-op storage implementation must not permit the RPC either.
    if (window.sessionStorage.getItem(storageKey(record.ownerId)) !== raw) return { status: "blocked" };
    return { status: "claimed", record: JSON.parse(raw) as PendingQuickLogNote };
  } catch {
    return { status: "blocked" };
  }
}

/** A late completion can remove only its own unchanged owner/key/payload. */
export function clearPendingQuickLogNote(record: PendingQuickLogNote): boolean {
  try {
    const current = readPendingQuickLogNote(record.ownerId);
    if (current.status !== "pending" || !sameRecord(current.record, record)) return false;
    window.sessionStorage.removeItem(storageKey(record.ownerId));
    return window.sessionStorage.getItem(storageKey(record.ownerId)) === null;
  } catch {
    return false;
  }
}
