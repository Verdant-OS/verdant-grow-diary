/**
 * Static safety scan — AI Doctor Phase 1 Preview route/page + fixtures.
 *
 * Asserts the page and its case-fixture library do not import or call:
 *   - Supabase client
 *   - Edge Functions (functions.invoke)
 *   - fetch
 *   - AI Doctor engine/compiler/confidence adapters
 *   - DB write helpers (insert, update)
 *   - Action Queue / alerts write paths
 *   - service_role / bridge token / device control
 *   - AI/model SDKs
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE_PATH = "src/pages/AiDoctorPhase1Preview.tsx";
const FIXTURES_PATH = "src/lib/aiDoctorPhase1PreviewFixtures.ts";

function read(p: string): string {
  return readFileSync(resolve(ROOT, p), "utf8");
}

const pageSrc = read(PAGE_PATH);
const fixturesSrc = read(FIXTURES_PATH);
const targets: Array<[string, string]> = [
  ["page", pageSrc],
  ["fixtures", fixturesSrc],
];

describe("ai-doctor-phase1-preview — static safety (page + fixtures)", () => {
  it.each(targets)("[%s] does not import supabase client", (_, src) => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']@supabase/);
  });

  it.each(targets)(
    "[%s] does not import AI Doctor engine/compiler/confidence adapter",
    (_, src) => {
      expect(src).not.toMatch(/generateMultimodalDiagnosisPhase1/);
      expect(src).not.toMatch(/compilePlantContextFromRows/);
      expect(src).not.toMatch(/calculateAiDoctorConfidence/);
      expect(src).not.toMatch(/from\s+["']@\/lib\/aiDoctorEngine["']/);
      expect(src).not.toMatch(/from\s+["']@\/lib\/aiDoctorContextCompiler["']/);
      expect(src).not.toMatch(/from\s+["']@\/lib\/aiDoctorConfidenceAdapter["']/);
    },
  );

  it.each(targets)("[%s] does not call functions.invoke or fetch", (_, src) => {
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/fetch\s*\(/);
  });

  it.each(targets)("[%s] does not reference DB write helpers", (_, src) => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it.each(targets)(
    "[%s] does not reference action_queue or alerts tables",
    (_, src) => {
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
    },
  );

  it.each(targets)(
    "[%s] does not reference service_role or bridge token",
    (_, src) => {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/bridge token/);
    },
  );

  it.each(targets)(
    "[%s] does not contain executable device-control names",
    (_, src) => {
      expect(src).not.toMatch(/controlDevice/i);
      expect(src).not.toMatch(/sendCommand/i);
      expect(src).not.toMatch(/turnOn/i);
      expect(src).not.toMatch(/turnOff/i);
      expect(src).not.toMatch(/setFan/i);
      expect(src).not.toMatch(/setLight/i);
    },
  );

  it.each(targets)("[%s] does not import model/API clients", (_, src) => {
    expect(src).not.toMatch(/openai/i);
    expect(src).not.toMatch(/anthropic/i);
    expect(src).not.toMatch(/gemini/i);
    expect(src).not.toMatch(/gpt-/i);
  });

  it("page imports only the preview panel, view-model type, and fixtures library", () => {
    expect(pageSrc).toMatch(/from\s+["']@\/components\/AiDoctorPhase1PreviewPanel["']/);
    expect(pageSrc).toMatch(/from\s+["']@\/lib\/aiDoctorPhase1PreviewFixtures["']/);
  });

  it("fixtures file only imports the view-model type", () => {
    expect(fixturesSrc).toMatch(/from\s+["']@\/lib\/aiDoctorPhase1ViewModel["']/);
    // No other relative/alias imports
    const importLines = fixturesSrc.match(/^import .+ from .+$/gm) ?? [];
    for (const line of importLines) {
      expect(line).toMatch(/from\s+["']@\/lib\/aiDoctorPhase1ViewModel["']/);
    }
  });
});
