import { describe, expect, it } from "vitest";
import {
  buildCsvHistoryImportHandoffHref,
  buildCsvHistoryOnboardingPath,
  CSV_HISTORY_ONBOARDING_INTENT,
  ONBOARDING_INTENT_QUERY_PARAM,
  readCsvHistoryOnboardingIntent,
} from "@/lib/csvHistoryOnboardingIntentRules";

const TENT_ID = "00000000-0000-4000-8000-00000000000a";

describe("csvHistoryOnboardingIntentRules", () => {
  it("builds the one fixed, internal onboarding target", () => {
    expect(buildCsvHistoryOnboardingPath()).toBe(
      `/onboarding?${ONBOARDING_INTENT_QUERY_PARAM}=${CSV_HISTORY_ONBOARDING_INTENT}`,
    );
  });

  it("accepts only the fixed CSV-history intent", () => {
    expect(
      readCsvHistoryOnboardingIntent(
        new URLSearchParams(`${ONBOARDING_INTENT_QUERY_PARAM}=${CSV_HISTORY_ONBOARDING_INTENT}`),
      ),
    ).toBe(CSV_HISTORY_ONBOARDING_INTENT);
    expect(readCsvHistoryOnboardingIntent(new URLSearchParams("intent=pricing"))).toBeNull();
    expect(
      readCsvHistoryOnboardingIntent(new URLSearchParams("intent=csv_history%20extra")),
    ).toBeNull();
    expect(readCsvHistoryOnboardingIntent(null)).toBeNull();
  });

  it("builds a tent-validated importer handoff and rejects malformed IDs", () => {
    expect(buildCsvHistoryImportHandoffHref(TENT_ID)).toBe(`/sensors?tentId=${TENT_ID}#csv-import`);
    expect(buildCsvHistoryImportHandoffHref("not-a-tent")).toBeNull();
    expect(buildCsvHistoryImportHandoffHref(null)).toBeNull();
  });
});
