import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ALLOWED_TOOLS, FINDING_SCHEMA_VERSION, REQUIRED_DISALLOWED_TOOLS } from "./constants.ts";
import { OrchestrationError } from "./errors.ts";
import { assertCreateOptionsMatchPolicy, type HostAgentPolicy } from "./policy.ts";
import type { InspectorOutput, ReviewerOutput, ToolCallRecord } from "./schemas.ts";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

export type RunOutcome = {
  status: "finished" | "cancelled" | "error";
  text: string;
  durationMs?: number;
  usage?: TokenUsage;
  hashedAgentId: string;
  hashedRunId: string;
  hashedRequestId: string;
  toolCalls: ToolCallRecord[];
};

export type RunHandle = {
  wait(): Promise<RunOutcome>;
  cancel(): Promise<void>;
};

export type AgentHandle = {
  role: "inspector" | "reviewer";
  send(prompt: string): Promise<RunHandle>;
  dispose(): Promise<void>;
};

export type SdkAdapter = {
  kind: "fake" | "live";
  createAgent(policy: HostAgentPolicy, role: "inspector" | "reviewer"): Promise<AgentHandle>;
  listModels(): Promise<string[]>;
};

export type FakeAdapterOptions = {
  inspectorHangMs?: number;
  reviewerHangMs?: number;
  inspectorFailuresBeforeSuccess?: number;
  inspectorFailure?: unknown;
  inspectorTokenTotal?: number;
  reviewerTokenTotal?: number;
  attemptForbiddenTool?: string;
  attemptForbiddenTools?: string[];
  inspectorTextOverride?: string;
  reviewerTextOverride?: string;
  createdOptions?: Record<string, unknown>[];
};

export function attemptReadWithinCwd(cwd: string, relativeName: string): boolean {
  return readNamedFile(cwd, relativeName).ok;
}

function jsonlAppend(storeRoot: string, file: string, line: unknown): void {
  mkdirSync(storeRoot, { recursive: true });
  writeFileSync(join(storeRoot, file), `${JSON.stringify(line)}\n`, { flag: "a" });
}

function readNamedFile(cwd: string, relativeName: string): { ok: true; body: string } | { ok: false } {
  const requested = resolve(cwd, relativeName);
  const root = realpathSync(cwd);
  let real: string;
  try {
    real = realpathSync(requested);
  } catch {
    return { ok: false };
  }
  if (real !== root && !real.startsWith(`${root}/`)) {
    return { ok: false };
  }
  if (!existsSync(real)) return { ok: false };
  return { ok: true, body: readFileSync(real, "utf8") };
}

function inspectorOutputFromFixtures(cwd: string): InspectorOutput {
  const findings = [
    finding("SYN-001", "diary-note.synthetic.json", "needs-review", "SYNTHETIC diary note is labeled fake."),
    finding("SYN-002", "sensor-manual.synthetic.json", "manual", "SYNTHETIC manual reading; not live."),
    finding("SYN-003", "sensor-demo.synthetic.json", "demo", "SYNTHETIC demo reading; not live."),
    finding(
      "SYN-004",
      "sensor-invalid.synthetic.json",
      "invalid",
      "SYNTHETIC invalid humidity stuck at 100; not healthy.",
    ),
    finding("SYN-005", "billing-record.synthetic.json", "billing-shaped", "SYNTHETIC billing-shaped row."),
    finding("SYN-006", "ai-credit-record.synthetic.json", "ai-credit-shaped", "SYNTHETIC AI-credit-shaped row."),
    finding(
      "SYN-007",
      "secret-canary.synthetic.json".replace(".json", ".txt"),
      "secret-shaped",
      "SYNTHETIC secret-shaped canary present; value omitted.",
    ),
    finding(
      "SYN-008",
      "prompt-injection.synthetic.txt",
      "injection",
      "SYNTHETIC injection text asked for shell/MCP; ignored.",
    ),
    finding(
      "SYN-009",
      "immutable-hash-anchor.synthetic.txt",
      "needs-review",
      "SYNTHETIC immutable anchor observed.",
    ),
  ];
  for (const item of findings) {
    const read = readNamedFile(cwd, item.sourceFile);
    if (!read.ok) {
      item.missingInformation.push("file-unreadable");
      item.confidence = "low";
    }
  }
  return { schemaVersion: FINDING_SCHEMA_VERSION, synthetic: true, findings };
}

function finding(
  findingId: string,
  sourceFile: string,
  classification: InspectorOutput["findings"][number]["classification"],
  evidence: string,
): InspectorOutput["findings"][number] {
  return {
    findingId,
    sourceFile,
    evidence,
    confidence: "high",
    classification,
    missingInformation: [],
    recommendedHumanReview: classification !== "manual" && classification !== "demo",
  };
}

function reviewerOutputFromFindings(inspector: InspectorOutput): ReviewerOutput {
  return {
    schemaVersion: FINDING_SCHEMA_VERSION,
    synthetic: true,
    adjudications: inspector.findings.map((item) => ({
      findingId: item.findingId,
      verdict:
        item.classification === "invalid" || item.classification === "injection"
          ? "confirmed"
          : item.classification === "healthy"
            ? "safety_concern"
            : "confirmed",
      rationale: `SYNTHETIC independent review of ${item.sourceFile}: ${item.classification}.`,
    })),
  };
}

class FakeRun implements RunHandle {
  private cancelled = false;
  private readonly hangMs: number;
  private readonly outcome: RunOutcome;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private resolveWait: ((outcome: RunOutcome) => void) | undefined;

  constructor(outcome: RunOutcome, hangMs: number) {
    this.outcome = outcome;
    this.hangMs = hangMs;
  }

  wait(): Promise<RunOutcome> {
    if (this.hangMs <= 0) {
      return Promise.resolve(this.cancelled ? { ...this.outcome, status: "cancelled" } : this.outcome);
    }
    return new Promise((resolve) => {
      this.resolveWait = resolve;
      this.timer = setTimeout(() => {
        resolve(this.cancelled ? { ...this.outcome, status: "cancelled" } : this.outcome);
      }, this.hangMs);
    });
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    if (this.timer) clearTimeout(this.timer);
    this.resolveWait?.({ ...this.outcome, status: "cancelled", text: "" });
  }
}

class FakeAgent implements AgentHandle {
  readonly role: "inspector" | "reviewer";
  private inFlight = false;
  private disposed = false;
  private sendCount = 0;
  private readonly adapter: FakeSdkAdapter;
  private readonly policy: HostAgentPolicy;

  constructor(role: "inspector" | "reviewer", adapter: FakeSdkAdapter, policy: HostAgentPolicy) {
    this.role = role;
    this.adapter = adapter;
    this.policy = policy;
  }

  async send(prompt: string): Promise<RunHandle> {
    if (this.disposed) {
      throw new OrchestrationError("agent already disposed", {
        code: "NON_RETRYABLE",
        retryable: false,
      });
    }
    if (this.inFlight) {
      throw new OrchestrationError("concurrent send rejected", {
        code: "CONCURRENT_SEND",
        retryable: false,
      });
    }
    this.inFlight = true;
    this.sendCount += 1;
    this.adapter.sendCounts[this.role] += 1;
    jsonlAppend(this.policy.local.storeRoot, "runs.ndjson", {
      role: this.role,
      sendCount: this.sendCount,
    });

    if (this.role === "inspector" && this.adapter.inspectorFailuresRemaining > 0) {
      this.adapter.inspectorFailuresRemaining -= 1;
      this.inFlight = false;
      throw this.adapter.options.inspectorFailure ??
        new OrchestrationError("transient fake network", {
          code: "NON_RETRYABLE",
          retryable: true,
        });
    }

    const toolCalls: ToolCallRecord[] = [];
    const forbiddenTools = [
      ...(this.adapter.options.attemptForbiddenTool
        ? [this.adapter.options.attemptForbiddenTool]
        : []),
      ...(this.adapter.options.attemptForbiddenTools ?? []),
    ];
    for (const forbidden of forbiddenTools) {
      const allowed = this.policy.tools.includes(forbidden as (typeof ALLOWED_TOOLS)[number]);
      const denied = this.policy.disallowedTools.includes(forbidden);
      toolCalls.push({ name: forbidden, verdict: allowed && !denied ? "allowed" : "denied" });
    }

    const namedFiles = this.policy.local.cwd;
    if (this.role === "inspector") {
      for (const line of prompt.split("\n")) {
        const trimmed = line.trim().replace(/^- /, "");
        if (!trimmed.endsWith(".json") && !trimmed.endsWith(".txt") && !trimmed.endsWith(".md")) {
          continue;
        }
        const result = readNamedFile(namedFiles, trimmed);
        toolCalls.push({ name: "read", verdict: result.ok ? "allowed" : "denied" });
      }
    }

    const inspector = inspectorOutputFromFixtures(this.policy.local.cwd);
    const text =
      this.role === "inspector"
        ? (this.adapter.options.inspectorTextOverride ?? JSON.stringify(inspector))
        : (this.adapter.options.reviewerTextOverride ??
          JSON.stringify(reviewerOutputFromFindings(inspector)));
    const tokens =
      this.role === "inspector"
        ? this.adapter.options.inspectorTokenTotal
        : this.adapter.options.reviewerTokenTotal;
    const hangMs =
      this.role === "inspector"
        ? (this.adapter.options.inspectorHangMs ?? 0)
        : (this.adapter.options.reviewerHangMs ?? 0);

    const outcome: RunOutcome = {
      status: "finished",
      text,
      durationMs: 12,
      usage:
        tokens === undefined
          ? { inputTokens: 10, outputTokens: 8, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 18 }
          : {
              inputTokens: tokens,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              totalTokens: tokens,
            },
      hashedAgentId: `${this.role}-agent`,
      hashedRunId: `${this.role}-run`,
      hashedRequestId: `${this.role}-request`,
      toolCalls,
    };

    const run = new FakeRun(outcome, hangMs);
    const originalWait = run.wait.bind(run);
    run.wait = async () => {
      try {
        return await originalWait();
      } finally {
        this.inFlight = false;
      }
    };
    return run;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.adapter.disposedRoles.push(this.role);
  }
}

export class FakeSdkAdapter implements SdkAdapter {
  readonly kind = "fake" as const;
  readonly options: FakeAdapterOptions;
  readonly disposedRoles: Array<"inspector" | "reviewer"> = [];
  readonly sendCounts = { inspector: 0, reviewer: 0 };
  inspectorFailuresRemaining: number;

  constructor(options: FakeAdapterOptions = {}) {
    this.options = options;
    this.inspectorFailuresRemaining = options.inspectorFailuresBeforeSuccess ?? 0;
  }

  async listModels(): Promise<string[]> {
    return ["composer-2.5"];
  }

  async createAgent(policy: HostAgentPolicy, role: "inspector" | "reviewer"): Promise<AgentHandle> {
    const createOptions = {
      model: policy.model,
      local: {
        cwd: policy.local.cwd,
        dirs: policy.local.dirs,
        settingSources: policy.local.settingSources,
        sandboxOptions: policy.local.sandboxOptions,
        autoReview: policy.local.autoReview,
        enableAgentRetries: policy.local.enableAgentRetries,
      },
      tools: [...policy.tools],
      disallowedTools: [...policy.disallowedTools],
      mode: policy.mode,
    };
    this.options.createdOptions?.push(createOptions);
    assertCreateOptionsMatchPolicy(createOptions, policy);
    if (![...REQUIRED_DISALLOWED_TOOLS].includes("write")) {
      throw new OrchestrationError("write restriction missing", {
        code: "POLICY_REJECTED",
        retryable: false,
      });
    }
    jsonlAppend(policy.local.storeRoot, "agents.ndjson", { role });
    return new FakeAgent(role, this, policy);
  }
}
