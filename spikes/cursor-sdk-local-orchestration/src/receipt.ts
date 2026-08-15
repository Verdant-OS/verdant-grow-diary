import { FORBIDDEN_RECEIPT_FIELD_NAMES, RECEIPT_SCHEMA_VERSION } from "./constants.ts";
import { sha256Short } from "./hash.ts";
import type { LiveProofStatus } from "./liveProofStatus.ts";
import { containsSecretShaped } from "./outputSanitizer.ts";
import type { InspectorOutput, ReviewerOutput, ToolCallRecord } from "./schemas.ts";

export type OrchestrationStatus =
  | "PASS"
  | "HOLD"
  | "REJECT"
  | "BLOCKED"
  | "TIMEOUT"
  | "BUDGET_EXCEEDED";

export type ProofReceipt = {
  schemaVersion: string;
  syntheticDataDeclaration: string;
  repositoryBaseCommit: string;
  fixtureHashBefore: string;
  fixtureHashAfter: string;
  policyHash: string;
  fixedModelId: string;
  hashedInspectorAgentId: string;
  hashedReviewerAgentId: string;
  hashedInspectorRunId: string;
  hashedReviewerRunId: string;
  hashedInspectorRequestId: string;
  hashedReviewerRequestId: string;
  inspectorStatus: OrchestrationStatus | "finished" | "cancelled" | "error" | "skipped";
  reviewerStatus: OrchestrationStatus | "finished" | "cancelled" | "error" | "skipped";
  hostVerdict: OrchestrationStatus;
  liveProofStatus: LiveProofStatus;
  inspectorDurationMs: number | null;
  reviewerDurationMs: number | null;
  inspectorTokenCounts: { totalTokens: number } | null;
  reviewerTokenCounts: { totalTokens: number } | null;
  toolCalls: ToolCallRecord[];
  cleanupStatus: "PASS" | "FAIL";
  preRunSpendControl: "BLOCKED";
  findingCount: number;
  invalidPresentedAsHealthy: boolean;
  notes: string[];
};

export function buildReceipt(input: {
  repositoryBaseCommit: string;
  fixtureHashBefore: string;
  fixtureHashAfter: string;
  policyHash: string;
  fixedModelId: string;
  inspectorIds: { agent: string; run: string; request: string };
  reviewerIds: { agent: string; run: string; request: string };
  inspectorStatus: ProofReceipt["inspectorStatus"];
  reviewerStatus: ProofReceipt["reviewerStatus"];
  hostVerdict: OrchestrationStatus;
  liveProofStatus: ProofReceipt["liveProofStatus"];
  inspectorDurationMs: number | null;
  reviewerDurationMs: number | null;
  inspectorTokenTotal: number | null;
  reviewerTokenTotal: number | null;
  toolCalls: ToolCallRecord[];
  cleanupStatus: "PASS" | "FAIL";
  inspector?: InspectorOutput;
  reviewer?: ReviewerOutput;
  invalidPresentedAsHealthy: boolean;
  notes: string[];
}): ProofReceipt {
  const receipt: ProofReceipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    syntheticDataDeclaration:
      "All fixtures and prompts in this spike are synthetic. No grower, billing, sensor, credential, or production source data was sent to any model.",
    repositoryBaseCommit: input.repositoryBaseCommit,
    fixtureHashBefore: input.fixtureHashBefore,
    fixtureHashAfter: input.fixtureHashAfter,
    policyHash: input.policyHash,
    fixedModelId: input.fixedModelId,
    hashedInspectorAgentId: sha256Short(input.inspectorIds.agent),
    hashedReviewerAgentId: sha256Short(input.reviewerIds.agent),
    hashedInspectorRunId: sha256Short(input.inspectorIds.run),
    hashedReviewerRunId: sha256Short(input.reviewerIds.run),
    hashedInspectorRequestId: sha256Short(input.inspectorIds.request),
    hashedReviewerRequestId: sha256Short(input.reviewerIds.request),
    inspectorStatus: input.inspectorStatus,
    reviewerStatus: input.reviewerStatus,
    hostVerdict: input.hostVerdict,
    liveProofStatus: input.liveProofStatus,
    inspectorDurationMs: input.inspectorDurationMs,
    reviewerDurationMs: input.reviewerDurationMs,
    inspectorTokenCounts:
      input.inspectorTokenTotal === null ? null : { totalTokens: input.inspectorTokenTotal },
    reviewerTokenCounts:
      input.reviewerTokenTotal === null ? null : { totalTokens: input.reviewerTokenTotal },
    toolCalls: [...input.toolCalls].sort((a, b) => a.name.localeCompare(b.name)),
    cleanupStatus: input.cleanupStatus,
    preRunSpendControl: "BLOCKED",
    findingCount: input.inspector?.findings.length ?? 0,
    invalidPresentedAsHealthy: input.invalidPresentedAsHealthy,
    notes: [...input.notes].sort(),
  };
  assertReceiptSafe(receipt);
  return receipt;
}

export function assertReceiptSafe(receipt: ProofReceipt): void {
  const keys = collectKeys(receipt);
  for (const forbidden of FORBIDDEN_RECEIPT_FIELD_NAMES) {
    if (keys.includes(forbidden)) {
      throw new Error(`receipt contains forbidden field ${forbidden}`);
    }
  }
  if (containsSecretShaped(receipt)) {
    throw new Error("receipt contains secret-shaped content");
  }
}

function collectKeys(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      acc.push(key);
      collectKeys(nested, acc);
    }
  }
  return acc;
}
