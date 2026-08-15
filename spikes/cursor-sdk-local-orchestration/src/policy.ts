import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  ALLOWED_TOOLS,
  FIXED_CATALOG_MODEL_ID,
  FORBIDDEN_MODEL_IDS,
  REQUIRED_DISALLOWED_TOOLS,
  SYNTHETIC_MARKER_FILENAME,
} from "./constants.ts";
import { OrchestrationError } from "./errors.ts";
import { canonicalJson, sha256Hex } from "./hash.ts";

export type HostAgentPolicy = {
  model: { id: string };
  local: {
    cwd: string;
    dirs: [];
    settingSources: [];
    sandboxOptions: { enabled: true };
    autoReview: false;
    enableAgentRetries: false;
    storeRoot: string;
  };
  tools: typeof ALLOWED_TOOLS;
  disallowedTools: string[];
  mode: "plan";
};

export type PolicyInput = {
  cwd: string;
  storeRoot: string;
  modelId?: string;
  repoRoot: string;
  extra?: Record<string, unknown>;
};

const PRODUCTION_SEGMENTS = Object.freeze(["src", "scripts", "supabase", "e2e"]);

export function isProductionPath(candidate: string, repoRoot: string): boolean {
  let resolvedCandidate: string;
  let resolvedRoot: string;
  try {
    resolvedCandidate = realpathSync(resolve(candidate));
    resolvedRoot = realpathSync(resolve(repoRoot));
  } catch {
    resolvedCandidate = resolve(candidate);
    resolvedRoot = resolve(repoRoot);
  }
  if (resolvedCandidate === resolvedRoot) return true;
  const prefix = resolvedRoot.endsWith("/") ? resolvedRoot : `${resolvedRoot}/`;
  if (!resolvedCandidate.startsWith(prefix)) return false;
  const rel = resolvedCandidate.slice(prefix.length);
  return PRODUCTION_SEGMENTS.some(
    (segment) => rel === segment || rel.startsWith(`${segment}/`),
  );
}

export function assertTemporarySyntheticCwd(cwd: string, repoRoot: string): void {
  let resolvedCwd: string;
  try {
    resolvedCwd = realpathSync(resolve(cwd));
  } catch {
    throw new OrchestrationError(`cwd does not exist: ${cwd}`, {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  const tmpRoot = realpathSync(tmpdir());
  if (resolvedCwd === tmpRoot || !resolvedCwd.startsWith(`${tmpRoot}/`)) {
    throw new OrchestrationError("cwd must be an OS temporary directory", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  if (isProductionPath(resolvedCwd, repoRoot)) {
    throw new OrchestrationError("production path is not a permitted cwd", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  try {
    realpathSync(resolve(resolvedCwd, SYNTHETIC_MARKER_FILENAME));
  } catch {
    throw new OrchestrationError("cwd is missing the synthetic fixture marker", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
}

export function validatePolicy(input: PolicyInput): HostAgentPolicy {
  if (input.extra && ("cloud" in input.extra || input.extra.cloud)) {
    throw new OrchestrationError("cloud configuration is rejected before Agent.create()", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  if (input.extra?.mcpServers || input.extra?.agents || input.extra?.customTools || input.extra?.hooks) {
    throw new OrchestrationError("MCP, custom tools, hooks, and subagent maps are forbidden", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  if (input.extra?.workOnCurrentBranch || input.extra?.autoCreatePR) {
    throw new OrchestrationError("production checkout and auto-PR options are forbidden", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  const modelId = input.modelId ?? "";
  if (!modelId) {
    throw new OrchestrationError("missing fixed-model selection", {
      code: "MISSING_MODEL",
      retryable: false,
    });
  }
  if (FORBIDDEN_MODEL_IDS.includes(modelId)) {
    throw new OrchestrationError("Router / auto-smart model selection is forbidden", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  if (modelId !== FIXED_CATALOG_MODEL_ID) {
    throw new OrchestrationError("model id is not the pinned catalog model", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }

  assertTemporarySyntheticCwd(input.cwd, input.repoRoot);
  if (isProductionPath(input.storeRoot, input.repoRoot)) {
    throw new OrchestrationError("store root must not be a production path", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  let resolvedStore: string;
  try {
    resolvedStore = realpathSync(resolve(input.storeRoot));
  } catch {
    throw new OrchestrationError("store root does not exist", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  const tmpRoot = realpathSync(tmpdir());
  if (!resolvedStore.startsWith(`${tmpRoot}/`)) {
    throw new OrchestrationError("store root must be an OS temporary directory", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }

  const dirs = input.extra?.dirs;
  if (dirs !== undefined && (!Array.isArray(dirs) || dirs.length !== 0)) {
    throw new OrchestrationError("local.dirs must be an empty array", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }

  return {
    model: { id: FIXED_CATALOG_MODEL_ID },
    local: {
      cwd: resolve(input.cwd),
      dirs: [],
      settingSources: [],
      sandboxOptions: { enabled: true },
      autoReview: false,
      enableAgentRetries: false,
      storeRoot: resolvedStore,
    },
    tools: ALLOWED_TOOLS,
    disallowedTools: [...REQUIRED_DISALLOWED_TOOLS],
    mode: "plan",
  };
}

export function policyHash(policy: HostAgentPolicy): string {
  return sha256Hex(
    canonicalJson({
      model: policy.model,
      dirs: policy.local.dirs,
      settingSources: policy.local.settingSources,
      sandboxOptions: policy.local.sandboxOptions,
      autoReview: policy.local.autoReview,
      enableAgentRetries: policy.local.enableAgentRetries,
      tools: policy.tools,
      disallowedTools: policy.disallowedTools,
      mode: policy.mode,
    }),
  );
}

export function assertCreateOptionsMatchPolicy(
  options: Record<string, unknown>,
  policy: HostAgentPolicy,
): void {
  if ("cloud" in options) {
    throw new OrchestrationError("cloud key present on create options", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  if (options.mode !== "plan") {
    throw new OrchestrationError("mode must be plan", { code: "POLICY_REJECTED", retryable: false });
  }
  const tools = options.tools;
  if (!Array.isArray(tools) || tools.join(",") !== policy.tools.join(",")) {
    throw new OrchestrationError("tools allowlist mismatch", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
  const disallowed = options.disallowedTools;
  if (!Array.isArray(disallowed) || !policy.disallowedTools.every((name) => disallowed.includes(name))) {
    throw new OrchestrationError("disallowedTools mismatch", {
      code: "POLICY_REJECTED",
      retryable: false,
    });
  }
}
