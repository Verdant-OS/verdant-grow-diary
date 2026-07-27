import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const EDGE_RAW = readFileSync(resolve(ROOT, "supabase/functions/ai-coach/index.ts"), "utf8");
const COACH_RAW = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const EDGE = stripComments(EDGE_RAW);
const COACH = stripComments(COACH_RAW);

describe("AI Coach credit recovery boundary", () => {
  it("requires one client-generated UUID and has no server-generated fallback", () => {
    const parser = EDGE.indexOf("function parseAiCoachBody");
    const keyGuard = EDGE.indexOf("if (!isUuid(raw.idempotencyKey))", parser);
    const spend = EDGE.indexOf('creditSupabase.rpc("ai_credit_spend"');

    expect(parser).toBeGreaterThan(-1);
    expect(keyGuard).toBeGreaterThan(-1);
    expect(spend).toBeGreaterThan(keyGuard);
    expect(EDGE.slice(keyGuard, keyGuard + 100)).toContain("return null");
    expect(EDGE).not.toContain("crypto.randomUUID()");

    const clientKey = COACH.indexOf("() => crypto.randomUUID()");
    const invoke = COACH.indexOf('supabase.functions.invoke("ai-coach"');
    expect(clientKey).toBeGreaterThan(-1);
    expect(invoke).toBeGreaterThan(clientKey);
    expect(COACH.slice(invoke, invoke + 300)).toContain("idempotencyKey");
  });

  it("retains an ambiguous client request and reuses its key instead of charging a new click", () => {
    expect(COACH).toContain("pendingCoachRequestRef");
    expect(COACH).toContain("resolveAiCoachPendingRequest");
    expect(COACH).toContain("shouldRetainAiCoachPendingRequest");
    expect(COACH).toContain("pendingCoachRequestRef.current = selectedRequest");
    expect(COACH).toContain("if (!invocationStarted) clearPendingRequest()");
  });

  it("validates every provider-relevant field before credit spend", () => {
    const parser = EDGE.indexOf("function parseAiCoachBody");
    const parsedBody = EDGE.indexOf("const body = parseAiCoachBody");
    const spend = EDGE.indexOf('creditSupabase.rpc("ai_credit_spend"');

    expect(parser).toBeGreaterThan(-1);
    expect(parsedBody).toBeGreaterThan(parser);
    expect(spend).toBeGreaterThan(parsedBody);
    expect(EDGE.slice(parsedBody, spend)).toContain('if (!body) return calmFailure("shape")');

    const parserBlock = EDGE.slice(parser, parsedBody);
    expect(parserBlock).toContain('raw.mode !== "diagnose"');
    expect(parserBlock).toContain('raw.mode !== "next_steps"');
    expect(parserBlock).toContain("MAX_QUESTION_LENGTH");
    expect(parserBlock).toContain("MAX_PHOTO_URL_LENGTH");
    expect(parserBlock).toContain("/storage/v1/object/sign/");
    expect(parserBlock).toContain("growId = raw.growId.toLowerCase()");
  });

  it("resolves cached, pending, stale, and refunded spends before the provider call", () => {
    const decision = EDGE.indexOf("const spendDecision = classifyAiDoctorCreditSpend");
    const freshBoundary = EDGE.indexOf("const spendId = spendDecision.spendId", decision);
    const provider = EDGE.indexOf('fetch("https://ai.gateway.lovable.dev');

    expect(decision).toBeGreaterThan(-1);
    expect(freshBoundary).toBeGreaterThan(decision);
    expect(provider).toBeGreaterThan(freshBoundary);

    const replayBlock = EDGE.slice(decision, freshBoundary);
    expect(replayBlock).toContain('spendDecision.kind === "pending"');
    expect(replayBlock).toContain('return calmFailure("result_pending")');
    expect(replayBlock).toContain('spendDecision.kind === "stale"');
    expect(replayBlock).toContain('spendDecision.kind === "refunded"');
    expect(replayBlock).toContain('spendDecision.kind === "cached"');
    expect(replayBlock).toContain("validateAiCoachResult(spendDecision.result)");
    expect(replayBlock).toContain("return safeOk(cached.result");
    expect(replayBlock).not.toContain("fetch(");
  });

  it("refunds failed response parsing and invalid model output", () => {
    const provider = EDGE.indexOf('fetch("https://ai.gateway.lovable.dev');
    const attachment = EDGE.indexOf('creditSupabase.rpc("ai_credit_attach_result"', provider);
    const providerBlock = EDGE.slice(provider, attachment);

    expect(providerBlock).toMatch(
      /await\s+r\.json\(\)[\s\S]{0,250}failureAfterRefund\([^)]*"upstream_parse"[^)]*"parse"/,
    );
    expect(providerBlock).toMatch(
      /JSON\.parse\(\s*raw\s*\)[\s\S]{0,250}failureAfterRefund\([^)]*"upstream_parse"[^)]*"parse"/,
    );
    expect(providerBlock).toContain("validateAiCoachResult");
    expect(providerBlock).toContain('"invalid_model_result"');
  });

  it("records a validated result before returning fresh success", () => {
    const validation = EDGE.indexOf("const validated = validateAiCoachResult");
    const attachment = EDGE.indexOf('creditSupabase.rpc("ai_credit_attach_result"', validation);
    const success = EDGE.indexOf("return safeOk(validated.result", attachment);

    expect(validation).toBeGreaterThan(-1);
    expect(attachment).toBeGreaterThan(validation);
    expect(success).toBeGreaterThan(attachment);
    expect(EDGE.slice(attachment, success)).toContain("parseAiDoctorResultAttachment");
    expect(EDGE.slice(attachment, success)).toContain('finalization === "ambiguous"');
    expect(EDGE.slice(attachment, success)).toContain('finalization === "rejected"');
  });

  it("keeps unexpected spend-or-later failures retryable with the same logical key", () => {
    const ambiguityFlag = EDGE.indexOf("let creditSpendMayExist = false");
    const spendAttempt = EDGE.indexOf("creditSpendMayExist = true", ambiguityFlag);
    const spend = EDGE.indexOf('creditSupabase.rpc("ai_credit_spend"', spendAttempt);
    const fallback = EDGE.lastIndexOf(
      'return calmFailure(creditSpendMayExist ? "result_pending" : "http")',
    );

    expect(ambiguityFlag).toBeGreaterThan(-1);
    expect(spendAttempt).toBeGreaterThan(ambiguityFlag);
    expect(spend).toBeGreaterThan(spendAttempt);
    expect(fallback).toBeGreaterThan(spend);
  });
});
