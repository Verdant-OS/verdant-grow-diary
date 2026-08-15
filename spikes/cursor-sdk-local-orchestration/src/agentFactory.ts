import { ALLOWED_TOOLS, MAX_RUNS } from "./constants.ts";
import { OrchestrationError } from "./errors.ts";
import type { HostAgentPolicy } from "./policy.ts";
import type { AgentHandle, SdkAdapter } from "./sdkAdapter.ts";

export type CreatedAgents = {
  inspector: AgentHandle;
  reviewer: AgentHandle;
};

export async function createBoundedAgents(
  adapter: SdkAdapter,
  policy: HostAgentPolicy,
): Promise<CreatedAgents> {
  if (MAX_RUNS !== 2) {
    throw new OrchestrationError("baseline requires exactly two agent runs", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  if (policy.tools.join(",") !== ALLOWED_TOOLS.join(",")) {
    throw new OrchestrationError("factory refused a non-read-only toolset", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  const inspector = await adapter.createAgent(policy, "inspector");
  const reviewer = await adapter.createAgent(policy, "reviewer");
  if (inspector === reviewer) {
    throw new OrchestrationError("inspector and reviewer must be separate agents", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  return { inspector, reviewer };
}

export async function disposeAgents(agents: Partial<CreatedAgents>): Promise<void> {
  const errors: unknown[] = [];
  for (const handle of [agents.inspector, agents.reviewer]) {
    if (!handle) continue;
    try {
      await handle.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new OrchestrationError("agent disposal failed", {
      code: "CLEANUP_FAILED",
      retryable: false,
    });
  }
}

export function inspectorPrompt(files: readonly string[]): string {
  return [
    "SYNTHETIC FIXTURE REVIEW ONLY.",
    "Do not use shell, edit, write, delete, MCP, web tools, or subagents.",
    "Read only these explicitly named synthetic files:",
    ...files.map((name) => `- ${name}`),
    "Return JSON with schemaVersion 1.0.0, synthetic true, and findings array.",
    "Never classify invalid telemetry as healthy.",
    "Never repeat secret-shaped values.",
  ].join("\n");
}

export function reviewerPrompt(files: readonly string[], inspectorJson: string): string {
  return [
    "SYNTHETIC INDEPENDENT REVIEW ONLY.",
    "Read the same explicitly named synthetic files. Do not use shell, write, MCP, or subagents.",
    ...files.map((name) => `- ${name}`),
    "Evaluate these sanitized inspector findings:",
    inspectorJson,
    "Return JSON with schemaVersion 1.0.0, synthetic true, and adjudications.",
    "Verdicts: confirmed | rejected | needs_more_evidence | safety_concern.",
  ].join("\n");
}
