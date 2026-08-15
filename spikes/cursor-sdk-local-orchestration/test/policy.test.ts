import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CANDIDATE_DISALLOWED_TOOLS,
  CURATED_TOOL_NAMES,
  FIXED_CATALOG_MODEL_ID,
  REQUIRED_DISALLOWED_TOOLS,
  SDK_PACKAGE,
  SDK_PINNED_VERSION,
} from "../src/constants.ts";
import { OrchestrationError } from "../src/errors.ts";
import { createSyntheticWorkspace, removeSyntheticWorkspace } from "../src/fixtureBuilder.ts";
import { validatePolicy } from "../src/policy.ts";
import { resolvedVitestEnvironment } from "./resolvedConfig.ts";

const SPIKE_ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const REPO_ROOT = join(SPIKE_ROOT, "..", "..");

describe("SDK tool catalog inspection", () => {
  it("matches the installed ToolName union literals", () => {
    const optionsDts = readFileSync(
      join(SPIKE_ROOT, "node_modules/@cursor/sdk/dist/cjs/options.d.ts"),
      "utf8",
    );
    const match = optionsDts.match(/export type ToolName = ([^;]+);/);
    expect(match?.[1]).toBeTypeOf("string");
    for (const name of CURATED_TOOL_NAMES) {
      expect(match?.[1]).toContain(`"${name}"`);
    }
    expect(match?.[1]).not.toContain('"write"');
  });

  it("keeps the candidate write restriction by naming write plus curated mutators", () => {
    expect(CANDIDATE_DISALLOWED_TOOLS).toContain("write");
    expect(REQUIRED_DISALLOWED_TOOLS).toContain("write");
    expect(REQUIRED_DISALLOWED_TOOLS).toContain("edit");
    expect(REQUIRED_DISALLOWED_TOOLS).toContain("delete");
    expect(REQUIRED_DISALLOWED_TOOLS).toContain("applyAgentDiff");
    expect(REQUIRED_DISALLOWED_TOOLS).toContain("shell");
    expect(REQUIRED_DISALLOWED_TOOLS).toContain("task");
    expect(REQUIRED_DISALLOWED_TOOLS).toContain("mcp");
    expect(REQUIRED_DISALLOWED_TOOLS).toContain("webSearch");
    expect(REQUIRED_DISALLOWED_TOOLS).toContain("webFetch");
  });

  it("pins the inspected SDK version", () => {
    const manifest = JSON.parse(readFileSync(join(SPIKE_ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies[SDK_PACKAGE]).toBe(SDK_PINNED_VERSION);
  });
});

describe("fail-closed policy validator", () => {
  it("rejects cloud configuration before create", () => {
    const workspace = createSyntheticWorkspace();
    try {
      expect(() =>
        validatePolicy({
          cwd: workspace.cwd,
          storeRoot: workspace.storeRoot,
          modelId: FIXED_CATALOG_MODEL_ID,
          repoRoot: REPO_ROOT,
          extra: { cloud: { repos: [] } },
        }),
      ).toThrow(OrchestrationError);
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });

  it("rejects missing fixed-model selection", () => {
    const workspace = createSyntheticWorkspace();
    try {
      expect(() =>
        validatePolicy({
          cwd: workspace.cwd,
          storeRoot: workspace.storeRoot,
          repoRoot: REPO_ROOT,
        }),
      ).toThrow(/missing fixed-model/);
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });

  it("rejects Router / auto-smart", () => {
    const workspace = createSyntheticWorkspace();
    try {
      expect(() =>
        validatePolicy({
          cwd: workspace.cwd,
          storeRoot: workspace.storeRoot,
          modelId: "auto-smart",
          repoRoot: REPO_ROOT,
        }),
      ).toThrow(/auto-smart/);
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });

  it("rejects a production repository path as cwd", () => {
    const workspace = createSyntheticWorkspace();
    try {
      expect(() =>
        validatePolicy({
          cwd: REPO_ROOT,
          storeRoot: workspace.storeRoot,
          modelId: FIXED_CATALOG_MODEL_ID,
          repoRoot: REPO_ROOT,
        }),
      ).toThrow(OrchestrationError);
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });

  it("rejects src/ as cwd", () => {
    const workspace = createSyntheticWorkspace();
    try {
      expect(() =>
        validatePolicy({
          cwd: join(REPO_ROOT, "src"),
          storeRoot: workspace.storeRoot,
          modelId: FIXED_CATALOG_MODEL_ID,
          repoRoot: REPO_ROOT,
        }),
      ).toThrow(OrchestrationError);
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });

  it("accepts a synthetic temporary workspace", () => {
    const workspace = createSyntheticWorkspace();
    try {
      const policy = validatePolicy({
        cwd: workspace.cwd,
        storeRoot: workspace.storeRoot,
        modelId: FIXED_CATALOG_MODEL_ID,
        repoRoot: REPO_ROOT,
      });
      expect(policy.tools).toEqual(["read"]);
      expect(policy.mode).toBe("plan");
      expect(policy.local.dirs).toEqual([]);
      expect(policy.local.settingSources).toEqual([]);
      expect(policy.local.sandboxOptions).toEqual({ enabled: true });
      expect(policy.local.autoReview).toBe(false);
      expect(policy.local.enableAgentRetries).toBe(false);
      expect(policy.disallowedTools).toEqual([...REQUIRED_DISALLOWED_TOOLS]);
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });

  it("uses the resolved vitest node environment", async () => {
    expect(await resolvedVitestEnvironment()).toBe("node");
  });

  it("rejects MCP, custom tools, hooks, and non-empty dirs", () => {
    const workspace = createSyntheticWorkspace();
    try {
      expect(() =>
        validatePolicy({
          cwd: workspace.cwd,
          storeRoot: workspace.storeRoot,
          modelId: FIXED_CATALOG_MODEL_ID,
          repoRoot: REPO_ROOT,
          extra: { mcpServers: { x: {} } },
        }),
      ).toThrow(/MCP/);
      expect(() =>
        validatePolicy({
          cwd: workspace.cwd,
          storeRoot: workspace.storeRoot,
          modelId: FIXED_CATALOG_MODEL_ID,
          repoRoot: REPO_ROOT,
          extra: { dirs: ["/tmp/other"] },
        }),
      ).toThrow(/dirs/);
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });
});
