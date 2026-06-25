import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const VALIDATOR = read("src/lib/ai/postGrowReflectionOutputValidator.ts");
const FIXTURES = read("src/lib/ai/postGrowReflectionOutputFixtures.ts");
const DOCS = read("docs/post-grow-reflection-phase2b.md");

describe("Post-Grow Reflection output validator static safety", () => {
  it("does not add runtime provider, persistence, schema, or device-control surfaces", () => {
    const all = [VALIDATOR, FIXTURES, DOCS].join("\n");

    expect(all).not.toMatch(/supabase|functions\.invoke|openai|anthropic|gemini/i);
    expect(all).not.toMatch(/create table|alter table|enable row level security|policy/i);
    expect(all).not.toMatch(/from\("action_queue"\)|insert\(|update\(|delete\(/i);
    expect(all).not.toMatch(/target_device|raw_payload|service_role|bridge_token/i);
  });

  it("keeps unsafe equipment-control terms as blocked-pattern fixtures only", () => {
    expect(VALIDATOR).toContain("UNSAFE_LANGUAGE_PATTERNS");
    expect(FIXTURES).toContain("createUnsafeAutomationPostGrowReflectionOutput");
    expect(DOCS).toContain("rejection-only fixtures");
  });
});
