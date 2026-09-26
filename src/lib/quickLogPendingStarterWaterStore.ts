import type { QuickLogV2SavePayload } from "./quickLogV2SavePayload";
import type { QuickLogResolvedTarget } from "./quickLogTargetIntegrityRules";
import { isUuid } from "./isUuid";
import {
  starterWaterRecoveryKey,
  typedWaterRecoveryKey,
  waterRecoveryLockKey,
} from "./quickLogWaterRecoveryKeys";

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
export const TYPED_WATER_RECOVERY_PENDING =
  "An earlier Watering from Quick Log may already be saved. Reopen Quick Log and resolve that Watering before starting another.";

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

const storageKey = starterWaterRecoveryKey;
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
  if (p.p_target_type !== "plant" || p.p_action !== "water" || !isUuid(p.p_target_id)) return false;
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
  if (!isUuid(value.target.plantId) || !isUuid(value.target.growId) || !isUuid(value.target.tentId))
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
    const raw = window.localStorage.getItem(storageKey(ownerId));
    if (raw === null) return { status: "empty" };
    const value: unknown = JSON.parse(raw);
    return validRecord(value, ownerId)
      ? { status: "pending", record: value }
      : { status: "blocked" };
  } catch {
    return { status: "blocked" };
  }
}

/** An empty read alone does not prove storage writes have recovered. */
export function canPersistStarterWaterRecovery(ownerId: string | null | undefined): boolean {
  if (!id(ownerId)) return false;
  const probeKey = `verdant:quick-log:water-recovery-probe:v1:${ownerId}`;
  try {
    window.localStorage.setItem(probeKey, ownerId);
    if (window.localStorage.getItem(probeKey) !== ownerId) return false;
    window.localStorage.removeItem(probeKey);
    return window.localStorage.getItem(probeKey) === null;
  } catch {
    return false;
  }
}

/** Claim before dispatch. A second form can never replace an unresolved write. */
export async function claimPendingStarterWater(
  record: PendingStarterWater,
): Promise<
  | { status: "claimed"; record: PendingStarterWater }
  | { status: "pending"; record: PendingStarterWater }
  | { status: "other_pending" }
  | { status: "blocked" }
> {
  try {
    if (!record || !validRecord(record, record.ownerId)) return { status: "blocked" };
    // localStorage survives tab closure and is shared across tabs. The Web
    // Lock makes the read/check/write one exclusive claim per owner; without
    // it two tabs could both observe an empty slot and dispatch different keys.
    const locks = window.navigator.locks;
    if (!locks?.request) return { status: "blocked" };
    return await locks.request(waterRecoveryLockKey(record.ownerId), { mode: "exclusive" }, () => {
      // A typed Water is held in the same origin-wide storage. Any value,
      // including an unreadable one, blocks a different Water operation.
      if (
        window.localStorage.getItem(typedWaterRecoveryKey(record.ownerId)) !== null ||
        window.sessionStorage.getItem(typedWaterRecoveryKey(record.ownerId)) !== null
      )
        return { status: "other_pending" as const };
      const current = readPendingStarterWater(record.ownerId);
      if (current.status === "blocked") return current;
      if (current.status === "pending")
        return sameRecord(current.record, record)
          ? { status: "claimed" as const, record: current.record }
          : current;
      const raw = JSON.stringify(record);
      window.localStorage.setItem(storageKey(record.ownerId), raw);
      if (window.localStorage.getItem(storageKey(record.ownerId)) !== raw)
        return { status: "blocked" as const };
      return { status: "claimed" as const, record: JSON.parse(raw) as PendingStarterWater };
    });
  } catch {
    return { status: "blocked" };
  }
}

/** Only the matching owner, key, target, and payload may clear recovery. */
export async function clearPendingStarterWater(record: PendingStarterWater): Promise<boolean> {
  try {
    if (!record || !validRecord(record, record.ownerId)) return false;
    const locks = window.navigator.locks;
    if (!locks?.request) return false;
    return await locks.request(waterRecoveryLockKey(record.ownerId), { mode: "exclusive" }, () => {
      const current = readPendingStarterWater(record.ownerId);
      if (current.status !== "pending" || !sameRecord(current.record, record)) return false;
      window.localStorage.removeItem(storageKey(record.ownerId));
      return window.localStorage.getItem(storageKey(record.ownerId)) === null;
    });
  } catch {
    return false;
  }
}

/** Another tab may have cleared a confirmed record first; that is resolved, not a storage error. */
export async function reconcilePendingStarterWaterClear(
  record: PendingStarterWater,
): Promise<
  | { status: "cleared" }
  | { status: "already_cleared" }
  | { status: "pending"; record: PendingStarterWater }
  | { status: "blocked" }
> {
  if (await clearPendingStarterWater(record)) return { status: "cleared" };
  const current = readPendingStarterWater(record.ownerId);
  if (current.status === "empty") return { status: "already_cleared" };
  return current;
}
