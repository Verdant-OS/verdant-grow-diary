import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { FORBIDDEN_RECEIPT_FIELD_NAMES, RECEIPT_SCHEMA_VERSION } from "../src/constants.ts";
import { sha256Short } from "../src/hash.ts";
import { assertReceiptSafe, buildReceipt } from "../src/receipt.ts";
import { runOrchestration } from "../src/runCoordinator.ts";
import { FakeSdkAdapter } from "../src/sdkAdapter.ts";

const REPO_ROOT = join(fileURLToPath(new URL("../..", import.meta.url)), "..");

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

describe("sanitized proof receipt", () => {
  it("hashes identifiers and omits forbidden field names", () => {
    const receipt = buildReceipt({
      repositoryBaseCommit: "abc123",
      fixtureHashBefore: "before",
      fixtureHashAfter: "before",
      policyHash: "policy",
      fixedModelId: "composer-2.5",
      inspectorIds: { agent: "raw-agent-uuid", run: "raw-run-uuid", request: "raw-request-uuid" },
      reviewerIds: { agent: "raw-reviewer", run: "raw-reviewer-run", request: "raw-reviewer-req" },
      inspectorStatus: "finished",
      reviewerStatus: "finished",
      hostVerdict: "HOLD",
      liveProofStatus: "BLOCKED",
      inspectorDurationMs: 12,
      reviewerDurationMs: 9,
      inspectorTokenTotal: 18,
      reviewerTokenTotal: 11,
      toolCalls: [{ name: "read", verdict: "allowed" }],
      cleanupStatus: "PASS",
      notes: ["pre-run spend control: BLOCKED"],
    });
    expect(receipt.schemaVersion).toBe(RECEIPT_SCHEMA_VERSION);
    expect(receipt.hashedInspectorAgentId).toBe(sha256Short("raw-agent-uuid"));
    expect(receipt.hashedInspectorAgentId).not.toBe("raw-agent-uuid");
    expect(receipt.preRunSpendControl).toBe("BLOCKED");
    expect(receipt.syntheticDataDeclaration.toLowerCase()).toContain("synthetic");
    const keys = collectKeys(receipt);
    for (const forbidden of FORBIDDEN_RECEIPT_FIELD_NAMES) {
      expect(keys).not.toContain(forbidden);
    }
    expect(() => assertReceiptSafe(receipt)).not.toThrow();
  });

  it("rejects a receipt that embeds secret-shaped content", () => {
    expect(() =>
      buildReceipt({
        repositoryBaseCommit: "abc123",
        fixtureHashBefore: "before",
        fixtureHashAfter: "before",
        policyHash: "policy",
        fixedModelId: "composer-2.5",
        inspectorIds: { agent: "a", run: "b", request: "c" },
        reviewerIds: { agent: "d", run: "e", request: "f" },
        inspectorStatus: "finished",
        reviewerStatus: "skipped",
        hostVerdict: "HOLD",
        liveProofStatus: "BLOCKED",
        inspectorDurationMs: null,
        reviewerDurationMs: null,
        inspectorTokenTotal: null,
        reviewerTokenTotal: null,
        toolCalls: [],
        cleanupStatus: "PASS",
        notes: ["SYNTHETIC_SECRET_CANARY=sk_test_FAKE_NOT_A_REAL_KEY_verdant_spike_only"],
      }),
    ).toThrow(/secret-shaped/);
  });

  it("keeps orchestration receipts free of secret-shaped fixture bytes", async () => {
    const result = await runOrchestration({
      adapter: new FakeSdkAdapter(),
      repoRoot: REPO_ROOT,
    });
    const serialized = JSON.stringify(result.receipt);
    expect(serialized).not.toContain("sk_test_");
    expect(serialized).not.toContain("SYNTHETIC_SECRET_CANARY=");
    expect(serialized).not.toMatch(/CURSOR_API_KEY\s*=/);
    expect(result.receipt.liveProofStatus).toBe("BLOCKED");
    expect(result.receipt.notes.some((note) => note.includes("CURSOR_API_KEY NOT PROVIDED"))).toBe(
      true,
    );
  });
});
