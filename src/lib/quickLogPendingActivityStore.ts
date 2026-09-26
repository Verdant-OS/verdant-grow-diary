import {
  QUICK_LOG_ACTIVITY_DEFINITIONS,
  type QuickLogActivityId,
} from "@/constants/quickLogActivityTypes";
import {
  buildQuickLogTargetKey,
  type QuickLogTargetIdentityInput,
} from "@/lib/quickLogActivityRules";

/** The exact, serializable RPC input retained until its outcome is confirmed. */
export interface PendingQuickLogActivityInput {
  readonly activityId: QuickLogActivityId;
  readonly growId: string;
  readonly tentId: string | null;
  readonly plantId: string | null;
  readonly note: string | null;
  readonly occurredAt: string;
  readonly extraDetails: Record<string, unknown> | null;
  readonly idempotencyKey: string;
}

export interface PendingQuickLogActivity {
  readonly version: 1;
  readonly ownerId: string;
  readonly createdAt: string;
  readonly input: PendingQuickLogActivityInput;
  readonly receipt: {
    readonly symptomCheck: boolean;
    readonly harvestDetails: {
      readonly wetWeight?: string | null;
      readonly dryWeight?: string | null;
      readonly weightUnit?: string | null;
    } | null;
  };
}

export const ACTIVITY_RECOVERY_UNAVAILABLE =
  "Activity recovery storage is unavailable or cannot be read safely. No new activity will be sent. Restore storage access before retrying.";
export const ACTIVITY_RECOVERY_PENDING =
  "Save is unconfirmed. Retry checks the original activity and destination without changing its values.";
export const ACTIVITY_RECOVERY_RETRY_REJECTED =
  "The retry was rejected, but an earlier save may have succeeded. Check Timeline before logging another activity on this target.";
export const ACTIVITY_RECOVERY_CLEAR_FAILED =
  "Your activity was saved, but its recovery record could not be cleared. Restore storage access before logging another activity on this target.";
export const ACTIVITY_RECOVERY_REJECTED_CLEAR_FAILED =
  "The server refused this activity, but its recovery record could not be cleared. Restore storage access; Retry will clear the record without resending the activity.";

export type PendingActivityRead =
  | { readonly status: "empty" }
  | { readonly status: "pending"; readonly record: PendingQuickLogActivity }
  | { readonly status: "blocked" };

const PREFIX = "verdant:quick-log:pending-activity:v1:";

// A resolved RPC can outlive a failed sessionStorage removal. Keep the exact
// outcome in this tab's memory so a remounted editor retries cleanup without
// replaying either a confirmed write or a definitive rejection. A full page
// reload loses this hint; the server idempotency key remains the write fence.
const resolvedUncleared = new Map<
  string,
  {
    readonly record: string;
    readonly outcome:
      | { readonly kind: "confirmed"; readonly growEventId: string | null }
      | { readonly kind: "rejected" };
  }
>();

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

function optionalId(value: unknown): value is string | null {
  return value === null || nonempty(value);
}

function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  if (!object(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every(jsonValue);
}

function validRecord(
  value: unknown,
  ownerId: string,
  target: QuickLogTargetIdentityInput,
): value is PendingQuickLogActivity {
  if (!object(value) || !onlyKeys(value, ["version", "ownerId", "createdAt", "input", "receipt"]))
    return false;
  if (value.version !== 1 || value.ownerId !== ownerId || !nonempty(ownerId)) return false;
  if (
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    new Date(value.createdAt).toISOString() !== value.createdAt
  )
    return false;
  const input = value.input;
  if (
    !object(input) ||
    !onlyKeys(input, [
      "activityId",
      "growId",
      "tentId",
      "plantId",
      "note",
      "occurredAt",
      "extraDetails",
      "idempotencyKey",
    ])
  )
    return false;
  if (
    !nonempty(input.growId) ||
    !optionalId(input.tentId) ||
    !optionalId(input.plantId) ||
    (input.note !== null && typeof input.note !== "string") ||
    input.occurredAt !== value.createdAt ||
    !nonempty(input.idempotencyKey) ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 200
  )
    return false;
  if (
    typeof input.activityId !== "string" ||
    !Object.prototype.hasOwnProperty.call(QUICK_LOG_ACTIVITY_DEFINITIONS, input.activityId) ||
    ["photo", "watering", "manual_sensor_snapshot"].includes(input.activityId)
  )
    return false;
  if (
    input.extraDetails !== null &&
    (!object(input.extraDetails) || !jsonValue(input.extraDetails))
  )
    return false;
  const receipt = value.receipt;
  if (
    !object(receipt) ||
    !onlyKeys(receipt, ["symptomCheck", "harvestDetails"]) ||
    typeof receipt.symptomCheck !== "boolean"
  )
    return false;
  if (receipt.harvestDetails !== null) {
    if (
      !object(receipt.harvestDetails) ||
      !onlyKeys(receipt.harvestDetails, ["wetWeight", "dryWeight", "weightUnit"]) ||
      !Object.values(receipt.harvestDetails).every(
        (part) => part === null || typeof part === "string",
      )
    )
      return false;
  }
  return buildQuickLogTargetKey(input) === buildQuickLogTargetKey(target);
}

function storageKey(ownerId: string, target: QuickLogTargetIdentityInput): string {
  return `${PREFIX}${encodeURIComponent(ownerId)}:${encodeURIComponent(buildQuickLogTargetKey(target))}`;
}

/** An invalid or unreadable record is a lock, never an empty draft. */
export function readPendingQuickLogActivity(
  ownerId: string | null | undefined,
  target: QuickLogTargetIdentityInput | null | undefined,
): PendingActivityRead {
  if (!nonempty(ownerId) || !nonempty(target?.growId) || typeof window === "undefined")
    return { status: "blocked" };
  try {
    const key = storageKey(ownerId, target);
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) {
      resolvedUncleared.delete(key);
      return { status: "empty" };
    }
    const parsed: unknown = JSON.parse(raw);
    return validRecord(parsed, ownerId, target)
      ? { status: "pending", record: parsed }
      : { status: "blocked" };
  } catch {
    return { status: "blocked" };
  }
}

/** Remember a confirmed RPC only when its recovery record could not be cleared. */
export function rememberConfirmedPendingQuickLogActivity(
  record: PendingQuickLogActivity,
  growEventId: string | null,
): void {
  if (!validRecord(record, record.ownerId, record.input)) return;
  resolvedUncleared.set(storageKey(record.ownerId, record.input), {
    record: JSON.stringify(record),
    outcome: { kind: "confirmed", growEventId },
  });
}

/** A definitive first rejection must never be replayed after cleanup fails. */
export function rememberRejectedPendingQuickLogActivity(record: PendingQuickLogActivity): void {
  if (!validRecord(record, record.ownerId, record.input)) return;
  resolvedUncleared.set(storageKey(record.ownerId, record.input), {
    record: JSON.stringify(record),
    outcome: { kind: "rejected" },
  });
}

/** Return only an exact confirmation for this owner, target, and payload. */
export function readConfirmedPendingQuickLogActivity(
  record: PendingQuickLogActivity,
): { readonly growEventId: string | null } | null {
  if (!validRecord(record, record.ownerId, record.input)) return null;
  const key = storageKey(record.ownerId, record.input);
  const resolved = resolvedUncleared.get(key);
  if (resolved?.record !== JSON.stringify(record) || resolved.outcome.kind !== "confirmed")
    return null;
  return { growEventId: resolved.outcome.growEventId };
}

/** Return only an exact definitive rejection for this owner, target, and payload. */
export function readRejectedPendingQuickLogActivity(record: PendingQuickLogActivity): boolean {
  if (!validRecord(record, record.ownerId, record.input)) return false;
  const resolved = resolvedUncleared.get(storageKey(record.ownerId, record.input));
  return resolved?.record === JSON.stringify(record) && resolved.outcome.kind === "rejected";
}

export function samePendingQuickLogActivity(
  a: PendingQuickLogActivity,
  b: PendingQuickLogActivity,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Claim before dispatch so remounts and sibling editors cannot mint over an unresolved write. */
export function claimPendingQuickLogActivity(
  record: PendingQuickLogActivity,
): { readonly status: "claimed"; readonly record: PendingQuickLogActivity } | PendingActivityRead {
  try {
    if (!validRecord(record, record.ownerId, record.input)) return { status: "blocked" };
    const current = readPendingQuickLogActivity(record.ownerId, record.input);
    if (current.status === "blocked") return current;
    if (current.status === "pending")
      return samePendingQuickLogActivity(current.record, record)
        ? { status: "claimed", record: current.record }
        : current;
    const raw = JSON.stringify(record);
    window.sessionStorage.setItem(storageKey(record.ownerId, record.input), raw);
    if (window.sessionStorage.getItem(storageKey(record.ownerId, record.input)) !== raw)
      return { status: "blocked" };
    return { status: "claimed", record: JSON.parse(raw) as PendingQuickLogActivity };
  } catch {
    return { status: "blocked" };
  }
}

/** A late completion may clear only its own unchanged owner, target and payload. */
export function clearPendingQuickLogActivity(record: PendingQuickLogActivity): boolean {
  try {
    if (!validRecord(record, record.ownerId, record.input)) return false;
    const current = readPendingQuickLogActivity(record.ownerId, record.input);
    if (current.status !== "pending" || !samePendingQuickLogActivity(current.record, record))
      return false;
    const key = storageKey(record.ownerId, record.input);
    window.sessionStorage.removeItem(key);
    const cleared = window.sessionStorage.getItem(key) === null;
    if (cleared) resolvedUncleared.delete(key);
    return cleared;
  } catch {
    return false;
  }
}
