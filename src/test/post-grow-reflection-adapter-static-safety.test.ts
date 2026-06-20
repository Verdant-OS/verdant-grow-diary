import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const ADAPTER = read("src/lib/ai/postGrowReflectionAdapter.ts");
const TESTS = read("src/test/post-grow-reflection-adapter.test.ts");
const DOCS = read("docs/post-grow-reflection-phase2c.md");

describe("Post-Grow Reflection adapter boundary static safety", () => {
  it("does not add runtime provider, persistence, schema, or device-control surfaces", () => {
    const all = [ADAPTER, TESTS, DOCS].join("\n");

    expect(all).not.toMatch(/supabase|functions\.invoke|openai|anthropic|gemini/i);
    expect(all).not.toMatch(/create table|alter table|enable row level security|policy/i);
    expect(all).not.toMatch(/from\("action_queue"\)|insert\(|update\(|delete\(/i);
    expect(all).not.toMatch(/target_device|raw_payload|service_role|bridge_token/i);
  });

  it("keeps the boundary dry-run by requiring supplied candidates", () => {
    expect(ADAPTER).toContain("adaptPostGrowReflectionCandidate");
    expect(ADAPTER).toContain("rawOutput: unknown");
    expect(ADAPTER).toContain("validatePostGrowReflectionOutput");
    expect(ADAPTER).not.toMatch(/fetch\(|axios|XMLHttpRequest|EventSource|WebSocket/i);
  });
});
