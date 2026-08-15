import type { SdkAdapter } from "./sdkAdapter.ts";

export type LiveProofStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT_RUN";

export type LiveProofStatusInput = {
  liveProofRequested: boolean;
  adapterKind: SdkAdapter["kind"];
  hostVerdict: "PASS" | "HOLD" | "REJECT" | "BLOCKED" | "TIMEOUT" | "BUDGET_EXCEEDED";
  cleanupStatus: "PASS" | "FAIL";
  inspectorStatus: string;
  reviewerStatus: string;
};

/**
 * `PASS` means an authorized live adapter finished both synthetic runs,
 * the host held, and cleanup succeeded. Requesting live mode is not enough.
 */
export function resolveLiveProofStatus(input: LiveProofStatusInput): LiveProofStatus {
  if (!input.liveProofRequested) return "BLOCKED";
  if (input.adapterKind !== "live") return "FAIL";
  if (
    input.hostVerdict === "HOLD" &&
    input.cleanupStatus === "PASS" &&
    input.inspectorStatus === "finished" &&
    input.reviewerStatus === "finished"
  ) {
    return "PASS";
  }
  return "FAIL";
}
