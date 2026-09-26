import type { QuickLogV2SavePayload } from "./quickLogV2SavePayload";
import type { QuickLogResolvedTarget } from "./quickLogTargetIntegrityRules";

/** The legacy public-starter Water RPC must replay this exact logical write. */
export interface PendingStarterWater {
  version: 1;
  ownerId: string;
  createdAt: string;
  payload: QuickLogV2SavePayload;
  target: QuickLogResolvedTarget;
  plantName: string;
  tentName: string | null;
  growName: string | null;
  stageWasUserTouched: boolean;
  reviewedDraftId: string | null;
  reviewedDraftUpdatedAt: string | null;
}

export const STARTER_WATER_RECOVERY_PENDING =
  "An earlier Watering may already be saved. Retry that exact Watering before starting another; edits on this form will not be sent.";
export const STARTER_WATER_RECOVERY_UNAVAILABLE =
  "Watering recovery storage cannot be verified. Watering is paused until storage access returns; other log types can still be saved.";
export const STARTER_WATER_RECOVERY_CLEAR_FAILED =
  "Your Watering is saved, but recovery could not be cleared. Retry recovery before logging another Watering.";

export type PendingStarterWaterRead =
  { status: "empty" } | { status: "pending"; record: PendingStarterWater } | { status: "blocked" };

const PAYLOAD_KEYS = [
  "p_target_type",
  "p_target_id",
  "p_action",
  "p_volume_ml",
  "p_note",
  "p_temperature_c",
  "p_humidity_pct",
  "p_vpd_kpa",
  "p_occurred_at",
  "p_details",
  "p_stage",
  "p_idempotency_key",
] as const;
const RECORD_KEYS = [
  "version",
  "ownerId",
  "createdAt",
  "payload",
  "target",
  "plantName",
  "tentName",
  "growName",
  "stageWasUserTouched",
  "reviewedDraftId",
  "reviewedDraftUpdatedAt",
] as const;

const storageKey = (ownerId: string) => `verdant:quick-log:pending-starter-water:v1:${ownerId}`;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const id = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim() === value;
const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
const nullableNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value));
const time = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function validRecord(value: unknown, ownerId: string): value is PendingStarterWater {
  if (!object(value) || !onlyKeys(value, RECORD_KEYS)) return false;
  if (value.version !== 1 || !id(ownerId) || value.ownerId !== ownerId || !time(value.createdAt))
    return false;
  if (!object(value.payload) || !onlyKeys(value.payload, PAYLOAD_KEYS)) return false;
  const p = value.payload;
  if (p.p_target_type !== "plant" || p.p_action !== "water" || !id(p.p_target_id)) return false;
  if (
    !id(p.p_idempotency_key) ||
    p.p_idempotency_key.length < 8 ||
    p.p_idempotency_key.length > 200
  )
    return false;
  if (typeof p.p_volume_ml !== "number" || !Number.isFinite(p.p_volume_ml) || p.p_volume_ml <= 0)
    return false;
  if (!nullableString(p.p_note) || (p.p_note?.length ?? 0) > 5_000) return false;
  if (![p.p_temperature_c, p.p_humidity_pct, p.p_vpd_kpa].every(nullableNumber)) return false;
  if (p.p_occurred_at !== null && !time(p.p_occurred_at)) return false;
  if (p.p_stage !== undefined && !nullableString(p.p_stage)) return false;
  if (p.p_details !== undefined && p.p_details !== null && !object(p.p_details)) return false;
  if (!object(value.target) || !onlyKeys(value.target, ["plantId", "growId", "tentId"]))
    return false;
  if (!id(value.target.plantId) || !id(value.target.growId) || !id(value.target.tentId))
    return false;
  if (value.target.plantId !== p.p_target_id) return false;
  if (!id(value.plantName) || !nullableString(value.tentName) || !nullableString(value.growName))
    return false;
  if (value.stageWasUserTouched !== true && value.stageWasUserTouched !== false) return false;
  if (!nullableString(value.reviewedDraftId) || !nullableString(value.reviewedDraftUpdatedAt))
    return false;
  try {
    return JSON.stringify(value).length <= 30_000;
  } catch {
    return false;
  }
}

const sameRecord = (a: PendingStarterWater, b: PendingStarterWater) =>
  JSON.stringify(a) === JSON.stringify(b);

export function readPendingStarterWater(
  ownerId: string | null | undefined,
): PendingStarterWaterRead {
  if (!id(ownerId)) return { status: "blocked" };
  try {
    const raw = window.sessionStorage.getItem(storageKey(ownerId));
    if (raw === null) return { status: "empty" };
    const value: unknown = JSON.parse(raw);
    return validRecord(value, ownerId)
      ? { status: "pending", record: value }
      : { status: "blocked" };
  } catch {
    return { status: "blocked" };
  }
}

/** Claim before dispatch. A second form can never replace an unresolved write. */
export function claimPendingStarterWater(
  record: PendingStarterWater,
):
  | { status: "claimed"; record: PendingStarterWater }
  | { status: "pending"; record: PendingStarterWater }
  | { status: "blocked" } {
  try {
    if (!record || !validRecord(record, record.ownerId)) return { status: "blocked" };
    const current = readPendingStarterWater(record.ownerId);
    if (current.status === "blocked") return current;
    if (current.status === "pending")
      return sameRecord(current.record, record)
        ? { status: "claimed", record: current.record }
        : current;
    const raw = JSON.stringify(record);
    window.sessionStorage.setItem(storageKey(record.ownerId), raw);
    if (window.sessionStorage.getItem(storageKey(record.ownerId)) !== raw)
      return { status: "blocked" };
    return { status: "claimed", record: JSON.parse(raw) as PendingStarterWater };
  } catch {
    return { status: "blocked" };
  }
}

/** Only the matching owner, key, target, and payload may clear recovery. */
export function clearPendingStarterWater(record: PendingStarterWater): boolean {
  try {
    if (!record || !validRecord(record, record.ownerId)) return false;
    const current = readPendingStarterWater(record.ownerId);
    if (current.status !== "pending" || !sameRecord(current.record, record)) return false;
    window.sessionStorage.removeItem(storageKey(record.ownerId));
    return window.sessionStorage.getItem(storageKey(record.ownerId)) === null;
  } catch {
    return false;
  }
}
