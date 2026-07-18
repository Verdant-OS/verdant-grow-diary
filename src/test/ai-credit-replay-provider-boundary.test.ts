import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const source = (path: string) =>
  readFileSync(resolve(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const DOCTOR = source("supabase/functions/ai-doctor-review/index.ts");
const COACH = source("supabase/functions/ai-coach/index.ts");

describe("AI credit replay provider boundary", () => {
  it("AI Doctor returns validated cache or calm failure; resultless replay never reaches provider", () => {
    const replayStart = DOCTOR.indexOf('if (spendObj.status === "replayed")');
    const replayEnd = DOCTOR.indexOf("const spendId", replayStart);
    const providerIndex = DOCTOR.indexOf("fetch(GATEWAY_URL");
    expect(replayStart).toBeGreaterThan(-1);
    expect(replayEnd).toBeGreaterThan(replayStart);
    expect(providerIndex).toBeGreaterThan(replayEnd);

    const replayBlock = DOCTOR.slice(replayStart, replayEnd);
    expect(replayBlock).toContain("validateAiDoctorReviewResult(spendObj.result)");
    expect(replayBlock).toContain("return safeOk(cached.result, { replayed: true })");
    expect(replayBlock).toContain('return calmFailure("invalid")');
    expect(replayBlock).not.toContain("fetch(");
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
