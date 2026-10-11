import {
  isObservationTimestamp,
  type ManualCorrectionOperation,
} from "@/lib/manualSensorCorrectionOperationRules";
import { isUuid } from "@/lib/isUuid";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Traverse only the bounded expected operation; JSONB key ordering is immaterial. */
function matches(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((value, i) => matches(value, actual[i]))
    );
  }
  if (record(expected)) {
    return (
      record(actual) &&
      Object.keys(expected).length === Object.keys(actual).length &&
      Object.keys(expected).every(
        (key) => Object.hasOwn(actual, key) && matches(expected[key], actual[key]),
      )
    );
  }
  return expected === actual;
}

/** A transport success or matching row count is insufficient confirmation. */
export function confirmManualCorrectionReceipt(
  value: unknown,
  operation: ManualCorrectionOperation | null | undefined,
): boolean {
  if (
    !operation ||
    !record(value) ||
    Object.keys(value).length !== 7 ||
    value.operationId !== operation.operationId ||
    value.observedAt !== operation.observedAt ||
    !isObservationTimestamp(value.changedAt) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) <= 0 ||
    typeof value.reused !== "boolean" ||
    !matches(operation, value.request) ||
    !Array.isArray(value.changes) ||
    value.changes.length !== operation.changes.length
  )
    return false;

  const originals = new Set(operation.originals.map((row) => row.readingId));
  const resolvedIds = new Set<string>();
  return operation.changes.every((change, index) => {
    const resolved: unknown = (value.changes as unknown[])[index];
    if (!record(resolved) || !isUuid(resolved.readingId)) return false;
    const readingId = resolved.readingId;
    if (readingId !== readingId.toLowerCase()) return false;
    if (resolvedIds.has(readingId)) return false;
    resolvedIds.add(readingId);
    const added = change.originalReadingId === null;
    if (added && originals.has(readingId)) return false;
    return matches(
      {
        metric: change.metric,
        readingId: change.originalReadingId ?? readingId,
        previousValue: change.expectedValue,
        value: change.value,
        added,
      },
      resolved,
    );
  });
}
