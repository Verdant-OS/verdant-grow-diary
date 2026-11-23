import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  grantedAnalyticsConsentHeaders,
} from "@/lib/analyticsConsent";
import {
  ANALYTICS_CONSENT_REQUEST_HEADER,
  requestGrantsAnalyticsCapture,
} from "@/lib/posthogAiObservabilityRules";
import {
  clearLocalStorageForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";

const ROOT = resolve(__dirname, "../..");

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function consentExpression(path: string): string {
  const match = source(path).match(/consentGranted:\s*([^,\n]+)/);
  expect(match, path).not.toBeNull();
  return match?.[1]?.trim() ?? "";
}

function headerExpression(path: string): string {
  const match = source(path).match(/headers:\s*([^,\n]+)/);
  expect(match, path).not.toBeNull();
  return match?.[1]?.trim() ?? "";
}

describe("AI analytics consent stays at the call site", () => {
  afterEach(() => {
    clearLocalStorageForTest();
  });

  it("runs the edge consent expression instead of treating a forced true as granted", () => {
    for (const path of [
      "supabase/functions/ai-coach/index.ts",
      "supabase/functions/ai-doctor-review/index.ts",
      "supabase/functions/ai-cultivar-qa/index.ts",
    ]) {
      const expression = consentExpression(path);
      const decide = new Function(
        "requestGrantsAnalyticsCapture",
        "req",
        `return (${expression});`,
      ) as (gate: typeof requestGrantsAnalyticsCapture, req: Request) => boolean;
      expect(
        decide(requestGrantsAnalyticsCapture, new Request("https://example.test/ai")),
        path,
      ).toBe(false);
      expect(
        decide(
          requestGrantsAnalyticsCapture,
          new Request("https://example.test/ai", {
            headers: { [ANALYTICS_CONSENT_REQUEST_HEADER]: "granted" },
          }),
        ),
        path,
      ).toBe(true);
    }
  });

  it("runs the browser header expression, which stays off without production consent", () => {
    for (const path of [
      "src/pages/Coach.tsx",
      "src/hooks/useCultivarQa.ts",
      "src/hooks/useDoctorGrowNextSteps.ts",
      "src/hooks/useAiDoctorLiveReview.ts",
    ]) {
      const expression = headerExpression(path);
      const headersFor = new Function(
        "grantedAnalyticsConsentHeaders",
        `return (${expression});`,
      ) as (
        headers: typeof grantedAnalyticsConsentHeaders,
      ) => ReturnType<typeof grantedAnalyticsConsentHeaders>;
      clearLocalStorageForTest();
      expect(headersFor(grantedAnalyticsConsentHeaders), path).toBeUndefined();
      setLocalStorageItemForTest(ANALYTICS_CONSENT_STORAGE_KEY, "granted");
      expect(headersFor(grantedAnalyticsConsentHeaders), path).toBeUndefined();
    }
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
