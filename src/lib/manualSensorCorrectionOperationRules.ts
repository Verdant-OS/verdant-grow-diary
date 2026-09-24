import {
  MANUAL_CORRECTION_METRICS,
  type ManualCorrectionContext,
  type ManualCorrectionMetric,
} from "@/lib/manualSensorCorrectionContext";
import type { ManualReadingMetric } from "@/lib/sensorReadingManualEntryRules";
import { isUuid } from "@/lib/isUuid";
import { buildManualSensorSnapshotEditDiff } from "@/lib/manualSensorSnapshotEditRules";

export interface ManualCorrectionChange {
  readonly metric: ManualCorrectionMetric;
  readonly originalReadingId: string | null;
  readonly expectedValue: number | null;
  readonly value: number;
}

export interface ManualCorrectionOperation {
  readonly version: 1;
  readonly operationId: string;
  readonly tentId: string;
  readonly observedAt: string;
  readonly source: "manual";
  readonly originals: readonly {
    readonly metric: ManualCorrectionMetric;
    readonly readingId: string;
    readonly value: number;
  }[];
  readonly changes: readonly ManualCorrectionChange[];
}

export type ManualCorrectionOperationResult =
  | { ok: true; operation: ManualCorrectionOperation }
  | {
      ok: false;
      reason:
        | "invalid_identity"
        | "invalid_observation"
        | "invalid_originals"
        | "invalid_metrics"
        | "no_changes";
    };

/**
 * Client-side correction intent, not an insert payload or authorization receipt.
 * A transactional writer must re-read the original rows under the signed-in owner,
 * verify scope/time/source/expected values, and atomically save changes + history.
 * The caller supplies and persists operationId once; retries reuse this entire value.
 * No current clock, replacement timestamps, inferred reading IDs or user_id.
 */
export function buildManualCorrectionOperation(
  input:
    | {
        operationId: string;
        correction: ManualCorrectionContext;
        metrics: readonly ManualReadingMetric[];
      }
    | null
    | undefined,
): ManualCorrectionOperationResult {
  if (!input || !isUuid(input.operationId) || !isUuid(input.correction?.tentId)) {
    return { ok: false, reason: "invalid_identity" };
  }
  const context = input.correction;
  if (!isObservationTimestamp(context.originalCapturedAt)) {
    return { ok: false, reason: "invalid_observation" };
  }
  const ids = context.originalReadingIds;
  const values = context.originalValues;
  if (!ids || !values || typeof ids !== "object" || typeof values !== "object") {
    return { ok: false, reason: "invalid_originals" };
  }
  const originals: { metric: ManualCorrectionMetric; readingId: string; value: number }[] = [];
  const seenIds = new Set<string>();
  const orderedMetrics = [...MANUAL_CORRECTION_METRICS].sort();
  for (const metric of orderedMetrics) {
    const id = ids[metric];
    const value = values[metric];
    if (id === undefined && value === undefined) continue;
    if (
      !isUuid(id) ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      seenIds.has(id.toLowerCase())
    ) {
      return { ok: false, reason: "invalid_originals" };
    }
    seenIds.add(id.toLowerCase());
    originals.push({ metric, readingId: id.toLowerCase(), value });
  }
  if (originals.length === 0) return { ok: false, reason: "invalid_originals" };
  if (!Array.isArray(input.metrics)) return { ok: false, reason: "invalid_metrics" };
  const submitted = new Map<ManualCorrectionMetric, number>();
  for (const row of input.metrics) {
    if (
      !row ||
      !MANUAL_CORRECTION_METRICS.includes(row.metric) ||
      submitted.has(row.metric) ||
      typeof row.value !== "number" ||
      !Number.isFinite(row.value) ||
      row.derived === true
    ) {
      return { ok: false, reason: "invalid_metrics" };
    }
    submitted.set(row.metric, row.value);
  }
  const changes: ManualCorrectionChange[] = [];
  for (const metric of orderedMetrics) {
    const value = submitted.get(metric);
    if (value === undefined) continue;
    const original = originals.find((row) => row.metric === metric);
    const diff = buildManualSensorSnapshotEditDiff({
      original: { source: "manual", ...(original ? { [metric]: original.value } : {}) },
      replacement: { source: "manual", [metric]: value },
    });
    if (!diff.ok) continue;
    changes.push({
      metric,
      originalReadingId: original?.readingId ?? null,
      expectedValue: original?.value ?? null,
      value,
    });
  }
  if (changes.length === 0) return { ok: false, reason: "no_changes" };
  return {
    ok: true,
    operation: {
      version: 1,
      operationId: input.operationId.toLowerCase(),
      tentId: context.tentId.toLowerCase(),
      observedAt: context.originalCapturedAt,
      source: "manual",
      originals,
      changes,
    },
  };
}

export function isObservationTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Keep the original precision. Date.toISOString() would lose PostgreSQL microseconds.
  const match =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const day = new Date(match[1] + "T00:00:00Z");
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === match[1];
}
