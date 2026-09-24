import { isUuid } from "./isUuid";
import { validateManualEntry, type ManualEntryInput } from "./sensorReadingManualEntryRules";
import { isCanonicalManualSensorPayload } from "./manualSensorProvenanceRules";
import { normalizeManualSourceNote } from "./manualSensorSourceLabel";
import {
  createManualDraftValues,
  type ManualDraftValues,
  type ManualSnapshotPayloads,
} from "./sensorsPageSessionRules";

export interface PendingManualSnapshot {
  version: 1;
  ownerId: string;
  payloads: ManualSnapshotPayloads;
}

export const MANUAL_RECOVERY_STORAGE_ERROR =
  "Manual snapshot recovery storage is unavailable or cannot be read safely. No new snapshot was sent. Restore storage access, then retry recovery.";
export const MANUAL_RECOVERY_PREVIOUS_PENDING =
  "An earlier manual snapshot is still unconfirmed. Restore that snapshot and retry it before saving another.";
export const MANUAL_RECOVERY_CLEAR_ERROR =
  "Your manual snapshot is saved, but recovery cleanup could not finish. Retry recovery before saving another.";

type ReadResult =
  | { status: "empty" }
  | { status: "blocked" }
  | { status: "pending"; record: PendingManualSnapshot };
const key = (ownerId: string) => `verdant:sensors:pending-manual:v1:${ownerId}`;
const owner = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.trim() === value;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Reflect.ownKeys(value).length === Object.keys(value).length &&
  Object.keys(value).every((name) => allowed.includes(name));

const fields = {
  temperature_c: "airTemp",
  humidity_pct: "humidityPct",
  vpd_kpa: "vpdKpa",
  co2_ppm: "co2Ppm",
  soil_moisture_pct: "soilMoisturePct",
  ppfd: "ppfd",
} as const;

function formFor(payloads: ManualSnapshotPayloads): ManualEntryInput {
  const form: ManualEntryInput = {
    airTemp: "",
    airTempUnit: "C",
    humidityPct: "",
    vpdKpa: "",
    co2Ppm: "",
    soilMoisturePct: "",
    ppfd: "",
  };
  for (const row of payloads) form[fields[row.metric]] = String(row.value);
  return form;
}

function valid(value: unknown, ownerId: string): value is PendingManualSnapshot {
  if (
    !owner(ownerId) ||
    !object(value) ||
    !exactKeys(value, ["version", "ownerId", "payloads"]) ||
    value.version !== 1 ||
    value.ownerId !== ownerId ||
    !Array.isArray(value.payloads) ||
    !value.payloads.length ||
    value.payloads.length > 6
  )
    return false;
  const rows = value.payloads;
  const first = rows[0];
  if (
    !object(first) ||
    !isUuid(first.tent_id) ||
    typeof first.captured_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(first.captured_at) ||
    !Number.isFinite(Date.parse(first.captured_at)) ||
    new Date(first.captured_at).toISOString() !== first.captured_at
  )
    return false;
  const device = first.device_id;
  const note = typeof device === "string" && device.startsWith("manual:") ? device.slice(7) : null;
  if (device !== undefined && (!note || normalizeManualSourceNote(note) !== note)) return false;
  if (
    !rows.every(
      (row) =>
        object(row) &&
        exactKeys(row, [
          "tent_id",
          "metric",
          "value",
          "source",
          "ts",
          "captured_at",
          "quality",
          "raw_payload",
          "device_id",
        ]) &&
        row.tent_id === first.tent_id &&
        row.source === "manual" &&
        row.quality === "ok" &&
        row.ts === first.captured_at &&
        row.captured_at === first.captured_at &&
        row.device_id === device &&
        typeof row.metric === "string" &&
        Object.hasOwn(fields, row.metric) &&
        typeof row.value === "number" &&
        Number.isFinite(row.value),
    )
  )
    return false;
  if (new Set(rows.map((row) => row.metric)).size !== rows.length) return false;
  const payloads = rows as ManualSnapshotPayloads;
  const validation = validateManualEntry(formFor(payloads));
  if (
    !validation.ok ||
    validation.metrics.length !== rows.length ||
    !payloads.every((row) =>
      validation.metrics.some(
        (metric) => metric.metric === row.metric && metric.value === row.value,
      ),
    )
  )
    return false;
  // Rebuild the permitted provenance projection; never replay arbitrary JSON,
  // client-trusted ownership, alternate sources, or unvalidated stored metadata.
  return payloads.every((row) => isCanonicalManualSensorPayload(row.raw_payload));
}

export function restoreManualSnapshotValues(record: PendingManualSnapshot): ManualDraftValues {
  const device = record.payloads[0].device_id;
  return {
    ...createManualDraftValues(formFor(record.payloads), "C"),
    hasEditedReading: true,
    devicePreset: device ? "custom" : "none",
    deviceCustom: device?.slice(7) ?? "",
    pendingStandardSnapshot: { revision: 0, payloads: record.payloads },
    saveUnconfirmed: true,
  };
}

export function readPendingManualSnapshot(ownerId: string): ReadResult {
  if (!owner(ownerId)) return { status: "blocked" };
  try {
    const raw = window.sessionStorage.getItem(key(ownerId));
    if (raw === null) return { status: "empty" };
    const record: unknown = JSON.parse(raw);
    return valid(record, ownerId) ? { status: "pending", record } : { status: "blocked" };
  } catch {
    return { status: "blocked" };
  }
}

export function claimPendingManualSnapshot(
  record: PendingManualSnapshot,
): { status: "claimed"; record: PendingManualSnapshot } | Exclude<ReadResult, { status: "empty" }> {
  try {
    if (!valid(record, record.ownerId)) return { status: "blocked" };
    const current = readPendingManualSnapshot(record.ownerId);
    if (current.status === "blocked") return current;
    if (current.status === "pending")
      return JSON.stringify(current.record) === JSON.stringify(record)
        ? { status: "claimed", record: current.record }
        : current;
    const raw = JSON.stringify(record);
    window.sessionStorage.setItem(key(record.ownerId), raw);
    if (window.sessionStorage.getItem(key(record.ownerId)) !== raw) return { status: "blocked" };
    return { status: "claimed", record: JSON.parse(raw) as PendingManualSnapshot };
  } catch {
    return { status: "blocked" };
  }
}

export function clearPendingManualSnapshot(record: PendingManualSnapshot): boolean {
  try {
    if (!valid(record, record.ownerId)) return false;
    const current = readPendingManualSnapshot(record.ownerId);
    if (current.status !== "pending" || JSON.stringify(current.record) !== JSON.stringify(record))
      return false;
    window.sessionStorage.removeItem(key(record.ownerId));
    return window.sessionStorage.getItem(key(record.ownerId)) === null;
  } catch {
    return false;
  }
}
