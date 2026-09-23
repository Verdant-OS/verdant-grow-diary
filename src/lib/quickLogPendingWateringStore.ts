import type { WateringTypedEventInput } from "./writeQuickLogWateringTypedEvent";
import type { ResolvedQuickLogV2Target } from "./quickLogV2Rules";
import { projectRootZoneManualObservationFromDetails } from "./rootZoneManualObservationRules";

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
  return `verdant:quick-log:pending-watering:v1:${ownerId}`;
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
  return value === null || id(value);
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
    !id(p.grow_id)
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
    !id(r.targetId) ||
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
    const raw = window.sessionStorage.getItem(storageKey(ownerId));
    if (raw === null) return { status: "empty" };
    const record: unknown = JSON.parse(raw);
    return validRecord(record, ownerId) ? { status: "pending", record } : { status: "blocked" };
  } catch {
    return { status: "blocked" };
  }
}

/** Synchronous same-tab claim. No expiry, consume-on-read or replacement of an unresolved save. */
export function claimPendingQuickLogWatering(
  record: PendingQuickLogWatering | null | undefined,
):
  | { status: "claimed"; record: PendingQuickLogWatering }
  | Exclude<PendingWateringRead, { status: "empty" }> {
  try {
    if (!record || !validRecord(record, record.ownerId)) return { status: "blocked" };
    const current = readPendingQuickLogWatering(record.ownerId);
    if (current.status === "blocked") return current;
    if (current.status === "pending")
      return sameRecord(current.record, record)
        ? { status: "claimed", record: current.record }
        : current;
    const raw = JSON.stringify(record);
    window.sessionStorage.setItem(storageKey(record.ownerId), raw);
    if (window.sessionStorage.getItem(storageKey(record.ownerId)) !== raw)
      return { status: "blocked" };
    return { status: "claimed", record: JSON.parse(raw) as PendingQuickLogWatering };
  } catch {
    return { status: "blocked" };
  }
}

/** A late completion can remove only its unchanged owner, key, payload and destination. */
export function clearPendingQuickLogWatering(
  record: PendingQuickLogWatering | null | undefined,
): boolean {
  try {
    if (!record || !validRecord(record, record.ownerId)) return false;
    const current = readPendingQuickLogWatering(record.ownerId);
    if (current.status !== "pending" || !sameRecord(current.record, record)) return false;
    window.sessionStorage.removeItem(storageKey(record.ownerId));
    return window.sessionStorage.getItem(storageKey(record.ownerId)) === null;
  } catch {
    return false;
  }
}
