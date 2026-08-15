import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createBoundedAgents } from "../src/agentFactory.ts";
import { FINDING_SCHEMA_VERSION, FIXED_CATALOG_MODEL_ID } from "../src/constants.ts";
import { OrchestrationError } from "../src/errors.ts";
import { createSyntheticWorkspace, removeSyntheticWorkspace } from "../src/fixtureBuilder.ts";
import { validatePolicy } from "../src/policy.ts";
import { runOrchestration } from "../src/runCoordinator.ts";
import { FakeSdkAdapter } from "../src/sdkAdapter.ts";

const REPO_ROOT = join(fileURLToPath(new URL("../..", import.meta.url)), "..");

describe("host orchestration pipeline", () => {
  it("runs inspector then independent reviewer and holds without a live SDK key", async () => {
    const adapter = new FakeSdkAdapter();
    const result = await runOrchestration({ adapter, repoRoot: REPO_ROOT });
    expect(result.receipt.liveProofStatus).toBe("BLOCKED");
    expect(result.receipt.hostVerdict).toBe("HOLD");
    expect(result.receipt.inspectorStatus).toBe("finished");
    expect(result.receipt.reviewerStatus).toBe("finished");
    expect(result.receipt.cleanupStatus).toBe("PASS");
    expect(result.inspector?.schemaVersion).toBe(FINDING_SCHEMA_VERSION);
    expect(result.reviewer?.schemaVersion).toBe(FINDING_SCHEMA_VERSION);
    expect(result.inspector?.findings.map((item) => item.findingId)).toEqual(
      [...(result.inspector?.findings ?? [])]
        .map((item) => item.findingId)
        .sort(),
    );
    expect(adapter.sendCounts).toEqual({ inspector: 1, reviewer: 1 });
    expect(adapter.disposedRoles.sort()).toEqual(["inspector", "reviewer"]);
  });

  it("never presents invalid telemetry as healthy", async () => {
    const adapter = new FakeSdkAdapter({
      inspectorTextOverride: JSON.stringify({
        schemaVersion: FINDING_SCHEMA_VERSION,
        synthetic: true,
        findings: [
          {
            findingId: "SYN-004",
            sourceFile: "sensor-invalid.synthetic.json",
            evidence: "SYNTHETIC inspector wrongly said healthy",
            confidence: "high",
            classification: "healthy",
            missingInformation: [],
            recommendedHumanReview: false,
          },
        ],
      }),
    });
    const result = await runOrchestration({ adapter, repoRoot: REPO_ROOT });
    const invalid = result.inspector?.findings.find((item) =>
      item.sourceFile.includes("invalid"),
    );
    expect(invalid?.classification).toBe("invalid");
    expect(result.receipt.invalidPresentedAsHealthy).toBe(true);
    expect(result.receipt.hostVerdict).toBe("REJECT");
  });

  it("records post-run duration and token counts when the adapter supplies them", async () => {
    const adapter = new FakeSdkAdapter({
      inspectorTokenTotal: 41,
      reviewerTokenTotal: 17,
    });
    const result = await runOrchestration({ adapter, repoRoot: REPO_ROOT });
    expect(result.receipt.inspectorDurationMs).toBe(12);
    expect(result.receipt.reviewerDurationMs).toBe(12);
    expect(result.receipt.inspectorTokenCounts).toEqual({ totalTokens: 41 });
    expect(result.receipt.reviewerTokenCounts).toEqual({ totalTokens: 17 });
    expect(result.receipt.preRunSpendControl).toBe("BLOCKED");
  });

  it("skips the reviewer when inspector tokens exceed the post-run budget", async () => {
    const adapter = new FakeSdkAdapter({ inspectorTokenTotal: 50_001 });
    const result = await runOrchestration({
      adapter,
      repoRoot: REPO_ROOT,
      tokenBudget: 50_000,
    });
    expect(result.receipt.hostVerdict).toBe("BUDGET_EXCEEDED");
    expect(result.receipt.reviewerStatus).toBe("skipped");
    expect(adapter.sendCounts.reviewer).toBe(0);
  });

  it("denies shell, edit, write, task, mcp, and webSearch capability attempts", async () => {
    const adapter = new FakeSdkAdapter({
      attemptForbiddenTools: ["shell", "edit", "write", "task", "mcp", "webSearch", "delete"],
    });
    const result = await runOrchestration({ adapter, repoRoot: REPO_ROOT });
    const denied = [...new Set(
      result.receipt.toolCalls.filter((call) => call.verdict === "denied").map((call) => call.name),
    )].sort();
    expect(denied).toEqual(
      ["delete", "edit", "mcp", "shell", "task", "webSearch", "write"].sort(),
    );
    expect(result.policy?.tools).toEqual(["read"]);
  });

  it("does not let prompt-injection text expand the tool policy", async () => {
    const createdOptions: Record<string, unknown>[] = [];
    const adapter = new FakeSdkAdapter({ createdOptions });
    const result = await runOrchestration({ adapter, repoRoot: REPO_ROOT });
    expect(result.policy?.tools).toEqual(["read"]);
    for (const options of createdOptions) {
      expect(options.tools).toEqual(["read"]);
      expect(options.mode).toBe("plan");
      expect("cloud" in options).toBe(false);
    }
    const injection = result.inspector?.findings.find((item) => item.classification === "injection");
    expect(injection).toBeTruthy();
  });

  it("retries a classified transient inspector error once, then succeeds", async () => {
    const adapter = new FakeSdkAdapter({
      inspectorFailuresBeforeSuccess: 1,
      inspectorFailure: { name: "NetworkError", isRetryable: true, message: "transient" },
    });
    const result = await runOrchestration({ adapter, repoRoot: REPO_ROOT });
    expect(result.receipt.inspectorStatus).toBe("finished");
    expect(adapter.sendCounts.inspector).toBe(2);
    expect(adapter.sendCounts.reviewer).toBe(1);
  });

  it("does not retry a non-retryable configuration error", async () => {
    const adapter = new FakeSdkAdapter({
      inspectorFailuresBeforeSuccess: 3,
      inspectorFailure: { name: "ConfigurationError", message: "bad tools" },
    });
    const result = await runOrchestration({ adapter, repoRoot: REPO_ROOT });
    expect(adapter.sendCounts.inspector).toBe(1);
    expect(adapter.sendCounts.reviewer).toBe(0);
    expect(result.receipt.notes.some((note) => /bad tools|send failed/.test(note))).toBe(true);
  });

  it("exhausts a strict retry limit on repeated retryable errors", async () => {
    const adapter = new FakeSdkAdapter({
      inspectorFailuresBeforeSuccess: 5,
      inspectorFailure: { name: "NetworkError", isRetryable: true, message: "still down" },
    });
    const result = await runOrchestration({ adapter, repoRoot: REPO_ROOT });
    expect(adapter.sendCounts.inspector).toBe(2);
    expect(result.receipt.notes.some((note) => /still down|retry exhausted/.test(note))).toBe(true);
  });

  it("rejects concurrent sends on the same agent", async () => {
    const workspace = createSyntheticWorkspace();
    const adapter = new FakeSdkAdapter({ inspectorHangMs: 200 });
    try {
      const policy = validatePolicy({
        cwd: workspace.cwd,
        storeRoot: workspace.storeRoot,
        modelId: FIXED_CATALOG_MODEL_ID,
        repoRoot: REPO_ROOT,
      });
      const agents = await createBoundedAgents(adapter, policy);
      const first = await agents.inspector.send("SYNTHETIC hang");
      await expect(agents.inspector.send("SYNTHETIC second")).rejects.toBeInstanceOf(
        OrchestrationError,
      );
      await first.cancel();
      await agents.inspector.dispose();
      await agents.reviewer.dispose();
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });

  it("does not treat a fake-adapter liveProof flag as a live PASS", async () => {
    const result = await runOrchestration({
      adapter: new FakeSdkAdapter(),
      repoRoot: REPO_ROOT,
      liveProof: true,
    });
    expect(result.receipt.liveProofStatus).toBe("FAIL");
    expect(result.receipt.hostVerdict).toBe("HOLD");
    expect(result.receipt.notes.some((note) => note.includes("adapter is not live"))).toBe(true);
  });

  it("keeps inspector and reviewer as separate agent instances", async () => {
    const workspace = createSyntheticWorkspace();
    const adapter = new FakeSdkAdapter();
    try {
      const policy = validatePolicy({
        cwd: workspace.cwd,
        storeRoot: workspace.storeRoot,
        modelId: FIXED_CATALOG_MODEL_ID,
        repoRoot: REPO_ROOT,
      });
      const agents = await createBoundedAgents(adapter, policy);
      expect(agents.inspector).not.toBe(agents.reviewer);
      expect(agents.inspector.role).toBe("inspector");
      expect(agents.reviewer.role).toBe("reviewer");
      await agents.inspector.dispose();
      await agents.reviewer.dispose();
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });
});
