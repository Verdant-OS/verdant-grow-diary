import type { WateringTypedEventInput } from "./writeQuickLogWateringTypedEvent";
import type { ResolvedQuickLogV2Target } from "./quickLogV2Rules";
import { projectRootZoneManualObservationFromDetails } from "./rootZoneManualObservationRules";
import { isUuid } from "./isUuid";
import {
  starterWaterRecoveryKey,
  typedWaterRecoveryKey,
  waterRecoveryLockKey,
} from "./quickLogWaterRecoveryKeys";

export interface PendingQuickLogWatering {
  version: 1;
  ownerId: string;
  createdAt: string;
  payload: WateringTypedEventInput;
  resolved: ResolvedQuickLogV2Target;
  // Files cannot survive reload. Preserve intent without inventing attachments.
  attachments: { photo: boolean; video: boolean };
}

export const WATERING_RECOVERY_UNAVAILABLE =
  "Watering recovery storage is unavailable or cannot be read safely. No new Watering was sent. Keep this draft and restore storage access before retrying.";
export const WATERING_RECOVERY_PENDING =
  "An earlier Watering is unresolved. Retry to check the original entry and destination.";
export const WATERING_RECOVERY_CLEAR_FAILED =
  "Your Watering is saved. We couldn’t finish preparing the next Watering. Try again before logging another.";

export type PendingWateringRead =
  | { status: "empty" }
  | { status: "pending"; record: PendingQuickLogWatering }
  | { status: "blocked" };

const PAYLOAD_KEYS = [
  "idempotency_key",
  "grow_id",
  "tent_id",
  "plant_id",
  "occurred_at",
  "note",
  "volume_ml",
  "ph",
  "ec_ms_cm",
  "runoff_ml",
  "runoff_ph",
  "runoff_ec",
  "water_temp_c",
  "sensor_snapshot",
  "details",
] as const;
// Same ranges as the typed Water writer. Its module imports the live client,
// so recovery uses a type-only import and never initializes auth or network IO.
const OPTIONAL_NUMERIC_RANGES = [
  ["ph", 0, 14],
  ["ec_ms_cm", 0, 10],
  ["runoff_ml", 0, 1_000_000],
  ["runoff_ph", 0, 14],
  ["runoff_ec", 0, 10],
  ["water_temp_c", -10, 60],
] as const;
const SNAPSHOT_RANGES = {
  temperature_c: [-10, 60],
  humidity_pct: [0, 100],
  vpd_kpa: [0, 10],
} as const;
const FORBIDDEN_DETAIL_KEYS = ["user_id", "grow_id", "tent_id", "plant_id", "auth_uid", "auth.uid"];

function storageKey(ownerId: string): string {
  return typedWaterRecoveryKey(ownerId);
}

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

function nullableId(value: unknown): boolean {
  return value === null || isUuid(value);
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function numberInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function jsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  if (!object(value) || Reflect.ownKeys(value).length !== Object.keys(value).length) return false;
  return Object.values(value).every(jsonValue);
}

function validSnapshot(value: unknown, occurredAt: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!object(value) || !onlyKeys(value, ["source", "captured_at", "metrics"])) return false;
  if (
    value.source !== "manual" ||
    !timestamp(value.captured_at) ||
    value.captured_at !== occurredAt
  )
    return false;
  if (!object(value.metrics)) return false;
  const metrics = Object.entries(value.metrics);
  return (
    metrics.length > 0 &&
    metrics.every(([key, raw]) => {
      const range = SNAPSHOT_RANGES[key as keyof typeof SNAPSHOT_RANGES];
      return Object.hasOwn(SNAPSHOT_RANGES, key) && numberInRange(raw, range[0], range[1]);
    })
  );
}

/** Validate, never normalize, the exact retry projection before any dispatch. */
function validRecord(value: unknown, ownerId: string): value is PendingQuickLogWatering {
  if (
    !object(value) ||
    !jsonValue(value) ||
    !onlyKeys(value, ["version", "ownerId", "createdAt", "payload", "resolved", "attachments"])
  )
    return false;
  if (
    value.version !== 1 ||
    !id(ownerId) ||
    value.ownerId !== ownerId ||
    !timestamp(value.createdAt)
  )
    return false;
  const p = value.payload;
  const r = value.resolved;
  const a = value.attachments;
  if (!object(p) || !onlyKeys(p, PAYLOAD_KEYS)) return false;
  if (
    !id(p.idempotency_key) ||
    p.idempotency_key.length < 8 ||
    p.idempotency_key.length > 200 ||
    !isUuid(p.grow_id) ||
    (p.tent_id != null && !isUuid(p.tent_id)) ||
    (p.plant_id != null && !isUuid(p.plant_id))
  )
    return false;
  if (!numberInRange(p.volume_ml, Number.MIN_VALUE, 1_000_000)) return false;
  if (
    !OPTIONAL_NUMERIC_RANGES.every(
      ([key, min, max]) =>
        p[key] === undefined || p[key] === null || numberInRange(p[key], min, max),
    )
  )
    return false;
  if (
    p.note !== undefined &&
    p.note !== null &&
    (typeof p.note !== "string" || p.note.trim().length > 500)
  )
    return false;
  if (p.occurred_at !== undefined && p.occurred_at !== null && !timestamp(p.occurred_at))
    return false;
  if (!validSnapshot(p.sensor_snapshot, p.occurred_at)) return false;
  if (p.details !== undefined && p.details !== null) {
    if (
      !object(p.details) ||
      FORBIDDEN_DETAIL_KEYS.some((key) => Object.hasOwn(p.details as object, key))
    )
      return false;
    if (JSON.stringify(p.details).length > 20_000) return false;
    if (
      projectRootZoneManualObservationFromDetails(
        p.details,
        typeof p.occurred_at === "string" ? p.occurred_at : "",
      ).status === "invalid"
    )
      return false;
  }
  if (!object(r) || !onlyKeys(r, ["ok", "targetType", "targetId", "tentId", "plantId", "growId"]))
    return false;
  if (
    r.ok !== true ||
    !isUuid(r.targetId) ||
    r.growId !== p.grow_id ||
    ![r.tentId, r.plantId].every(nullableId)
  )
    return false;
  if ((p.tent_id ?? null) !== r.tentId || (p.plant_id ?? null) !== r.plantId) return false;
  if (
    r.targetType === "plant"
      ? r.targetId !== r.plantId
      : r.targetType !== "tent" || r.targetId !== r.tentId || r.plantId !== null
  )
    return false;
  return (
    object(a) &&
    onlyKeys(a, ["photo", "video"]) &&
    typeof a.photo === "boolean" &&
    typeof a.video === "boolean"
  );
}

function sameRecord(a: PendingQuickLogWatering, b: PendingQuickLogWatering): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function readPendingQuickLogWatering(
  ownerId: string | null | undefined,
): PendingWateringRead {
  if (!id(ownerId)) return { status: "blocked" };
  try {
    const sharedRaw = window.localStorage.getItem(storageKey(ownerId));
    // A pre-upgrade same-tab recovery is still readable. It is promoted to
    // shared storage under the owner lock before its next RPC dispatch.
    const legacyRaw = window.sessionStorage.getItem(storageKey(ownerId));
    if (sharedRaw !== null && legacyRaw !== null && sharedRaw !== legacyRaw)
      return { status: "blocked" };
    const raw = sharedRaw ?? legacyRaw;
    if (raw === null) return { status: "empty" };
    const record: unknown = JSON.parse(raw);
    return validRecord(record, ownerId) ? { status: "pending", record } : { status: "blocked" };
  } catch {
    return { status: "blocked" };
  }
}

/** An owner-scoped, cross-tab claim before upload or RPC dispatch. */
export async function claimPendingQuickLogWatering(
  record: PendingQuickLogWatering | null | undefined,
): Promise<
  | { status: "claimed"; record: PendingQuickLogWatering }
  | Exclude<PendingWateringRead, { status: "empty" }>
  | { status: "other_pending" }
> {
  try {
    if (!record || !validRecord(record, record.ownerId)) return { status: "blocked" };
    const locks = window.navigator.locks;
    if (!locks?.request) return { status: "blocked" };
    return await locks.request(waterRecoveryLockKey(record.ownerId), { mode: "exclusive" }, () => {
      if (window.localStorage.getItem(starterWaterRecoveryKey(record.ownerId)) !== null)
        return { status: "other_pending" as const };
      const current = readPendingQuickLogWatering(record.ownerId);
      if (current.status === "blocked") return current;
      if (current.status === "pending" && !sameRecord(current.record, record)) return current;
      const raw = JSON.stringify(current.status === "pending" ? current.record : record);
      window.localStorage.setItem(storageKey(record.ownerId), raw);
      if (window.localStorage.getItem(storageKey(record.ownerId)) !== raw)
        return { status: "blocked" as const };
      // The shared copy is durable only after readback. Remove the old
      // tab-local copy before dispatch so another tab's later clearance
      // cannot resurrect a completed Watering in this tab.
      if (window.sessionStorage.getItem(storageKey(record.ownerId)) !== null) {
        window.sessionStorage.removeItem(storageKey(record.ownerId));
        if (window.sessionStorage.getItem(storageKey(record.ownerId)) !== null)
          return { status: "blocked" as const };
      }
      return { status: "claimed" as const, record: JSON.parse(raw) as PendingQuickLogWatering };
    });
  } catch {
    return { status: "blocked" };
  }
}

/** A late completion can remove only its unchanged owner, key, payload and destination. */
export async function clearPendingQuickLogWatering(
  record: PendingQuickLogWatering | null | undefined,
): Promise<boolean> {
  try {
    if (!record || !validRecord(record, record.ownerId)) return false;
    const locks = window.navigator.locks;
    if (!locks?.request) return false;
    return await locks.request(waterRecoveryLockKey(record.ownerId), { mode: "exclusive" }, () => {
      const current = readPendingQuickLogWatering(record.ownerId);
      if (current.status !== "pending" || !sameRecord(current.record, record)) return false;
      window.localStorage.removeItem(storageKey(record.ownerId));
      window.sessionStorage.removeItem(storageKey(record.ownerId));
      return (
        window.localStorage.getItem(storageKey(record.ownerId)) === null &&
        window.sessionStorage.getItem(storageKey(record.ownerId)) === null
      );
    });
  } catch {
    return false;
  }
}

/** Another tab may clear the same confirmed Water first; an empty slot is resolved. */
export async function reconcilePendingQuickLogWateringClear(
  record: PendingQuickLogWatering,
): Promise<
  | { status: "cleared" }
  | { status: "already_cleared" }
  | Exclude<PendingWateringRead, { status: "empty" }>
> {
  if (await clearPendingQuickLogWatering(record)) return { status: "cleared" };
  const current = readPendingQuickLogWatering(record?.ownerId);
  if (current.status === "empty") return { status: "already_cleared" };
  return current;
}
