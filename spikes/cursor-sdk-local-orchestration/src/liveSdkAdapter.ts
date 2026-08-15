import { Agent, Cursor, JsonlLocalAgentStore } from "@cursor/sdk";
import type { Run, SDKAgent, SDKMessage } from "@cursor/sdk";

import { FIXED_CATALOG_MODEL_ID } from "./constants.ts";
import { OrchestrationError } from "./errors.ts";
import { assertCreateOptionsMatchPolicy, type HostAgentPolicy } from "./policy.ts";
import type { AgentHandle, RunHandle, RunOutcome, SdkAdapter, TokenUsage } from "./sdkAdapter.ts";
import type { ToolCallRecord } from "./schemas.ts";

function readLiveApiKey(): string {
  const key = process.env.CURSOR_API_KEY;
  if (!key) {
    throw new OrchestrationError("CURSOR_API_KEY is not provided", {
      code: "MISSING_API_KEY",
      retryable: false,
    });
  }
  return key;
}

function mapUsage(usage: TokenUsage | undefined): TokenUsage | undefined {
  if (!usage || typeof usage.totalTokens !== "number") return undefined;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    totalTokens: usage.totalTokens,
  };
}

function toolNameFromEvent(event: SDKMessage): string | undefined {
  if (event.type === "tool_call" && typeof event.name === "string") return event.name;
  return undefined;
}

async function collectToolCalls(run: Run, collected: ToolCallRecord[]): Promise<void> {
  try {
    for await (const event of run.stream()) {
      const name = toolNameFromEvent(event);
      if (!name) continue;
      collected.push({ name, verdict: name === "read" ? "allowed" : "denied" });
    }
  } catch {
    // Stream may close when wait() finishes.
  }
}

class LiveRunHandle implements RunHandle {
  private readonly run: Run;
  private readonly agentId: string;
  constructor(run: Run, agentId: string) {
    this.run = run;
    this.agentId = agentId;
  }

  async wait(): Promise<RunOutcome> {
    const toolCalls: ToolCallRecord[] = [];
    const streaming = collectToolCalls(this.run, toolCalls);
    const result = await this.run.wait();
    await Promise.race([streaming, new Promise((resolve) => setTimeout(resolve, 500))]);
    return {
      status:
        result.status === "finished" || result.status === "cancelled" || result.status === "error"
          ? result.status
          : "error",
      text: result.result ?? "",
      durationMs: result.durationMs,
      usage: mapUsage(result.usage),
      hashedAgentId: this.agentId,
      hashedRunId: result.id,
      hashedRequestId: result.requestId ?? result.id,
      toolCalls,
    };
  }

  async cancel(): Promise<void> {
    await this.run.cancel();
  }
}

class LiveAgentHandle implements AgentHandle {
  readonly role: "inspector" | "reviewer";
  private inFlight = false;
  private readonly agent: SDKAgent;
  constructor(agent: SDKAgent, role: "inspector" | "reviewer") {
    this.agent = agent;
    this.role = role;
  }

  async send(prompt: string): Promise<RunHandle> {
    if (this.inFlight) {
      throw new OrchestrationError("concurrent send rejected", {
        code: "CONCURRENT_SEND",
        retryable: false,
      });
    }
    this.inFlight = true;
    try {
      const run = await this.agent.send(prompt, { mode: "plan" });
      const handle = new LiveRunHandle(run, this.agent.agentId);
      const originalWait = handle.wait.bind(handle);
      handle.wait = async () => {
        try {
          return await originalWait();
        } finally {
          this.inFlight = false;
        }
      };
      return handle;
    } catch (error) {
      this.inFlight = false;
      throw error;
    }
  }

  async dispose(): Promise<void> {
    await this.agent[Symbol.asyncDispose]();
  }
}

export class LiveSdkAdapter implements SdkAdapter {
  readonly kind = "live" as const;

  async listModels(): Promise<string[]> {
    const models = await Cursor.models.list({ apiKey: readLiveApiKey() });
    return models.map((model) => model.id);
  }

  async createAgent(policy: HostAgentPolicy, role: "inspector" | "reviewer"): Promise<AgentHandle> {
    if (policy.model.id !== FIXED_CATALOG_MODEL_ID) {
      throw new OrchestrationError("live adapter refuses a non-fixed model", {
        code: "POLICY_REJECTED",
        retryable: false,
      });
    }
    const apiKey = readLiveApiKey();
    const store = new JsonlLocalAgentStore(policy.local.storeRoot);
    const createOptions = {
      apiKey,
      model: { id: policy.model.id },
      local: {
        cwd: policy.local.cwd,
        dirs: [...policy.local.dirs],
        settingSources: [...policy.local.settingSources],
        sandboxOptions: { ...policy.local.sandboxOptions },
        autoReview: policy.local.autoReview,
        enableAgentRetries: policy.local.enableAgentRetries,
        store,
      },
      tools: [...policy.tools],
      disallowedTools: [...policy.disallowedTools],
      mode: "plan" as const,
      name: `synthetic-${role}`,
    };
    const publicOptions = { ...createOptions, apiKey: undefined };
    assertCreateOptionsMatchPolicy(publicOptions, policy);
    const agent = await Agent.create(createOptions);
    return new LiveAgentHandle(agent, role);
  }
}

export async function confirmFixedModelAvailable(adapter: LiveSdkAdapter): Promise<void> {
  const ids = await adapter.listModels();
  if (!ids.includes(FIXED_CATALOG_MODEL_ID)) {
    throw new OrchestrationError(
      `fixed model ${FIXED_CATALOG_MODEL_ID} is not in Cursor.models.list()`,
      { code: "MISSING_MODEL", retryable: false },
    );
  }
}
