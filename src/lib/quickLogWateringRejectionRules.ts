/**
 * A structured pre-write rejection is safe to correct only for a fresh local
 * claim. An older pending claim may represent an earlier RPC whose reply was
 * lost, so a later validation response cannot rule out that earlier commit.
 */
export function mayCorrectRejectedWatering(input: {
  reason: string | null | undefined;
  priorClaim: boolean | null | undefined;
}): boolean {
  return input.reason === "rpc:invalid_typed_payload" && input.priorClaim === false;
}
