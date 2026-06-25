/**
 * Static test: confirms the measurement ID is centralized in
 * src/constants/analytics.ts and equals the expected value.
 */
import { describe, it, expect } from "vitest";
import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";

describe("Google Analytics measurement ID constant", () => {
  it("exports the correct measurement ID", () => {
    expect(GOOGLE_ANALYTICS_MEASUREMENT_ID).toBe("G-B3QRSZEM9S");
  });

  it("is a non-empty string", () => {
    expect(typeof GOOGLE_ANALYTICS_MEASUREMENT_ID).toBe("string");
    expect(GOOGLE_ANALYTICS_MEASUREMENT_ID.length).toBeGreaterThan(0);
  });

  it("follows GA4 measurement ID format G-XXXXXXXXXX", () => {
    expect(GOOGLE_ANALYTICS_MEASUREMENT_ID).toMatch(/^G-[A-Z0-9]{10}$/);
  });
});
