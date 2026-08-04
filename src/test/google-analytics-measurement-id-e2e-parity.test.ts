/**
 * Parity gate: the Playwright helper duplicates the GA4 fallback id and format
 * pattern (it cannot import the app constant, which reads `import.meta.env`).
 * If the app-side fallback ever changes, this fails instead of letting the e2e
 * gates silently assert a stale id.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK,
  GA4_MEASUREMENT_ID_PATTERN,
} from "@/constants/analytics";

const helper = fs.readFileSync(
  path.resolve(process.cwd(), "e2e/utils/analyticsMeasurementId.ts"),
  "utf-8",
);

function extract(pattern: RegExp): string {
  const match = helper.match(pattern);
  expect(match, `pattern ${pattern} not found in e2e/utils/analyticsMeasurementId.ts`).toBeTruthy();
  return match![1];
}

describe("e2e measurement-id helper parity", () => {
  it("uses the same fallback id as the app constant", () => {
    expect(extract(/MEASUREMENT_ID_FALLBACK\s*=\s*"([^"]+)"/)).toBe(
      GOOGLE_ANALYTICS_MEASUREMENT_ID_FALLBACK,
    );
  });

  it("uses the same GA4 format pattern as the app constant", () => {
    expect(extract(/GA4_MEASUREMENT_ID_PATTERN\s*=\s*\/(.+)\/;/)).toBe(
      GA4_MEASUREMENT_ID_PATTERN.source,
    );
  });

  it("reads the connector env var", () => {
    expect(helper).toContain("VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY");
  });
});
