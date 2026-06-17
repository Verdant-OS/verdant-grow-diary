import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const NEW_FILES = [
  "src/lib/quickLogMaturityEvidenceRules.ts",
  "src/components/QuickLogMaturityEvidenceFields.tsx",
];

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");
}

function source() {
  return NEW_FILES.map((path) =>
    withoutComments(readFileSync(join(ROOT, path), "utf8")),
  ).join("\n");
}

describe("Quick Log maturity evidence static safety", () => {
  it("does not add write paths, AI calls, alerts, Action Queue, automation, or device control", () => {
    const text = source();

    expect(text).not.toMatch(/\.insert\s*\(/i);
    expect(text).not.toMatch(/\.update\s*\(/i);
    expect(text).not.toMatch(/\.delete\s*\(/i);
    expect(text).not.toMatch(/\.upsert\s*\(/i);
    expect(text).not.toMatch(/\.rpc\s*\(/i);
    expect(text).not.toMatch(/functions\.invoke/i);
    expect(text).not.toMatch(/ai_doctor|openai|model_call/i);
    expect(text).not.toMatch(/action_queue|Alert|alert/i);
    expect(text).not.toMatch(/automation|device control|target_device/i);
  });

  it("does not claim readiness or tell the grower to take final action", () => {
    const text = source();

    expect(text).not.toMatch(/ready to harvest/i);
    expect(text).not.toMatch(/harvest now/i);
    expect(text).not.toMatch(/cut now/i);
    expect(text).not.toMatch(/final decision/i);
  });
});
