/**
 * Output safety regression tests for supabase/functions/ai-coach/index.ts.
 *
 * Like ai-coach-security.test.ts these are static-analysis tests: the edge
 * function targets Deno and cannot be imported into Node/vitest. We assert on
 * the source + the canned EMPTY_ANALYSIS object to lock in the safety
 * invariants of the AI response contract:
 *
 *  1. Response is structured JSON (response_format=json_object + strict shape).
 *  2. Required fields are present (summary/confidence/risk_level/evidence/
 *     recommended_actions/do_not_do).
 *  3. Missing sensor data is never classified as "healthy".
 *  4. Null / invalid telemetry is treated as degraded or unknown.
 *  5. No blind-autopilot recommendations.
 *  6. No device actions implied without approval-required status.
 *  7. Cautious language when context is sparse / single-photo.
 *  8. No self-contradiction (cannot be both "healthy" and "high risk").
 *  9. EMPTY_ANALYSIS behavior preserved when grow context is missing.
 * 10. Deterministic ordering for actions by risk/priority (prompt directive).
 *
 * If any of these fail, the AI Coach may have regressed into unsafe output.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_PATH = resolve(__dirname, "../../supabase/functions/ai-coach/index.ts");
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

// Extract the EMPTY_ANALYSIS literal block as text so we can introspect it
// without importing Deno-only code.
function extractEmptyAnalysisBlock(): string {
  const m = SOURCE.match(/const\s+EMPTY_ANALYSIS\s*=\s*(\{[\s\S]*?\n\})\s*;/);
  if (!m) throw new Error("EMPTY_ANALYSIS literal not found");
  return m[1];
}
const EMPTY_BLOCK = extractEmptyAnalysisBlock();

// Extract the system-prompt template string.
function extractSystemPrompt(): string {
  const m = SOURCE.match(/const\s+system\s*=\s*`([\s\S]*?)`;/);
  if (!m) throw new Error("system prompt not found");
  return m[1];
}
const SYSTEM = extractSystemPrompt();

describe("ai-coach — output safety contract", () => {
  it("1. requests structured JSON from the model (response_format json_object)", () => {
    expect(CODE).toMatch(/response_format:\s*\{\s*type:\s*["']json_object["']\s*\}/);
    expect(SYSTEM).toMatch(/STRICT JSON ONLY/);
    expect(SYSTEM).toMatch(/no prose, no markdown/);
  });

  it("2. system prompt declares all required output fields", () => {
    for (const field of [
      "summary",
      "likely_issue",
      "confidence",
      "risk_level",
      "evidence",
      "possible_causes",
      "recommended_actions",
      "do_not_do",
      "follow_up_24h",
      "follow_up_3_day",
    ]) {
      expect(SYSTEM, `system prompt must declare "${field}"`).toContain(`"${field}"`);
    }
    // EMPTY_ANALYSIS canned response carries the same surface.
    for (const field of [
      "summary",
      "likely_issue",
      "confidence",
      "risk_level",
      "evidence",
      "recommended_actions",
      "do_not_do",
      "follow_up_24h",
      "follow_up_3_day",
    ]) {
      expect(EMPTY_BLOCK, `EMPTY_ANALYSIS must include "${field}"`).toContain(`${field}:`);
    }
  });

  it("3. system prompt forbids fabricating sensor values / never classifies missing as healthy", () => {
    // Model is told to use ONLY provided context and not invent sensor values.
    expect(SYSTEM).toMatch(/Use ONLY the provided context/);
    expect(SYSTEM).toMatch(/Do not invent sensor values/);
    // When sensor data is missing the function explicitly emits
    // "LATEST_SENSOR_SNAPSHOT: none" — not a healthy/default reading.
    expect(CODE).toMatch(/LATEST_SENSOR_SNAPSHOT:\s*none/);
    // EMPTY_ANALYSIS (used when there is no grow/entries) must NOT use the
    // word "healthy" anywhere — that would be a false-positive classification.
    expect(EMPTY_BLOCK.toLowerCase()).not.toContain("healthy");
    // And it must default risk_level to "unknown" rather than "low".
    expect(EMPTY_BLOCK).toMatch(/risk_level:\s*["']unknown["']/);
    expect(EMPTY_BLOCK).toMatch(/confidence:\s*["']low["']/);
  });

  it("4. null / sparse telemetry is treated as degraded or unknown (low confidence)", () => {
    // Function-level: sparse := entries.length < 2 and gets surfaced to the model.
    expect(CODE).toMatch(/const\s+sparse\s*=\s*entries\.length\s*<\s*2/);
    expect(CODE).toMatch(/ENTRY_COUNT:[^\n]*sparse/);
    // Prompt rule: with only one photo / one reading / <2 entries → confidence "low".
    expect(SYSTEM).toMatch(/confidence:\s*["']?low["']?[\s\S]{0,200}<\s*2\s*diary\s*entries/i);
    // Risk taxonomy MUST include "unknown" so the model can decline to classify.
    expect(SYSTEM).toMatch(/"risk_level":\s*"low"\s*\|\s*"medium"\s*\|\s*"high"\s*\|\s*"unknown"/);
  });

  it("5. prompt does not recommend blind autopilot / unsupervised automation", () => {
    const lower = SYSTEM.toLowerCase();
    for (const banned of ["autopilot", "auto-pilot", "automate everything", "auto execute", "auto-execute"]) {
      expect(lower, `system prompt must not encourage "${banned}"`).not.toContain(banned);
    }
    // Prompt explicitly prefers safe, reversible steps when context is thin.
    expect(SYSTEM).toMatch(/safe,\s*reversible\s*steps/i);
  });

  it("6. function does not perform or imply device actions without approval", () => {
    // No device-control side effects in the edge function source.
    for (const banned of [
      /action_queue/i,
      /device_command/i,
      /\bactuator/i,
      /\brelay\b/i,
      /\bmqtt\b/i,
      /pi-bridge/i,
    ]) {
      expect(CODE, `ai-coach must not invoke device controls (${banned})`).not.toMatch(banned);
    }
    // The only outbound call is to the AI gateway — not to any device endpoint.
    const fetches = CODE.match(/fetch\(\s*["'`]([^"'`]+)/g) ?? [];
    for (const f of fetches) {
      expect(f).toMatch(/ai\.gateway\.lovable\.dev/);
    }
  });

  it("7. cautious language is required when photo/context data is limited", () => {
    // Prompt: if sparse, say so explicitly in summary.
    expect(SYSTEM).toMatch(/sparse[\s\S]{0,80}say so explicitly/i);
    // EMPTY_ANALYSIS summary uses cautious framing (asks for more data, no diagnosis).
    expect(EMPTY_BLOCK).toMatch(/summary:\s*["'][^"']*log[\s\S]*?diagnosis/i);
    // EMPTY recommended_actions are observational, not interventionist.
    expect(EMPTY_BLOCK.toLowerCase()).not.toMatch(/\b(flush|defoliate|top|prune|increase nutrients|raise ec)\b/);
  });

  it("8. no self-contradiction: 'healthy' + 'high risk' cannot co-occur in canned output", () => {
    const lower = EMPTY_BLOCK.toLowerCase();
    const saysHealthy = /\bhealthy\b/.test(lower);
    const saysHighRisk = /risk_level:\s*["']high["']/.test(EMPTY_BLOCK);
    expect(saysHealthy && saysHighRisk).toBe(false);
    // Prompt also constrains the model: risk_level enum is fixed and summary must
    // be grounded in evidence pulled from context (no free-form "healthy" claim
    // alongside high risk).
    expect(SYSTEM).toMatch(/evidence:\s*bullet\s*facts\s*pulled\s*DIRECTLY\s*from\s*context/i);
  });

  it("9. EMPTY_ANALYSIS path preserved when grow context is missing", () => {
    // empty := !grow || entries.length === 0 — and the empty+no-photo branch
    // short-circuits to EMPTY_ANALYSIS before any AI call.
    expect(CODE).toMatch(/const\s+empty\s*=\s*!grow\s*\|\|\s*entries\.length\s*===\s*0/);
    expect(CODE).toMatch(
      /if\s*\(\s*empty\s*&&\s*!body\.photoUrl\s*\)[\s\S]{0,200}return\s+json\(\s*\{\s*analysis:\s*EMPTY_ANALYSIS/,
    );
    // Ordering: empty short-circuit happens BEFORE the AI gateway fetch.
    const emptyIdx = CODE.search(/if\s*\(\s*empty\s*&&\s*!body\.photoUrl/);
    const fetchIdx = CODE.search(/fetch\(\s*["']https:\/\/ai\.gateway\.lovable\.dev/);
    expect(emptyIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(emptyIdx).toBeLessThan(fetchIdx);
    // And EMPTY_ANALYSIS itself stays cautious (low confidence, unknown risk).
    expect(EMPTY_BLOCK).toMatch(/confidence:\s*["']low["']/);
    expect(EMPTY_BLOCK).toMatch(/risk_level:\s*["']unknown["']/);
  });

  it("10. recommended_actions are ordered by risk/priority (prompt instructs deterministic ordering)", () => {
    // The mode-conditional rule biases ordering: diagnosis-first vs forward-looking-first.
    expect(SYSTEM).toMatch(/Bias toward forward-looking next steps in recommended_actions/);
    expect(SYSTEM).toMatch(/Bias toward diagnosis in summary \+ likely_issue/);
    // do_not_do exists explicitly so destructive actions are ranked DOWN/out of recommended_actions.
    expect(SYSTEM).toMatch(/do_not_do:\s*warn against destructive actions/i);
    // EMPTY_ANALYSIS canned actions are ordered observation → context, never destructive first.
    const actionsMatch = EMPTY_BLOCK.match(/recommended_actions:\s*\[([\s\S]*?)\]/);
    expect(actionsMatch).not.toBeNull();
    const first = actionsMatch![1].trim().split("\n")[0].toLowerCase();
    expect(first).toMatch(/log|observ|note|snapshot|open quick log/);
  });
});
