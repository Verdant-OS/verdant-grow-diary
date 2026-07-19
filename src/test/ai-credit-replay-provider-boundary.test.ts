import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const source = (path: string) =>
  readFileSync(resolve(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const DOCTOR_RAW = readFileSync(
  resolve(ROOT, "supabase/functions/ai-doctor-review/index.ts"),
  "utf8",
);
const DOCTOR = source("supabase/functions/ai-doctor-review/index.ts");
const COACH = source("supabase/functions/ai-coach/index.ts");

describe("AI credit replay provider boundary", () => {
  it("AI Doctor resolves cached, pending, stale, and refunded spends before its provider call", () => {
    const decisionIndex = DOCTOR.indexOf("const spendDecision = classifyAiDoctorCreditSpend");
    const freshBoundary = DOCTOR.indexOf("const spendId = spendDecision.spendId", decisionIndex);
    const providerIndex = DOCTOR.indexOf("fetch(GATEWAY_URL");
    expect(decisionIndex).toBeGreaterThan(-1);
    expect(freshBoundary).toBeGreaterThan(decisionIndex);
    expect(providerIndex).toBeGreaterThan(freshBoundary);

    const replayBlock = DOCTOR.slice(decisionIndex, freshBoundary);
    expect(replayBlock).toContain('spendDecision.kind === "pending"');
    expect(replayBlock).toContain('return calmFailure("result_pending")');
    expect(replayBlock).toContain('spendDecision.kind === "stale"');
    expect(replayBlock).toContain('"result_recording_failed"');
    expect(replayBlock).toContain('spendDecision.kind === "refunded"');
    expect(replayBlock).toContain("validateAiDoctorReviewResult(spendDecision.result)");
    expect(replayBlock).toContain("return safeOk(cached.result, { replayed: true })");
    expect(replayBlock).not.toContain("fetch(");
  });

  it("AI Doctor requires a UUID request key and has no server-generated fallback", () => {
    const keyValidation = DOCTOR.indexOf("if (!isUuid(request.idempotencyKey))");
    const spendIndex = DOCTOR.indexOf('creditSupabase.rpc("ai_credit_spend"');
    expect(keyValidation).toBeGreaterThan(-1);
    expect(spendIndex).toBeGreaterThan(keyValidation);
    expect(DOCTOR.slice(keyValidation, spendIndex)).toContain('return calmFailure("shape")');
    expect(DOCTOR).not.toContain("crypto.randomUUID()");
  });

  it("AI Doctor requires the result-cache migration before Edge deployment", () => {
    expect(DOCTOR_RAW).toContain("20260719043000_ai_credit_result_cache.sql");
    expect(DOCTOR_RAW).toMatch(/apply[\s\S]{0,100}before deploying this function/i);
    expect(DOCTOR_RAW).toMatch(/deploy this function[\s\S]{0,100}publish the UUID-sending client/i);
    expect(DOCTOR.match(/\.rpc\(\s*["']ai_credit_attach_result["']/g) ?? []).toHaveLength(1);
    expect(DOCTOR).not.toMatch(/supabase\.rpc\(\s*["']ai_credit_attach_result["']/);
  });

  it("AI Doctor keeps unexpected spend-or-later failures on the same logical request key", () => {
    const ambiguityFlag = DOCTOR.indexOf("let creditSpendMayExist = false");
    const spendAttempt = DOCTOR.indexOf("creditSpendMayExist = true", ambiguityFlag);
    const spendRpc = DOCTOR.indexOf('creditSupabase.rpc("ai_credit_spend"', spendAttempt);
    const outerFallback = DOCTOR.lastIndexOf(
      'return calmFailure(creditSpendMayExist ? "result_pending" : "http")',
    );
    expect(ambiguityFlag).toBeGreaterThan(-1);
    expect(spendAttempt).toBeGreaterThan(ambiguityFlag);
    expect(spendRpc).toBeGreaterThan(spendAttempt);
    expect(outerFallback).toBeGreaterThan(spendRpc);
  });

  it("AI Doctor validates feature, model tier, and null-safe grow scope", () => {
    const scopeStart = DOCTOR.indexOf("spendObj.feature !== FEATURE");
    const replayStart = DOCTOR.indexOf('if (spendDecision.kind === "pending")');
    expect(scopeStart).toBeGreaterThan(-1);
    expect(replayStart).toBeGreaterThan(scopeStart);
    const scopeBlock = DOCTOR.slice(scopeStart, replayStart);
    expect(scopeBlock).toContain("spendObj.model_tier !== MODEL_TIER");
    expect(scopeBlock).toContain("spendObj.grow_id !== growId");
    expect(scopeBlock).toContain('return calmFailure("credit_rpc")');
  });

  it("AI Doctor maps exact denials, key conflicts, and other invalid spend responses separately", () => {
    const decisionStart = DOCTOR.indexOf("const spendDecision = classifyAiDoctorCreditSpend");
    const scopeStart = DOCTOR.indexOf("spendObj.feature !== FEATURE", decisionStart);
    const block = DOCTOR.slice(decisionStart, scopeStart);
    expect(block).toContain('spendDecision.kind === "denied"');
    expect(block).toContain('return calmFailure("credit_denied"');
    expect(block).toContain('spendDecision.kind === "conflict"');
    expect(block).toContain('return calmFailure("invalid")');
    expect(block).toContain('spendDecision.kind === "invalid"');
    expect(block).toContain('return calmFailure("credit_rpc")');

    const spendErrorStart = DOCTOR.indexOf("if (spendErr || !spend");
    const spendErrorEnd = DOCTOR.indexOf("const spendObj", spendErrorStart);
    expect(DOCTOR.slice(spendErrorStart, spendErrorEnd)).toContain(
      'return calmFailure("credit_rpc")',
    );
  });

  it("AI Doctor returns fresh provider output only after result attachment confirms", () => {
    const validationIndex = DOCTOR.indexOf("const v = validateAiDoctorReviewResult(candidate)");
    const attachIndex = DOCTOR.indexOf('creditSupabase.rpc("ai_credit_attach_result"');
    const successIndex = DOCTOR.lastIndexOf("return safeOk(v.result");
    expect(validationIndex).toBeGreaterThan(-1);
    expect(attachIndex).toBeGreaterThan(validationIndex);
    expect(successIndex).toBeGreaterThan(attachIndex);
    const attachmentBoundary = DOCTOR.slice(attachIndex, successIndex);
    expect(attachmentBoundary).toContain("parseAiDoctorResultAttachment");
    const ambiguousIndex = attachmentBoundary.indexOf('attachment === "ambiguous"');
    const rejectedIndex = attachmentBoundary.indexOf('attachment === "rejected"');
    expect(ambiguousIndex).toBeGreaterThan(-1);
    expect(rejectedIndex).toBeGreaterThan(ambiguousIndex);
    const ambiguousBlock = attachmentBoundary.slice(ambiguousIndex, rejectedIndex);
    expect(ambiguousBlock).toContain('return calmFailure("result_pending")');
    expect(ambiguousBlock).not.toContain("failureAfterRefund");
    expect(attachmentBoundary).toContain('attachment === "rejected"');
    expect(attachmentBoundary.slice(rejectedIndex)).toContain("failureAfterRefund");
    expect(attachmentBoundary.slice(rejectedIndex)).toContain('"result_recording_failed"');
    expect(attachmentBoundary).toContain('attachment === "recorded"');
  });

  it("AI Doctor maps ambiguous refunds to result_pending across upstream failures", () => {
    const helperStart = DOCTOR.indexOf("async function failureAfterRefund");
    const providerIndex = DOCTOR.indexOf("fetch(GATEWAY_URL");
    expect(helperStart).toBeGreaterThan(-1);
    expect(helperStart).toBeLessThan(providerIndex);
    expect(DOCTOR.slice(helperStart, providerIndex)).toContain(
      'outcome === "confirmed" ? terminalReason : "result_pending"',
    );
    for (const terminal of ["timeout", "http", "parse", "empty", "invalid"]) {
      expect(DOCTOR).toContain(`"${terminal}"`);
    }
  });

  it("AI Coach rejects cross-feature/tier and every replay before its single provider call", () => {
    const scopeIndex = COACH.indexOf("spendObj.feature !== FEATURE");
    const replayStart = COACH.indexOf('if (spendObj.status === "replayed")');
    const providerIndex = COACH.indexOf('fetch("https://ai.gateway.lovable.dev');
    expect(scopeIndex).toBeGreaterThan(-1);
    expect(replayStart).toBeGreaterThan(scopeIndex);
    expect(providerIndex).toBeGreaterThan(replayStart);
    expect(COACH.slice(scopeIndex, providerIndex)).toContain(
      'return json({ ok: false, reason: "invalid" }, 200)',
    );
    expect(COACH.match(/fetch\("https:\/\/ai\.gateway\.lovable\.dev/g) ?? []).toHaveLength(1);
  });

  it("production spend calls persist no mutable cached result", () => {
    for (const edge of [DOCTOR, COACH]) {
      const serviceSpend = edge.indexOf('creditSupabase.rpc("ai_credit_spend"');
      expect(serviceSpend).toBeGreaterThan(-1);
      expect(edge.slice(serviceSpend, serviceSpend + 500)).toContain("p_result: null");
    }
  });
});
