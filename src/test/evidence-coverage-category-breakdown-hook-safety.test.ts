import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const HOOK = "src/hooks/useEvidenceCoverage.ts";

describe("useEvidenceCoverage — category-breakdown hook safety", () => {
  const src = readFileSync(HOOK, "utf8");
  // Strip block comments and line comments so the safety-note JSDoc that
  // intentionally names forbidden fields does not trip the scanner.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("selects only safe non-sensitive fields plus originating_timeline_events", () => {
    // Allowed select clauses
    expect(src).toMatch(/\.from\("alerts"\)[\s\S]*\.select\("id,metric,originating_timeline_events"\)/);
    expect(src).toMatch(
      /\.from\("action_queue"\)[\s\S]*\.select\("id,action_type,originating_timeline_events"\)/,
    );
  });

  it("never selects sensitive payload, prompt, completion, model_output, tokens, or debug JSON", () => {
    for (const banned of [
      "raw_payload",
      "prompt",
      "completion",
      "model_output",
      "service_role",
      "bridge_token",
      "api_token",
      "api_key",
      "access_token",
      "refresh_token",
      "debug_json",
      "provider_payload",
    ]) {
      expect(src.toLowerCase(), `banned column reference: ${banned}`).not.toContain(banned);
    }
  });

  it("does not perform writes, RPCs, or edge function invocations", () => {
    for (const pat of [
      /\.insert\(/,
      /\.update\(/,
      /\.delete\(/,
      /\.upsert\(/,
      /\.rpc\(/,
      /functions\.invoke\(/,
    ]) {
      expect(pat.test(src), `forbidden pattern: ${pat}`).toBe(false);
    }
  });
});
