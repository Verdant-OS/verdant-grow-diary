import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const TYPES = read("src/lib/ai/postGrowReflectionTypes.ts");
const PROMPT = read("src/lib/ai/postGrowReflectionPrompt.ts");
const FIXTURES = read("src/lib/ai/postGrowReflectionFixtures.ts");
const DOCS = read("docs/post-grow-reflection-phase2.md");

describe("Post-Grow Reflection contract static safety", () => {
  it("does not add runtime AI, Edge, Supabase, schema, or Action Queue write surfaces", () => {
    const all = [TYPES, PROMPT, FIXTURES, DOCS].join("\n");

    expect(all).not.toMatch(/supabase|functions\.invoke|openai|anthropic|gemini|edge function/i);
    expect(all).not.toMatch(/create table|alter table|enable row level security|policy/i);
    expect(all).not.toMatch(/from\("action_queue"\)|insert\(|update\(|delete\(/i);
    expect(all).not.toMatch(/target_device|raw_payload|service_role|bridge_token/i);
  });

  it("keeps automation and equipment-control language explicitly forbidden", () => {
    const prompt = buildPromptSourceOnly();

    expect(prompt).toContain("Do not suggest device control");
    expect(prompt).toContain("automated equipment execution");
    expect(prompt).not.toMatch(/auto execute|autopilot enabled|dispatchCommand|relay\.|actuator/i);
  });
});

function buildPromptSourceOnly(): string {
  return PROMPT;
}
