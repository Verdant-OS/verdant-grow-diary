import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const RULES = read("src/lib/ai/postGrowReflectionProviderCandidateEnvelope.ts");
const TESTS = read("src/test/post-grow-reflection-provider-candidate-envelope.test.ts");
const DOCS = read("docs/post-grow-reflection-phase2h.md");

describe("Post-Grow Reflection provider candidate envelope static safety", () => {
  it("does not add runtime calls, persistence, schema, or equipment surfaces", () => {
    const all = [RULES, DOCS].join("\n");

    expect(all).not.toMatch(/functions\.invoke|fetch\(|axios|XMLHttpRequest|EventSource|WebSocket/i);
    expect(all).not.toMatch(/create table|alter table|enable row level security/i);
    expect(all).not.toMatch(/from\("action_queue"\)|\.insert\(|\.update\(|\.delete\(/i);
    expect(all).not.toMatch(/target_device|raw_payload|service_role|bridge_token/i);
  });

  it("keeps the envelope contract pure and adapter-only", () => {
    expect(RULES).toContain("PostGrowReflectionAdapterCandidate");
    expect(RULES).toContain("normalizePostGrowReflectionProviderCandidateEnvelope");
    expect(RULES).not.toMatch(/useState|useEffect|localStorage|sessionStorage|document\.|window\./);
  });

  it("rejects private metadata keys in tests", () => {
    expect(TESTS).toContain("unsafe_metadata_key");
    expect(TESTS).toContain("do-not-store");
  });

  it("documents contract-only scope", () => {
    expect(DOCS).toMatch(/contract-only/i);
    expect(DOCS).toMatch(/no runtime call/i);
    expect(DOCS).toMatch(/not saved/i);
    expect(DOCS).toMatch(/no equipment control/i);
  });
});
