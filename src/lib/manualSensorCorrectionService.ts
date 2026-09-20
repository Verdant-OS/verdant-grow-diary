import type { ManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationRules";
import { confirmManualCorrectionReceipt } from "@/lib/manualSensorCorrectionReceiptRules";
import { parseManualCorrectionOperation } from "@/lib/manualSensorCorrectionOperationParser";
import { createManualCorrectionJournal } from "@/lib/manualSensorCorrectionPendingStore";

export async function submitPendingManualCorrection(
  ownerId: string,
  operation: unknown,
  client: ManualCorrectionRpcClient,
  journal = createManualCorrectionJournal(),
): Promise<
  | { status: "blocked" }
  | { status: "pending" | "unconfirmed"; operation: ManualCorrectionOperation }
  | { status: "confirmed"; cleanup: "complete" | "pending" }
> {
  const claim = journal.claim(ownerId, operation);
  if (claim.status !== "claimed") return claim;
  const result = await saveManualSensorCorrection(claim.operation, client);
  if (result.status !== "confirmed") return { status: "unconfirmed", operation: claim.operation };
  return {
    status: "confirmed",
    cleanup: journal.clear(ownerId, claim.operation) ? "complete" : "pending",
  };
}

export interface ManualCorrectionRpcClient {
  rpc(
    name: "save_manual_sensor_correction",
    args: { p_request: ManualCorrectionOperation },
  ): PromiseLike<{ data: unknown; error: unknown }>;
}
function copyOperation(operation: ManualCorrectionOperation): ManualCorrectionOperation {
  return {
    version: operation.version,
    operationId: operation.operationId,
    tentId: operation.tentId,
    observedAt: operation.observedAt,
    source: operation.source,
    originals: operation.originals.map(({ metric, readingId, value }) => ({
      metric,
      readingId,
      value,
    })),
    changes: operation.changes.map(({ metric, originalReadingId, expectedValue, value }) => ({
      metric,
      originalReadingId,
      expectedValue,
      value,
    })),
  };
}

/** One explicit attempt. The caller retains its pending operation until confirmed. */
export async function saveManualSensorCorrection(
  operation: ManualCorrectionOperation | null | undefined,
  client: ManualCorrectionRpcClient,
): Promise<{ status: "confirmed" | "unconfirmed" }> {
  if (!operation) return { status: "unconfirmed" };
  try {
    // Preserve the confirmation target independently of form and transport objects.
    const expected = parseManualCorrectionOperation(operation);
    if (!expected) return { status: "unconfirmed" };
    const { data, error } = await client.rpc("save_manual_sensor_correction", {
      p_request: copyOperation(expected),
    });
    return {
      status:
        error === null && confirmManualCorrectionReceipt(data, expected)
          ? "confirmed"
          : "unconfirmed",
    };
  } catch {
    // A rejected response does not prove the transaction failed to commit.
    return { status: "unconfirmed" };
  }
}
