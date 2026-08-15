import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  DEFAULT_TOKEN_BUDGET,
  DEFAULT_WALL_CLOCK_MS,
  FIXED_CATALOG_MODEL_ID,
  MAX_RETRYABLE_ATTEMPTS,
  MAX_RUNS,
  PRE_RUN_SPEND_CONTROL,
} from "./constants.ts";
import { OrchestrationError, isRetryableError } from "./errors.ts";
import { hashDirectory } from "./hash.ts";
import {
  createSyntheticWorkspace,
  removeSyntheticWorkspace,
  type SyntheticWorkspace,
} from "./fixtureBuilder.ts";
import {
  createBoundedAgents,
  disposeAgents,
  inspectorPrompt,
  reviewerPrompt,
} from "./agentFactory.ts";
import { resolveLiveProofStatus } from "./liveProofStatus.ts";
import {
  detectInvalidPresentedAsHealthy,
  sanitizeInspectorOutput,
  sanitizeReviewerOutput,
} from "./outputSanitizer.ts";
import { policyHash, validatePolicy, type HostAgentPolicy } from "./policy.ts";
import { buildReceipt, type OrchestrationStatus, type ProofReceipt } from "./receipt.ts";
import {
  parseJsonObject,
  validateInspectorOutput,
  validateReviewerOutput,
  type InspectorOutput,
  type ReviewerOutput,
  type ToolCallRecord,
} from "./schemas.ts";
import type { AgentHandle, RunOutcome, SdkAdapter } from "./sdkAdapter.ts";

export type OrchestrationConfig = {
  adapter: SdkAdapter;
  repoRoot: string;
  wallClockMs?: number;
  tokenBudget?: number;
  liveProof?: boolean;
  workspace?: SyntheticWorkspace;
};

export type OrchestrationResult = {
  receipt: ProofReceipt;
  inspector?: InspectorOutput;
  reviewer?: ReviewerOutput;
  policy: HostAgentPolicy | null;
  workspace: SyntheticWorkspace;
};

function repositoryBaseCommit(repoRoot: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) return "UNKNOWN";
  return result.stdout.trim();
}

async function waitWithTimeout(
  run: { wait(): Promise<RunOutcome>; cancel(): Promise<void> },
  timeoutMs: number,
): Promise<RunOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run.wait(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new OrchestrationError("wall-clock timeout", { code: "TIMEOUT", retryable: false }));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    await run.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendBounded(
  agent: AgentHandle,
  prompt: string,
  timeoutMs: number,
): Promise<RunOutcome> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRYABLE_ATTEMPTS; attempt += 1) {
    try {
      const run = await agent.send(prompt);
      return await waitWithTimeout(run, timeoutMs);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error)) {
        if (error instanceof OrchestrationError) throw error;
        throw new OrchestrationError(error instanceof Error ? error.message : "send failed", {
          code: "NON_RETRYABLE",
          retryable: false,
        });
      }
      if (attempt >= MAX_RETRYABLE_ATTEMPTS) {
        throw new OrchestrationError(error instanceof Error ? error.message : "retry exhausted", {
          code: "RETRY_EXHAUSTED",
          retryable: false,
        });
      }
    }
  }
  throw lastError;
}

function hostAdjudicate(
  reviewer: ReviewerOutput | undefined,
  fixtureMutated: boolean,
): { verdict: OrchestrationStatus; notes: string[] } {
  const notes: string[] = [];
  if (fixtureMutated) {
    notes.push("immutable fixture hash changed");
    return { verdict: "REJECT", notes };
  }
  if (!reviewer) {
    return { verdict: "HOLD", notes };
  }
  notes.push("host normalized findings with stable ordering");
  return { verdict: "HOLD", notes };
}

export async function runOrchestration(config: OrchestrationConfig): Promise<OrchestrationResult> {
  const wallClockMs = config.wallClockMs ?? DEFAULT_WALL_CLOCK_MS;
  const tokenBudget = config.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const workspace = config.workspace ?? createSyntheticWorkspace();
  let agents: Partial<{ inspector: AgentHandle; reviewer: AgentHandle }> = {};
  let inspectorOutput: InspectorOutput | undefined;
  let reviewerOutput: ReviewerOutput | undefined;
  let inspectorOutcome: RunOutcome | undefined;
  let reviewerOutcome: RunOutcome | undefined;
  let inspectorStatus: ProofReceipt["inspectorStatus"] = "skipped";
  let reviewerStatus: ProofReceipt["reviewerStatus"] = "skipped";
  let hostVerdict: OrchestrationStatus = "HOLD";
  const notes = [`pre-run spend control: ${PRE_RUN_SPEND_CONTROL}`, `max runs: ${MAX_RUNS}`];
  const toolCalls: ToolCallRecord[] = [];
  let cleanupStatus: "PASS" | "FAIL" = "FAIL";
  let policy: HostAgentPolicy | undefined;
  let invalidPresentedAsHealthy = false;
  let afterHash = "missing";

  try {
    policy = validatePolicy({
      cwd: workspace.cwd,
      storeRoot: workspace.storeRoot,
      modelId: FIXED_CATALOG_MODEL_ID,
      repoRoot: config.repoRoot,
    });
    agents = await createBoundedAgents(config.adapter, policy);

    inspectorOutcome = await sendBounded(
      agents.inspector!,
      inspectorPrompt(workspace.explicitFiles),
      wallClockMs,
    );
    inspectorStatus = inspectorOutcome.status;
    toolCalls.push(...inspectorOutcome.toolCalls);
    if (inspectorOutcome.status !== "finished") {
      notes.push("inspector did not finish");
    } else {
      const rawInspector = validateInspectorOutput(parseJsonObject(inspectorOutcome.text));
      invalidPresentedAsHealthy = detectInvalidPresentedAsHealthy(rawInspector);
      inspectorOutput = sanitizeInspectorOutput(rawInspector);
      const inspectorTokens = inspectorOutcome.usage?.totalTokens;
      if (inspectorTokens !== undefined && inspectorTokens > tokenBudget) {
        reviewerStatus = "skipped";
        hostVerdict = "BUDGET_EXCEEDED";
        notes.push("inspector exceeded post-run token budget; reviewer not started");
      } else if (agents.reviewer) {
        reviewerOutcome = await sendBounded(
          agents.reviewer,
          reviewerPrompt(workspace.explicitFiles, JSON.stringify(inspectorOutput)),
          wallClockMs,
        );
        reviewerStatus = reviewerOutcome.status;
        toolCalls.push(...reviewerOutcome.toolCalls);
        if (reviewerOutcome.status === "finished") {
          reviewerOutput = sanitizeReviewerOutput(
            validateReviewerOutput(parseJsonObject(reviewerOutcome.text)),
          );
        }
      }
    }
  } catch (error) {
    if (error instanceof OrchestrationError && error.code === "TIMEOUT") {
      hostVerdict = "TIMEOUT";
      notes.push("timeout triggered cancellation and disposal");
    } else if (error instanceof OrchestrationError && error.code === "POLICY_REJECTED") {
      hostVerdict = "REJECT";
      notes.push(error.message);
    } else {
      notes.push(error instanceof Error ? error.message : "orchestration failed");
      if (inspectorStatus === "skipped") inspectorStatus = "error";
    }
  } finally {
    try {
      await disposeAgents(agents);
    } catch {
      notes.push("disposal error");
    }
    afterHash = existsSync(workspace.cwd) ? hashDirectory(workspace.cwd) : "missing";
    const fixtureMutated = afterHash !== workspace.fixtureHashBefore;
    if (inspectorOutput && hostVerdict !== "REJECT" && hostVerdict !== "TIMEOUT") {
      const judged = hostAdjudicate(reviewerOutput, fixtureMutated);
      hostVerdict = hostVerdict === "BUDGET_EXCEEDED" ? hostVerdict : judged.verdict;
      notes.push(...judged.notes);
    }
    if (invalidPresentedAsHealthy) {
      hostVerdict = "REJECT";
      notes.push("invalid telemetry presented as healthy");
    }
    try {
      removeSyntheticWorkspace(workspace);
      cleanupStatus =
        !existsSync(workspace.cwd) &&
        !existsSync(workspace.storeRoot) &&
        !existsSync(workspace.externalCanaryPath)
          ? "PASS"
          : "FAIL";
    } catch {
      cleanupStatus = "FAIL";
    }
    if (
      config.liveProof &&
      config.adapter.kind === "live" &&
      inspectorOutput &&
      reviewerOutput &&
      hostVerdict === "HOLD"
    ) {
      notes.push("live proof completed against synthetic fixtures only");
    }
    if (config.liveProof && config.adapter.kind !== "live") {
      notes.push("live proof requested but adapter is not live");
    }
    if (!config.liveProof) {
      notes.push("SDK LIVE PROOF: BLOCKED — CURSOR_API_KEY NOT PROVIDED");
    }
  }

  const receipt = buildReceipt({
    repositoryBaseCommit: repositoryBaseCommit(config.repoRoot),
    fixtureHashBefore: workspace.fixtureHashBefore,
    fixtureHashAfter: afterHash,
    policyHash: policy ? policyHash(policy) : "policy-not-validated",
    fixedModelId: FIXED_CATALOG_MODEL_ID,
    inspectorIds: {
      agent: inspectorOutcome?.hashedAgentId ?? "inspector-missing",
      run: inspectorOutcome?.hashedRunId ?? "inspector-run-missing",
      request: inspectorOutcome?.hashedRequestId ?? "inspector-request-missing",
    },
    reviewerIds: {
      agent: reviewerOutcome?.hashedAgentId ?? "reviewer-missing",
      run: reviewerOutcome?.hashedRunId ?? "reviewer-run-missing",
      request: reviewerOutcome?.hashedRequestId ?? "reviewer-request-missing",
    },
    inspectorStatus,
    reviewerStatus,
    hostVerdict,
    liveProofStatus: resolveLiveProofStatus({
      liveProofRequested: Boolean(config.liveProof),
      adapterKind: config.adapter.kind,
      hostVerdict,
      cleanupStatus,
      inspectorStatus,
      reviewerStatus,
    }),
    inspectorDurationMs: inspectorOutcome?.durationMs ?? null,
    reviewerDurationMs: reviewerOutcome?.durationMs ?? null,
    inspectorTokenTotal: inspectorOutcome?.usage?.totalTokens ?? null,
    reviewerTokenTotal: reviewerOutcome?.usage?.totalTokens ?? null,
    toolCalls,
    cleanupStatus,
    inspector: inspectorOutput,
    reviewer: reviewerOutput,
    invalidPresentedAsHealthy,
    notes,
  });
  return {
    receipt,
    inspector: inspectorOutput,
    reviewer: reviewerOutput,
    policy: policy ?? null,
    workspace,
  };
}
