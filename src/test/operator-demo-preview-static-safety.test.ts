/**
 * Direct-file static safety scan for the Operator Demo fixture slice.
 *
 * The route deliberately co-renders a signed-in grower's read-only account
 * context. That context has its own focused safety contract in
 * operator-account-read-models-static-safety.test.ts. This suite only claims
 * that the fixture presenter and fixture view model remain dependency-light,
 * and that the route composition itself has no direct mutation/control code.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const FIXTURE_FILES = [
  "src/components/OperatorDemoEvidenceChainPreview.tsx",
  "src/lib/operatorDemoPreviewViewModel.ts",
];
const COMPOSITION_PAGE = "src/pages/OperatorDemoPreview.tsx";

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

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function codeOnly(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
}

describe("operator demo fixture direct-file safety", () => {
  for (const rel of FIXTURE_FILES) {
    describe(rel, () => {
      const src = source(rel);
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

  it("keeps the owner read-model panel explicitly separate from the demo fixture", () => {
    const page = source(COMPOSITION_PAGE);
    expect(page).toMatch(/<OperatorAccountReadModelsPanel\b/);
    expect(page).toMatch(/<OperatorDemoEvidenceChainPreview\b/);
  });

  it("has no direct mutation, edge invocation, or device-control code in route composition", () => {
    const page = codeOnly(source(COMPOSITION_PAGE));
    expect(page).not.toMatch(/\.insert\s*\(/);
    expect(page).not.toMatch(/\.update\s*\(/);
    expect(page).not.toMatch(/\.upsert\s*\(/);
    expect(page).not.toMatch(/\.delete\s*\(/);
    expect(page).not.toMatch(/\.rpc\s*\(/);
    expect(page).not.toMatch(/functions\.invoke/);
    expect(page).not.toMatch(
      /\b(?:sendDeviceCommand|setRelay|relayOn|relayOff|setAutomation|runAutomation)\b/,
    );
  });
});
