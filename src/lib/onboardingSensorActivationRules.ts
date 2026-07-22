/**
 * Pure sensor-evidence gate for onboarding activation.
 *
 * The onboarding checklist only needs a count, but the raw provenance must
 * remain available until diagnostic packets are classified. No raw payload,
 * reading value, device detail, or grow detail leaves this helper.
 */
import {
  isCanonicalSensorSource,
  type CanonicalSensorSource,
} from "@/constants/sensorIngestProvenance";
import { isDiagnosticSensorProvenanceRow } from "@/lib/sensorProvenanceFenceRules";

export interface OnboardingSensorActivationRow {
  source?: unknown;
  raw_payload?: unknown;
}

const ACTIVATING_SOURCES: ReadonlySet<CanonicalSensorSource> = new Set(["live", "manual", "csv"]);

/**
 * Count only source-labeled, non-diagnostic sensor evidence.
 *
 * Demo, stale, invalid, missing, and unknown sources fail closed. A physical
 * EcoWitt gateway row using the historical Windows listener vendor remains
 * eligible through the shared provenance fence's physical-proof exception.
 */
export function countActivatingSensorReadings(
  rows: readonly OnboardingSensorActivationRow[] | null | undefined,
): number {
  if (!Array.isArray(rows)) return 0;

  let count = 0;
  for (const row of rows) {
    const normalizedSource =
      typeof row.source === "string" ? row.source.trim().toLowerCase() : null;
    if (
      isDiagnosticSensorProvenanceRow({
        source: normalizedSource,
        raw_payload: row.raw_payload,
      })
    ) {
      continue;
    }
    if (isCanonicalSensorSource(normalizedSource) && ACTIVATING_SOURCES.has(normalizedSource)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Quick-log-carried manual snapshot evidence for the connected tent.
 *
 * A grower who records their room through Quick Log leaves one of two
 * persisted shapes instead of a `sensor_readings` row:
 *  - a `diary_entries` row whose details.manual_sensor_snapshot carries
 *    source "manual" and at least one finite reading (legacy plant Quick Log)
 *  - a manual, non-deleted `grow_events` row with event_type "environment"
 *    (quicklog_save_manual sensor values / environment checks)
 *
 * Both are additive evidence only — the sensor_readings path is never
 * weakened, and rows on a different (or missing) tent never count.
 */
export interface ManualSnapshotQuickLogDiaryRow {
  tent_id?: string | null;
  details?: unknown;
}

export interface ManualSnapshotQuickLogGrowEventRow {
  tent_id?: string | null;
  event_type?: string | null;
  source?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface ManualSnapshotQuickLogEvidenceInput {
  tentId?: string | null;
  diaryEntries?: ReadonlyArray<ManualSnapshotQuickLogDiaryRow | null | undefined> | null;
  growEvents?: ReadonlyArray<ManualSnapshotQuickLogGrowEventRow | null | undefined> | null;
}

const MANUAL_SNAPSHOT_METRIC_KEYS = ["temp_f", "humidity_percent", "ph", "ec"] as const;

function normalizedTentId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** True when details carry a manual snapshot with at least one real reading. */
function hasManualSnapshotDetails(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const snap = (details as { manual_sensor_snapshot?: unknown }).manual_sensor_snapshot;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return false;
  const record = snap as Record<string, unknown>;
  // Source-honest fence: never accept an unlabeled or re-labeled snapshot.
  if (record.source !== "manual") return false;
  return MANUAL_SNAPSHOT_METRIC_KEYS.some(
    (key) => typeof record[key] === "number" && Number.isFinite(record[key] as number),
  );
}

export function countManualSnapshotQuickLogEvidence(
  input: ManualSnapshotQuickLogEvidenceInput | null | undefined,
): number {
  const tentId = normalizedTentId(input?.tentId);
  if (tentId.length === 0) return 0;

  let count = 0;
  for (const row of input?.diaryEntries ?? []) {
    if (!row) continue;
    if (normalizedTentId(row.tent_id) !== tentId) continue;
    if (!hasManualSnapshotDetails(row.details)) continue;
    count += 1;
  }
  for (const row of input?.growEvents ?? []) {
    if (!row) continue;
    if (normalizedTentId(row.tent_id) !== tentId) continue;
    if ((typeof row.event_type === "string" ? row.event_type.trim() : "") !== "environment") {
      continue;
    }
    if ((typeof row.source === "string" ? row.source.trim().toLowerCase() : "") !== "manual") {
      continue;
    }
    if (row.is_deleted === true) continue;
    if (typeof row.deleted_at === "string" && row.deleted_at.trim().length > 0) continue;
    count += 1;
  }
  return count;
}
