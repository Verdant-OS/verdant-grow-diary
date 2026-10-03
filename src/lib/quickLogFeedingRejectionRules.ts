import type { WriteFeedingFailureReason } from "./writeFeedingTypedEvent";

const PRE_RPC_REJECTIONS = new Set<WriteFeedingFailureReason>([
  "idempotency_key:invalid",
  "grow_id:missing",
  "line_id:missing",
  "products:not_array",
  "products:empty",
  "products:too_many",
  "products:contains_secret",
  "volume_ml:invalid",
  "numeric:not_finite",
  "occurred_at:invalid",
]);

/** A later rejection cannot disprove a commit from an earlier ambiguous attempt. */
export function mayCorrectRejectedFeeding(input: {
  reason: WriteFeedingFailureReason;
  priorClaim: boolean | null | undefined;
}): boolean {
  return (
    input.priorClaim === false &&
    (input.reason === "rpc:invalid_typed_payload" || PRE_RPC_REJECTIONS.has(input.reason))
  );
}
