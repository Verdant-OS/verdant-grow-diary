import {
  buildManualCorrectionOperation,
  type ManualCorrectionOperation,
} from "@/lib/manualSensorCorrectionOperationRules";
import {
  MANUAL_CORRECTION_METRICS,
  type ManualCorrectionMetric,
} from "@/lib/manualSensorCorrectionContext";

function hasKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function metric(value: unknown): value is ManualCorrectionMetric {
  return typeof value === "string" && MANUAL_CORRECTION_METRICS.some((m) => m === value);
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
/** Untrusted storage must reproduce canonical intent, never repair or invent it. */
export function parseManualCorrectionOperation(value: unknown): ManualCorrectionOperation | null {
  if (
    !hasKeys(value, [
      "version",
      "operationId",
      "tentId",
      "observedAt",
      "source",
      "originals",
      "changes",
    ]) ||
    value.version !== 1 ||
    value.source !== "manual" ||
    typeof value.operationId !== "string" ||
    typeof value.tentId !== "string" ||
    typeof value.observedAt !== "string" ||
    !Array.isArray(value.originals) ||
    !Array.isArray(value.changes) ||
    value.originals.length < 1 ||
    value.originals.length > 6 ||
    value.changes.length < 1 ||
    value.changes.length > 6
  )
    return null;
  const ids: Partial<Record<ManualCorrectionMetric, string>> = {};
  const values: Partial<Record<ManualCorrectionMetric, number>> = {};
  for (const row of value.originals) {
    if (
      !hasKeys(row, ["metric", "readingId", "value"]) ||
      !metric(row.metric) ||
      typeof row.readingId !== "string" ||
      !finite(row.value) ||
      ids[row.metric] !== undefined
    )
      return null;
    ids[row.metric] = row.readingId;
    values[row.metric] = row.value;
  }
  const metrics: { metric: ManualCorrectionMetric; value: number }[] = [];
  for (const row of value.changes) {
    if (
      !hasKeys(row, ["metric", "originalReadingId", "expectedValue", "value"]) ||
      !metric(row.metric) ||
      !finite(row.value) ||
      !(row.originalReadingId === null || typeof row.originalReadingId === "string") ||
      !(row.expectedValue === null || finite(row.expectedValue))
    )
      return null;
    metrics.push({ metric: row.metric, value: row.value });
  }
  const built = buildManualCorrectionOperation({
    operationId: value.operationId,
    correction: {
      tentId: value.tentId,
      originalCapturedAt: value.observedAt,
      originalReadingIds: ids,
      originalValues: values,
    },
    metrics,
  });
  if (!built.ok) return null;
  const op = built.operation;
  if (
    op.operationId !== value.operationId ||
    op.tentId !== value.tentId ||
    op.originals.length !== value.originals.length ||
    op.changes.length !== value.changes.length
  )
    return null;
  const originals = value.originals;
  const changes = value.changes;
  if (
    !op.originals.every(
      (row, i) =>
        row.metric === originals[i].metric &&
        row.readingId === originals[i].readingId &&
        row.value === originals[i].value,
    ) ||
    !op.changes.every(
      (row, i) =>
        row.metric === changes[i].metric &&
        row.originalReadingId === changes[i].originalReadingId &&
        row.expectedValue === changes[i].expectedValue &&
        row.value === changes[i].value,
    )
  )
    return null;
  return op;
}
