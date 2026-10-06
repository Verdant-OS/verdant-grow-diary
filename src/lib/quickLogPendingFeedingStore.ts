import type { FeedingTypedEventInput } from "./writeFeedingTypedEvent";
import {
  copyHistoryReviewTarget,
  historyReviewTargetAllowed,
  type PendingQuickLogHistoryReviewTarget,
} from "./quickLogHistoryReviewTargetRules";
import type { ResolvedQuickLogV2Target } from "./quickLogV2Rules";
import {
  buildFeedingFormPayload,
  isFeedingNumericRangeReason,
} from "./quickLogFeedingFormViewModel";
import { buildFeedingRecoveryForm } from "./quickLogFeedingRecoveryViewModel";
import {
  quickLogSaveRequiresHistoryCheck,
  type QuickLogHistoryCheckReason,
} from "./quickLogSaveErrorMessage";
import {
  isFeedingRejectionHistoryReason,
  type FeedingRejectionHistoryReason,
} from "./quickLogFeedingRejectionRules";

export interface PendingQuickLogFeeding {
  version: 1;
  ownerId: string;
  createdAt: string;
  payload: FeedingTypedEventInput;
  resolved: ResolvedQuickLogV2Target;
  /** Durable refusal of this same key; absent on older pending records. */
  historyCheckReason?: QuickLogHistoryCheckReason | FeedingRejectionHistoryReason;
  /** Only with receipt_target_moved: where the original entry lives now. */
  historyReviewTarget?: PendingQuickLogHistoryReviewTarget;
}

export const FEEDING_RECOVERY_UNAVAILABLE =
  "Feeding recovery storage is unavailable or cannot be read safely. No new Feeding was sent. Keep this draft and restore storage access before retrying.";
export const FEEDING_RECOVERY_PENDING =
  "This Feeding is unconfirmed. Retry checks the original entry and destination.";
export const FEEDING_RECOVERY_CLEAR_FAILED =
  "Your Feeding is saved. We couldn’t finish preparing the next Feeding. Try again before logging another.";

type PendingFeedingRead =
  | { status: "empty" }
  | { status: "pending"; record: PendingQuickLogFeeding }
  | { status: "blocked" };

const NUMERIC_KEYS = [
  "ph",
  "ec_in",
  "ec_out",
  "runoff_ml",
  "runoff_ph",
  "runoff_ec",
  "water_temp_c",
] as const;
const PAYLOAD_KEYS = [
  "idempotency_key",
  "grow_id",
  "tent_id",
  "plant_id",
  "occurred_at",
  "note",
  "nutrient_line_id",
  "products",
  "volume_ml",
  ...NUMERIC_KEYS,
];
const storageKey = (ownerId: string) => `verdant:quick-log:pending-feeding:v1:${ownerId}`;
function object(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  );
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}
function timestamp(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  if (!object(value) || Reflect.ownKeys(value).length !== Object.keys(value).length) return false;
  return Object.values(value).every(jsonValue);
}

/** Accept only the exact projection emitted by the Feed form; never repair stored data. */
function validRecord(value: unknown, ownerId: string): value is PendingQuickLogFeeding {
  if (
    !object(value) ||
    !jsonValue(value) ||
    !onlyKeys(value, [
      "version",
      "ownerId",
      "createdAt",
      "payload",
      "resolved",
      "historyCheckReason",
      "historyReviewTarget",
    ])
  )
    return false;
  if (
    value.version !== 1 ||
    !id(ownerId) ||
    value.ownerId !== ownerId ||
    !timestamp(value.createdAt)
  )
    return false;
  if (
    value.historyCheckReason !== undefined &&
    !feedingHistoryCheckReason(value.historyCheckReason)
  )
    return false;
  if (!historyReviewTargetAllowed(value.historyCheckReason, value.historyReviewTarget))
    return false;
  const p = value.payload;
  const r = value.resolved;
  if (
    !object(p) ||
    !onlyKeys(p, PAYLOAD_KEYS) ||
    !id(p.idempotency_key) ||
    p.idempotency_key.length < 8 ||
    p.idempotency_key.length > 200 ||
    !id(p.grow_id) ||
    !timestamp(p.occurred_at) ||
    !id(p.nutrient_line_id)
  )
    return false;
  if (typeof p.volume_ml !== "number" || !Number.isFinite(p.volume_ml)) return false;
  if (p.note !== null && p.note !== undefined && typeof p.note !== "string") return false;
  if (
    !NUMERIC_KEYS.every(
      (key) =>
        p[key] === undefined ||
        p[key] === null ||
        (typeof p[key] === "number" && Number.isFinite(p[key])),
    )
  )
    return false;
  if (
    !Array.isArray(p.products) ||
    !p.products.every(
      (product) =>
        object(product) &&
        onlyKeys(product, ["name", "amount", "unit"]) &&
        id(product.name) &&
        (product.unit === undefined || id(product.unit)) &&
        (product.amount === undefined ||
          (typeof product.amount === "number" && Number.isFinite(product.amount))),
    )
  )
    return false;
  if (
    !object(r) ||
    !onlyKeys(r, ["ok", "targetType", "targetId", "tentId", "plantId", "growId"]) ||
    r.ok !== true ||
    !id(r.targetId) ||
    r.growId !== p.grow_id ||
    ![r.tentId, r.plantId].every((v) => v === null || id(v))
  )
    return false;
  if ((p.tent_id ?? null) !== r.tentId || (p.plant_id ?? null) !== r.plantId) return false;
  if (
    r.targetType === "plant"
      ? r.targetId !== r.plantId
      : r.targetType !== "tent" || r.targetId !== r.tentId || r.plantId !== null
  )
    return false;
  // Reuse existing pure product/amount/secret/volume checks without initializing
  // the live writer client. The shape above is checked before form projection.
  // A value outside the mirrored server bounds is still a well-formed pending
  // record (an earlier build could dispatch it); it must restore so the
  // server's definitive rejection can release it, never read as blocked.
  const record = value as unknown as PendingQuickLogFeeding;
  const projected = buildFeedingFormPayload({
    growId: p.grow_id,
    tentId: r.tentId as string | null,
    plantId: r.plantId as string | null,
    idempotencyKey: p.idempotency_key,
    form: buildFeedingRecoveryForm(record).feedingForm,
  });
  return projected.ok || isFeedingNumericRangeReason(projected.reason);
}

function sameRecord(a: PendingQuickLogFeeding, b: PendingQuickLogFeeding): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function readPendingQuickLogFeeding(ownerId: string | null | undefined): PendingFeedingRead {
  if (!id(ownerId)) return { status: "blocked" };
  try {
    const raw = window.sessionStorage.getItem(storageKey(ownerId));
    if (raw === null) return { status: "empty" };
    const record: unknown = JSON.parse(raw);
    return validRecord(record, ownerId) ? { status: "pending", record } : { status: "blocked" };
  } catch {
    return { status: "blocked" };
  }
}

/** Claim synchronously before dispatch; an existing unresolved Feed always wins. */
export function claimPendingQuickLogFeeding(
  record: PendingQuickLogFeeding | null | undefined,
):
  | { status: "claimed"; record: PendingQuickLogFeeding }
  | Exclude<PendingFeedingRead, { status: "empty" }> {
  try {
    if (!record || !validRecord(record, record.ownerId)) return { status: "blocked" };
    const current = readPendingQuickLogFeeding(record.ownerId);
    if (current.status === "blocked") return current;
    if (current.status === "pending")
      return sameRecord(current.record, record)
        ? { status: "claimed", record: current.record }
        : current;
    const raw = JSON.stringify(record);
    window.sessionStorage.setItem(storageKey(record.ownerId), raw);
    if (window.sessionStorage.getItem(storageKey(record.ownerId)) !== raw)
      return { status: "blocked" };
    return { status: "claimed", record: JSON.parse(raw) as PendingQuickLogFeeding };
  } catch {
    return { status: "blocked" };
  }
}

/** Replay refusals plus Feed validation rejections that same-key Retry can never clear. */
function feedingHistoryCheckReason(
  reason: unknown,
): reason is QuickLogHistoryCheckReason | FeedingRejectionHistoryReason {
  return quickLogSaveRequiresHistoryCheck(reason) || isFeedingRejectionHistoryReason(reason);
}

/** Preserve a refusal only on its exact claimed record, with verified storage readback. */
export function markPendingQuickLogFeedingHistoryCheck(
  record: PendingQuickLogFeeding | null | undefined,
  reason: unknown,
  reviewTarget?: PendingQuickLogHistoryReviewTarget | null,
): { status: "marked"; record: PendingQuickLogFeeding } | { status: "blocked" } {
  try {
    if (!record || !validRecord(record, record.ownerId) || !feedingHistoryCheckReason(reason))
      return { status: "blocked" };
    // Only a moved receipt carries a review target, and it must be well formed.
    if (reviewTarget != null && !historyReviewTargetAllowed(reason, reviewTarget))
      return { status: "blocked" };
    const current = readPendingQuickLogFeeding(record.ownerId);
    if (current.status !== "pending" || !sameRecord(current.record, record))
      return { status: "blocked" };
    const marked: PendingQuickLogFeeding = {
      ...current.record,
      historyCheckReason: reason,
      ...(reviewTarget != null
        ? { historyReviewTarget: copyHistoryReviewTarget(reviewTarget) }
        : {}),
    };
    window.sessionStorage.setItem(storageKey(record.ownerId), JSON.stringify(marked));
    const verified = readPendingQuickLogFeeding(record.ownerId);
    return verified.status === "pending" && sameRecord(verified.record, marked)
      ? { status: "marked", record: verified.record }
      : { status: "blocked" };
  } catch {
    return { status: "blocked" };
  }
}

/** Clear only the exact owner/payload/target after confirmation or explicit abandonment. */
export function clearPendingQuickLogFeeding(
  record: PendingQuickLogFeeding | null | undefined,
): boolean {
  try {
    if (!record || !validRecord(record, record.ownerId)) return false;
    const current = readPendingQuickLogFeeding(record.ownerId);
    if (current.status !== "pending" || !sameRecord(current.record, record)) return false;
    window.sessionStorage.removeItem(storageKey(record.ownerId));
    return window.sessionStorage.getItem(storageKey(record.ownerId)) === null;
  } catch {
    return false;
  }
}
