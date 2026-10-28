import { isUuid } from "./isUuid";
import {
  quickLogSaveRequiresHistoryCheck,
  type QuickLogHistoryCheckReason,
} from "./quickLogSaveErrorMessage";

/**
 * Tab-scoped record that the legacy Quick Log dialog was refused with a
 * history-review reason. Without it a reload remounts the dialog unlocked with
 * a fresh idempotency key, and the same log could be saved again as a new
 * record before the grower checked Timeline. Only the explicit "I checked
 * Timeline; discard draft" action clears it. It never claims a saved receipt.
 */
export interface LegacyQuickLogHistoryFence {
  version: 1;
  ownerId: string;
  createdAt: string;
  reason: QuickLogHistoryCheckReason;
  /** Where to review the original entry; ids only, the link is rebuilt on read. */
  review: { growId: string | null; tentId: string | null; plantId: string | null };
}

export type LegacyQuickLogHistoryFenceRead =
  | { status: "empty" }
  | { status: "fenced"; record: LegacyQuickLogHistoryFence }
  // Something is stored under this owner's key but it is not a valid fence.
  // Callers stay locked until the grower's explicit discard clears it.
  | { status: "invalid" };

const fenceKey = (ownerId: string) => `verdant:quick-log:legacy-history-fence:v1:${ownerId}`;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const ownerOk = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim() === value;
const nullableUuid = (value: unknown): value is string | null => value === null || isUuid(value);

function validFence(value: unknown, ownerId: string): value is LegacyQuickLogHistoryFence {
  if (!object(value) || !onlyKeys(value, ["version", "ownerId", "createdAt", "reason", "review"]))
    return false;
  if (value.version !== 1 || value.ownerId !== ownerId) return false;
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)))
    return false;
  if (!quickLogSaveRequiresHistoryCheck(value.reason)) return false;
  const review = value.review;
  return (
    object(review) &&
    onlyKeys(review, ["growId", "tentId", "plantId"]) &&
    nullableUuid(review.growId) &&
    nullableUuid(review.tentId) &&
    nullableUuid(review.plantId)
  );
}

export function readLegacyQuickLogHistoryFence(
  ownerId: string | null | undefined,
): LegacyQuickLogHistoryFenceRead {
  if (!ownerOk(ownerId)) return { status: "empty" };
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(fenceKey(ownerId));
  } catch {
    // snip: unreadable storage cannot hold a fence this tab wrote; the mounted
    // dialog's in-memory lock still covers the refusal that just happened.
    return { status: "empty" };
  }
  if (raw === null) return { status: "empty" };
  try {
    const value: unknown = JSON.parse(raw);
    return validFence(value, ownerId) ? { status: "fenced", record: value } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

/** Best effort: a failed write leaves only the mounted dialog's in-memory lock. */
export function writeLegacyQuickLogHistoryFence(record: LegacyQuickLogHistoryFence): boolean {
  if (!validFence(record, record.ownerId)) return false;
  try {
    const serialized = JSON.stringify(record);
    window.sessionStorage.setItem(fenceKey(record.ownerId), serialized);
    return window.sessionStorage.getItem(fenceKey(record.ownerId)) === serialized;
  } catch {
    return false;
  }
}

/** True only when the fence is verifiably gone; callers stay locked otherwise. */
export function clearLegacyQuickLogHistoryFence(ownerId: string | null | undefined): boolean {
  if (!ownerOk(ownerId)) return false;
  try {
    window.sessionStorage.removeItem(fenceKey(ownerId));
    return window.sessionStorage.getItem(fenceKey(ownerId)) === null;
  } catch {
    return false;
  }
}
