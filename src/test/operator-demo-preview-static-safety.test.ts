/**
 * Static safety scan for the Operator Demo Preview slice files.
 * Ensures no unsafe phrases, no Supabase mutations, no automation/device
 * control copy, and no token/payload exposure in source.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const FILES = [
  "src/pages/OperatorDemoPreview.tsx",
  "src/components/OperatorDemoEvidenceChainPreview.tsx",
  "src/lib/operatorDemoPreviewViewModel.ts",
];

const BANNED_SUBSTRINGS = [
  "fake live",
  "automatically executes",
  "auto execute",
  "controls your grow",
  "device command",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
  "guaranteed",
  "definitely",
  "diagnosed with certainty",
  "service_role",
  "bridge_token",
  "api_token",
  "access_token",
  "refresh_token",
  // Supabase mutation surfaces
  "supabase.insert",
  ".upsert(",
  ".rpc(",
  "functions.invoke",
];

// These must not appear as raw identifiers anywhere in the source files.
const BANNED_REGEX: Array<{ name: string; re: RegExp }> = [
  { name: "supabase import", re: /from\s+["']@\/integrations\/supabase\/client["']/ },
  { name: ".insert(", re: /\.insert\s*\(/ },
  { name: ".update(", re: /\.update\s*\(/ },
  { name: ".delete(", re: /\.delete\s*\(/ },
  { name: "fetch(", re: /\bfetch\s*\(/ },
  { name: "raw_payload identifier", re: /\braw_payload\b/ },
  { name: "jwt identifier", re: /\bjwt\b/i },
  { name: "prompt identifier", re: /\bprompt\b/i },
  { name: "completion identifier", re: /\bcompletion\b/i },
  { name: "model_output identifier", re: /\bmodel_output\b/ },
];

describe("operator-demo-preview static safety", () => {
  for (const rel of FILES) {
    describe(rel, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const lower = src.toLowerCase();

      for (const phrase of BANNED_SUBSTRINGS) {
        it(`does not contain "${phrase}"`, () => {
          expect(lower).not.toContain(phrase);
        });
      }

      for (const { name, re } of BANNED_REGEX) {
        it(`does not match ${name}`, () => {
          expect(re.test(src)).toBe(false);
        });
      }
    });
  }
});
