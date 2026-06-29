import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const FILES = [
  "src/lib/evidenceCoverageViewModel.ts",
  "src/hooks/useEvidenceCoverage.ts",
  "src/components/EvidenceCoveragePanel.tsx",
];

// Words that must never appear in source for this surface.
const HARD_BANNED = [
  "raw_payload",
  "service_role",
  "bridge_token",
  "api_token",
  "access_token",
  "refresh_token",
  "model_output",
  "fake live",
  "fake-live",
  "auto execute",
  "auto-execute",
  "automatically executed",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "guaranteed",
  "definitely",
  "diagnosed from photo",
];

// Single-word degraded tokens that must never appear adjacent to "healthy".
const DEGRADED = /\b(invalid|stale|demo|csv|unknown|untrusted)\b/i;

// Write/RPC patterns to forbid in view model + presenter; the hook is the only
// allowed Supabase reader and must be SELECT-only.
const WRITE_PATTERNS = [
  /\.insert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.upsert\(/,
  /\.rpc\(/,
  /functions\.invoke\(/,
];

describe("evidence-coverage static safety", () => {
  for (const file of FILES) {
    it(`${file} contains no banned phrases`, () => {
      const text = readFileSync(file, "utf8");
      const lower = text.toLowerCase();
      for (const banned of HARD_BANNED) {
        expect(lower, `banned phrase: ${banned}`).not.toContain(banned);
      }
      // raw payload allowed nowhere
      expect(lower).not.toContain("api_key");
      // healthy near degraded tokens
      for (const line of text.split("\n")) {
        if (/\bhealthy\b/i.test(line) && DEGRADED.test(line)) {
          // allow explicit negation comments
          if (/never|not\s+(be\s+)?healthy|no\s+healthy/i.test(line)) continue;
          throw new Error(`healthy near degraded token: ${line.trim()}`);
        }
      }
    });
  }

  it("view model and presenter contain no supabase writes/RPCs", () => {
    for (const file of [
      "src/lib/evidenceCoverageViewModel.ts",
      "src/components/EvidenceCoveragePanel.tsx",
    ]) {
      const text = readFileSync(file, "utf8");
      for (const pat of WRITE_PATTERNS) {
        expect(pat.test(text), `${file} matches ${pat}`).toBe(false);
      }
    }
  });

  it("hook performs SELECT only, never writes", () => {
    const text = readFileSync("src/hooks/useEvidenceCoverage.ts", "utf8");
    for (const pat of WRITE_PATTERNS) {
      expect(pat.test(text), `useEvidenceCoverage matches ${pat}`).toBe(false);
    }
    expect(text).toMatch(/\.select\(/);
  });
});
