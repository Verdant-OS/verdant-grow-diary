import {
  encodeManualCorrectionHash,
  type ManualCorrectionContext,
} from "@/lib/manualSensorCorrectionContext";
import type { CorrectionJournalRead } from "@/lib/manualSensorCorrectionPendingStore";
import { parseManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationParser";
import type { ManualReadingMetric } from "@/lib/sensorReadingManualEntryRules";

export type PendingCorrectionRecovery =
  { status: "none" | "blocked" | "unavailable" } | { status: "available"; href: string };

/** Offer navigation only; never replace another form or authorize a write. */
export function getPendingCorrectionRecovery(
  pending: CorrectionJournalRead,
  ownedTentIds: readonly string[] | null | undefined,
  current: ManualCorrectionContext | null | undefined,
): PendingCorrectionRecovery {
  if (pending.status === "empty") return { status: "none" };
  if (pending.status === "blocked") return { status: "blocked" };
  const restored = restoreManualCorrectionDraft(pending.operation, ownedTentIds);
  if (!restored) return { status: "unavailable" };
  const hash = encodeManualCorrectionHash(restored.correction);
  if (current && encodeManualCorrectionHash(current) === hash) return { status: "none" };
  return {
    status: "available",
    href: `/sensors?tentId=${encodeURIComponent(restored.correction.tentId)}${hash}`,
  };
}

/** Restore form intent only. The RPC must still authorize the owner and original rows. */
export function restoreManualCorrectionDraft(
  value: unknown,
  ownedTentIds: readonly string[] | null | undefined,
): {
  operationId: string;
  correction: ManualCorrectionContext;
  metrics: ManualReadingMetric[];
} | null {
  const operation = parseManualCorrectionOperation(value);
  if (!operation || !ownedTentIds?.includes(operation.tentId)) return null;
  const correction: ManualCorrectionContext = {
    tentId: operation.tentId,
    originalCapturedAt: operation.observedAt,
    originalReadingIds: {},
    originalValues: {},
  };
  const metrics = new Map<ManualReadingMetric["metric"], number>();
  for (const original of operation.originals) {
    correction.originalReadingIds[original.metric] = original.readingId;
    correction.originalValues[original.metric] = original.value;
    metrics.set(original.metric, original.value);
  }
  for (const change of operation.changes) metrics.set(change.metric, change.value);
  return {
    operationId: operation.operationId,
    correction,
    metrics: [...metrics]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([metric, value]) => ({ metric, value })),
  };
}
