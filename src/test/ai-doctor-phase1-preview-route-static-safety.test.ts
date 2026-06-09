/**
 * Static safety scan — AI Doctor Phase 1 Preview route/page.
 *
 * Asserts the page does not import or call:
 *   - Supabase client
 *   - Edge Functions (functions.invoke)
 *   - fetch
 *   - AI Doctor engine/compiler/confidence adapters
 *   - DB write helpers (insert, update)
 *   - Action Queue / alerts write paths
 *   - service_role / bridge token / device control
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE_PATH = "src/pages/AiDoctorPhase1Preview.tsx";

function read(p: string): string {
  return readFileSync(resolve(ROOT, p), "utf8");
}

describe("ai-doctor-phase1-preview route — static safety", () => {
  const src = read(PAGE_PATH);

  it("does not import supabase client", () => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']@supabase/);
  });

  it("does not import AI Doctor engine/compiler/confidence adapter", () => {
    expect(src).not.toMatch(/generateMultimodalDiagnosisPhase1/);
    expect(src).not.toMatch(/compilePlantContextFromRows/);
    expect(src).not.toMatch(/calculateAiDoctorConfidence/);
    expect(src).not.toMatch(/aiDoctorEngine/);
    expect(src).not.toMatch(/aiDoctorContextCompiler/);
    expect(src).not.toMatch(/aiDoctorConfidenceAdapter/);
  });

  it("does not call functions.invoke or fetch", () => {
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/fetch\s*\(/);
  });

  it("does not reference DB write helpers", () => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it("does not reference action_queue or alerts tables", () => {
    expect(src).not.toMatch(/\baction_queue\b/);
    expect(src).not.toMatch(/from\(["']alerts["']\)/);
  });

  it("does not reference service_role, bridge token, or device control", () => {
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/bridge token/);
    expect(src).not.toMatch(/device control/);
  });

  it("does not import model/API clients", () => {
    expect(src).not.toMatch(/openai/i);
    expect(src).not.toMatch(/anthropic/i);
    expect(src).not.toMatch(/gemini/i);
    expect(src).not.toMatch(/gpt-/i);
  });

  it("only imports the preview panel and view model type", () => {
    expect(src).toMatch(/from\s+["']@\/components\/AiDoctorPhase1PreviewPanel["']/);
    expect(src).toMatch(/from\s+["']@\/lib\/aiDoctorPhase1ViewModel["']/);
  });
});
