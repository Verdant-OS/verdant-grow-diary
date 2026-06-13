import { describe, it, expect } from "vitest";
import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";

describe("Google Analytics measurement ID constant", () => {
  it("is centralized and matches the required ID", () => {
    expect(GOOGLE_ANALYTICS_MEASUREMENT_ID).toBe("G-B3QRSZEM9S");
  });
});
