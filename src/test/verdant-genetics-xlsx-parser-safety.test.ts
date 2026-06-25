import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Static safety guard for the Verdant Genetics XLSX parser:
 *   - no Supabase imports
 *   - no insert/update/delete/upsert/rpc calls
 *   - no alerts / Action Queue writes
 *   - no AI / model calls
 *   - no device-control verbs
 */
describe("verdantGeneticsXlsxParser — static safety scan", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/verdantGeneticsXlsxParser.ts"),
    "utf-8",
  );
  // strip line + block comments to avoid false positives
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("does not import Supabase or call DB write methods", () => {
    expect(code).not.toMatch(/@\/integrations\/supabase\/client/);
    expect(code).not.toMatch(/from\s+["']@supabase/);
    expect(code).not.toMatch(/\.insert\s*\(/);
    expect(code).not.toMatch(/\.update\s*\(/);
    expect(code).not.toMatch(/\.delete\s*\(/);
    expect(code).not.toMatch(/\.upsert\s*\(/);
    expect(code).not.toMatch(/\.rpc\s*\(/);
  });

  it("does not write alerts or Action Queue rows", () => {
    expect(code).not.toMatch(/action_queue/);
    expect(code).not.toMatch(/environment_alerts/);
    expect(code).not.toMatch(/persistEnvironmentAlerts/);
  });

  it("does not call AI / model services", () => {
    expect(code).not.toMatch(/ai-coach/);
    expect(code).not.toMatch(/ai-doctor/);
    expect(code).not.toMatch(/openai|gemini|anthropic|lovable-ai/i);
  });

  it("does not import device-control verbs", () => {
    expect(code).not.toMatch(/turn[_\s]?on|turn[_\s]?off|set_fan|set_light/i);
    expect(code).not.toMatch(/bridge_token|service_role/);
  });

  it("never tags rows as live; canonical source is 'csv'", () => {
    expect(code).toMatch(/VERDANT_GENETICS_SOURCE_TAG\s*=\s*["']csv["']/);
    expect(code).not.toMatch(/source\s*:\s*["']live["']/);
  });
});
