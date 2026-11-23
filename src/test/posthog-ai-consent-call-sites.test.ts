import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { contentFreeAiSessionId } from "@/lib/posthogAiObservabilityRules";

const ROOT = resolve(__dirname, "../..");

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("AI analytics consent stays at the call site", () => {
  it("does not let an edge function force capture on", () => {
    for (const path of [
      "supabase/functions/ai-coach/index.ts",
      "supabase/functions/ai-doctor-review/index.ts",
      "supabase/functions/ai-cultivar-qa/index.ts",
    ]) {
      const text = source(path);
      expect(text, path).toContain("consentGranted: requestGrantsAnalyticsCapture(req)");
      expect(text, path).not.toContain("consentGranted: true");
    }
  });

  it("does not let the browser callers force the consent header on", () => {
    for (const path of [
      "src/pages/Coach.tsx",
      "src/hooks/useCultivarQa.ts",
      "src/hooks/useDoctorGrowNextSteps.ts",
    ]) {
      const text = source(path);
      expect(text, path).toContain("headers: grantedAnalyticsConsentHeaders()");
      expect(text, path).not.toContain('"x-verdant-analytics-consent": "granted"');
    }
  });

  it("keeps session ids as a feature label with no raw id", () => {
    expect(contentFreeAiSessionId("ai_coach")).toBe("ai_coach");
    expect(contentFreeAiSessionId("ai_doctor_review:11111111-1111-4111-8111-111111111111")).toBe(
      "ai_doctor_review",
    );
    expect(source("supabase/functions/ai-coach/index.ts")).toContain(
      "contentFreeAiSessionId(FEATURE)",
    );
    expect(source("supabase/functions/ai-doctor-review/index.ts")).toContain(
      "contentFreeAiSessionId(FEATURE)",
    );
    expect(source("supabase/functions/ai-cultivar-qa/index.ts")).toContain(
      'contentFreeAiSessionId("ai_cultivar_qa")',
    );
    expect(source("supabase/functions/ai-coach/index.ts")).not.toContain("ai_coach:${userId}");
  });

  it("captures the coach malformed-JSON and body-timeout path", () => {
    const coach = source("supabase/functions/ai-coach/index.ts");
    const start = coach.indexOf("const noteParse = (aborted: boolean)");
    const end = coach.indexOf(
      'return failureAfterRefund(spendId, "upstream_parse", "parse")',
      start,
    );
    const block = coach.slice(start, end);
    expect(block).toContain("noteParse(providerController.signal.aborted)");
    expect(block).toContain('error: aborted ? "timeout" : "invalid_json_response"');
  });
});
