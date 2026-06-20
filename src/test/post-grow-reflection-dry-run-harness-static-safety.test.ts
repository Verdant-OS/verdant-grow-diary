import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const HARNESS = read("src/lib/ai/postGrowReflectionDryRunHarness.ts");
const TESTS = read("src/test/post-grow-reflection-dry-run-harness.test.ts");
const DOCS = read("docs/post-grow-reflection-phase2d.md");

describe("Post-Grow Reflection dry-run harness static safety", () => {
  it("does not add runtime provider, persistence, schema, or device-control surfaces", () => {
    const all = [HARNESS, TESTS, DOCS].join("\n");

    expect(all).not.toMatch(/supabase|functions\.invoke|openai|anthropic|gemini/i);
    expect(all).not.toMatch(/create table|alter table|enable row level security|policy/i);
    expect(all).not.toMatch(/from\("action_queue"\)|insert\(|update\(|delete\(/i);
    expect(all).not.toMatch(/target_device|raw_payload|service_role|bridge_token/i);
  });

  it("stays fixture-only and adapter-only", () => {
    expect(HARNESS).toContain("dry_run_fixture");
    expect(HARNESS).toContain("adaptPostGrowReflectionCandidate");
    expect(HARNESS).toContain("buildPostGrowReflectionDryRunScenarios");
    expect(HARNESS).not.toMatch(/fetch\(|axios|XMLHttpRequest|EventSource|WebSocket/i);
  });
});
