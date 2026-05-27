import { describe, it, expect } from "vitest";
import {
  harmonizeDiagnosisConfidence,
  isDisplayedConfidenceLow,
  CONFIDENCE_CEILING_CAPS,
  CONFIDENCE_LIMITED_COPY,
} from "@/lib/aiDoctorConfidenceRules";

describe("aiDoctorConfidenceRules", () => {
  it("caps raw confidence above the medium ceiling", () => {
    const h = harmonizeDiagnosisConfidence(0.95, "medium");
    expect(h.rawConfidence).toBe(0.95);
    expect(h.displayedConfidence).toBe(CONFIDENCE_CEILING_CAPS.medium);
    expect(h.wasCapped).toBe(true);
    expect(h.limitedCopy).toBe(CONFIDENCE_LIMITED_COPY);
  });

  it("caps raw confidence above the low ceiling", () => {
    const h = harmonizeDiagnosisConfidence(0.9, "low");
    expect(h.displayedConfidence).toBe(CONFIDENCE_CEILING_CAPS.low);
    expect(h.wasCapped).toBe(true);
  });

  it("preserves confidence below the ceiling", () => {
    const h = harmonizeDiagnosisConfidence(0.4, "medium");
    expect(h.displayedConfidence).toBe(0.4);
    expect(h.wasCapped).toBe(false);
    expect(h.limitedCopy).toBe(null);
  });

  it("does not cap when ceiling is high", () => {
    const h = harmonizeDiagnosisConfidence(0.92, "high");
    expect(h.displayedConfidence).toBe(0.92);
    expect(h.wasCapped).toBe(false);
  });

  it("clamps invalid / out-of-range raw confidence to [0,1]", () => {
    expect(harmonizeDiagnosisConfidence(1.5, "high").displayedConfidence).toBe(1);
    expect(harmonizeDiagnosisConfidence(-1, "high").displayedConfidence).toBe(0);
    expect(harmonizeDiagnosisConfidence(NaN, "high").displayedConfidence).toBe(0);
    expect(
      harmonizeDiagnosisConfidence("nope" as unknown, "medium").displayedConfidence,
    ).toBe(0);
  });

  it("defaults to high ceiling when ceiling is missing or invalid", () => {
    const h = harmonizeDiagnosisConfidence(0.8, null);
    expect(h.ceiling).toBe("high");
    expect(h.displayedConfidence).toBe(0.8);
  });

  it("flags displayed confidence as low when below threshold", () => {
    const capped = harmonizeDiagnosisConfidence(0.9, "low");
    expect(isDisplayedConfidenceLow(capped)).toBe(true);
    const high = harmonizeDiagnosisConfidence(0.9, "high");
    expect(isDisplayedConfidenceLow(high)).toBe(false);
  });
});
