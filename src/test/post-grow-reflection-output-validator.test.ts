import { describe, expect, it } from "vitest";

import {
  validatePostGrowReflectionOutput,
  type PostGrowReflectionValidationIssue,
} from "@/lib/ai/postGrowReflectionOutputValidator";
import {
  createMalformedPostGrowReflectionOutput,
  createMissingEvidencePostGrowReflectionOutput,
  createOverconfidentPostGrowReflectionOutput,
  createUnsafeAutomationPostGrowReflectionOutput,
  createValidPostGrowReflectionOutput,
} from "@/lib/ai/postGrowReflectionOutputFixtures";

function codes(issues: PostGrowReflectionValidationIssue[]): string[] {
  return issues.map((issue) => issue.code).sort();
}

describe("validatePostGrowReflectionOutput", () => {
  it("accepts a valid evidence-backed reflection output object", () => {
    const result = validatePostGrowReflectionOutput(createValidPostGrowReflectionOutput(), {
      sensorCoveragePct: 92,
      knownGapCount: 0,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe("High");
      expect(result.value.post_harvest_specific_insights[0]).toContain("1420 g");
    }
  });

  it("accepts valid JSON string output and returns typed output", () => {
    const raw = JSON.stringify(createValidPostGrowReflectionOutput());
    const result = validatePostGrowReflectionOutput(raw, { sensorCoveragePct: 92 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.executive_reflection).toContain("1.21 kPa");
  });

  it("rejects invalid JSON string output", () => {
    const result = validatePostGrowReflectionOutput("{not-json");

    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toContain("invalid_json");
  });

  it("rejects malformed output shape and invalid confidence", () => {
    const result = validatePostGrowReflectionOutput(createMalformedPostGrowReflectionOutput());

    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toEqual(
      expect.arrayContaining(["invalid_type", "invalid_confidence", "missing_field"]),
    );
  });

  it("rejects overconfident language and high confidence with known gaps", () => {
    const result = validatePostGrowReflectionOutput(createOverconfidentPostGrowReflectionOutput(), {
      sensorCoveragePct: 62,
      knownGapCount: 1,
    });

    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toEqual(
      expect.arrayContaining(["overconfident_language", "high_confidence_with_thin_data"]),
    );
  });

  it("rejects outputs that do not include enough explicit evidence", () => {
    const result = validatePostGrowReflectionOutput(createMissingEvidencePostGrowReflectionOutput(), {
      minEvidenceReferences: 2,
    });

    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toContain("missing_evidence");
  });

  it("rejects unsafe automation and equipment-control language", () => {
    const result = validatePostGrowReflectionOutput(createUnsafeAutomationPostGrowReflectionOutput(), {
      sensorCoveragePct: 92,
    });

    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toContain("unsafe_language");
  });
});
