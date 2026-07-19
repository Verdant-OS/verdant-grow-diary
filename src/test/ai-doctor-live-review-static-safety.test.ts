/**
 * Static safety — AI Doctor Live Review (frontend + edge).
 *
 * Hardens the frontend live-review surface area against forbidden
 * patterns: no DB writes, no service_role / secrets / API keys in
 * frontend code, no device-control language, no banned wording, no
 * raw model text logging.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const readRaw = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const read = (p: string) => stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const FRONTEND_FILES = [
  "src/lib/aiDoctorReviewEligibilityRules.ts",
  "src/lib/aiDoctorReviewRequestPacket.ts",
  "src/lib/aiDoctorReviewRequestTransportRules.ts",
  "src/lib/aiCreditedResponseAdapter.ts",
  "src/hooks/useAiDoctorLiveReview.ts",
  "src/components/PlantDetailAiDoctorLiveReview.tsx",
];

const EDGE_FILES = [
  "supabase/functions/ai-doctor-review/index.ts",
  "supabase/functions/ai-doctor-review/contract.ts",
];

describe("ai doctor live review — frontend static safety", () => {
  for (const path of FRONTEND_FILES) {
    const src = read(path);

    it(`${path}: no DB writes / rpc`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    });

    it(`${path}: no secrets / service_role / api keys / model providers`, () => {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/LOVABLE_API_KEY/);
      expect(src).not.toMatch(/sk-[a-z0-9-]+/i);
      expect(src).not.toMatch(/openai|anthropic|gemini|gpt-/i);
      expect(src).not.toMatch(/ai\.gateway\.lovable\.dev/);
    });

    it(`${path}: no writes to AI Doctor sessions / alerts / action_queue / sensor_readings`, () => {
      expect(src).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
    });

    it(`${path}: no banned wording / device-control imperatives in copy`, () => {
      expect(src).not.toMatch(/\b(confirmed|certain|cured|guaranteed)\b/i);
      expect(src).not.toMatch(/['"](live|synced|connected|imported)['"]/);
      expect(src).not.toMatch(/\b(turn on|switch off|power the|toggle the)\b/i);
    });

    it(`${path}: never logs raw packets, responses, or secrets`, () => {
      // Frontend must not log review responses or packets at all.
      expect(src).not.toMatch(/console\.(log|warn|info|debug)\s*\(/);
    });
  }
});

describe("ai doctor live review — edge static safety", () => {
  for (const path of EDGE_FILES) {
    const src = read(path);

    it(`${path}: no DB writes; only approved credit and fresh-completion RPCs`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      // RPC allow-list: live-review edge may only call atomic credit spend,
      // matching refund, immutable result attachment, and the service-only
      // completion recorder after a fresh validated result.
      const APPROVED_RPCS = new Set([
        "ai_credit_spend",
        "ai_credit_refund",
        "ai_credit_attach_result",
        "record_ai_doctor_review_completion",
      ]);
      const rpcCalls = [...src.matchAll(/\.rpc\s*\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g)].map(
        (m) => m[1],
      );
      for (const name of rpcCalls) {
        expect(
          APPROVED_RPCS.has(name),
          `${path} called unapproved RPC: ${name}. Only credit and protected completion RPCs are allowed.`,
        ).toBe(true);
      }

      if (path.endsWith("index.ts")) {
        expect(src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
        const validationIndex = src.indexOf("const v = validateAiDoctorReviewResult(candidate)");
        const completionCallIndex = src.lastIndexOf(
          "recordFreshAiDoctorReviewCompletion(userId, spendId)",
        );
        const attachmentIndex = src.indexOf('.rpc("ai_credit_attach_result"');
        expect(attachmentIndex).toBeGreaterThan(validationIndex);
        expect(completionCallIndex).toBeGreaterThan(attachmentIndex);
        expect(src).toContain('if (attachment === "recorded")');
        const replayStart = src.indexOf("const spendDecision = classifyAiDoctorCreditSpend");
        const replayEnd = src.indexOf("const spendId = spendDecision.spendId", replayStart);
        expect(replayStart).toBeGreaterThanOrEqual(0);
        expect(replayEnd).toBeGreaterThan(replayStart);
        expect(src.slice(replayStart, replayEnd)).not.toContain(
          "recordFreshAiDoctorReviewCompletion",
        );
        expect(src.slice(replayStart, replayEnd)).toContain('return calmFailure("result_pending")');
        const scopeStart = src.indexOf("spendObj.feature !== FEATURE");
        const pendingStart = src.indexOf('if (spendDecision.kind === "pending")');
        expect(scopeStart).toBeGreaterThan(replayStart);
        expect(src.slice(scopeStart, pendingStart)).toContain("spendObj.grow_id !== growId");
        expect(src).toContain("parseAiDoctorReviewRequestEnvelope");
        expect(src).toContain("validateAndNormalizeAiDoctorReviewRequestPacket");
        const packetValidationIndex = src.indexOf(
          "const validatedPacket = validateAndNormalizeAiDoctorReviewRequestPacket(request.packet)",
        );
        const firstCreditSpendIndex = src.indexOf('.rpc("ai_credit_spend"');
        expect(packetValidationIndex).toBeGreaterThanOrEqual(0);
        expect(firstCreditSpendIndex).toBeGreaterThan(packetValidationIndex);
        expect(src.slice(packetValidationIndex, firstCreditSpendIndex)).toContain(
          'return calmFailure("shape")',
        );
        const keyValidationIndex = src.indexOf("if (!isUuid(request.idempotencyKey))");
        expect(keyValidationIndex).toBeGreaterThan(packetValidationIndex);
        expect(keyValidationIndex).toBeLessThan(firstCreditSpendIndex);
        expect(src).not.toContain("crypto.randomUUID()");
        expect(src).toContain("buildAiDoctorPromptMessages(validatedPacket)");
        expect(src).not.toContain("buildAiDoctorPromptMessages(request.packet)");
        expect(src).not.toContain("buildAiDoctorPromptMessages(requestBody)");
        const ambiguousAttachment = src.indexOf('if (attachment === "ambiguous")');
        const rejectedAttachment = src.indexOf('if (attachment === "rejected")');
        expect(ambiguousAttachment).toBeGreaterThan(attachmentIndex);
        expect(rejectedAttachment).toBeGreaterThan(ambiguousAttachment);
        expect(src.slice(ambiguousAttachment, rejectedAttachment)).toContain(
          'return calmFailure("result_pending")',
        );
        expect(src.slice(ambiguousAttachment, rejectedAttachment)).not.toContain(
          "failureAfterRefund",
        );
        expect(src.slice(rejectedAttachment, completionCallIndex)).toContain("failureAfterRefund");
      }
      for (const re of [
        /action_queue/i,
        /device/i,
        /relay/i,
        /actuator/i,
        /autopilot/i,
        /auto[_-]?execute/i,
        /dispatch[_-]?command/i,
        /grant[_-]?role/i,
        /set[_-]?billing/i,
        /set[_-]?plan/i,
      ]) {
        for (const name of rpcCalls) {
          expect(name, `${path} RPC name matches banned pattern ${re}`).not.toMatch(re);
        }
      }
    });

    it(`${path}: no writes to AI Doctor sessions / alerts / action_queue / sensor_readings`, () => {
      expect(src).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
      expect(src).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
    });

    it(`${path}: never echoes raw model body / packet / secrets in logs`, () => {
      // Allow safe status logs ("status=...") but no JSON.stringify of
      // response payloads or packets into console.log calls.
      const logCalls = src.match(/console\.log\([^)]*\)/g) ?? [];
      for (const call of logCalls) {
        expect(call).not.toMatch(/payload|candidate|packet|response|JSON\.stringify/);
        expect(call).not.toMatch(/LOVABLE_API_KEY|apiKey|Bearer/);
      }
    });
  }

  it("requires the result-cache migration before deploying the AI Doctor Edge", () => {
    const raw = readRaw("supabase/functions/ai-doctor-review/index.ts");
    const src = stripSourceComments(raw);
    expect(raw).toContain("20260719043000_ai_credit_result_cache.sql");
    expect(raw).toMatch(/apply[\s\S]{0,100}before deploying this function/i);
    expect(src.match(/\.rpc\s*\(\s*["']ai_credit_attach_result["']/g) ?? []).toHaveLength(1);
    expect(src).not.toMatch(/\bsupabase\.rpc\s*\(\s*["']ai_credit_attach_result["']/);
  });
});
