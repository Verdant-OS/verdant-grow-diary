import { describe, expect, it } from "vitest";

import { validatePostGrowReflectionCandidatePaste } from "@/lib/ai/postGrowReflectionCandidatePasteValidator";
import { buildPostGrowReflectionCandidateValidationSummary } from "@/lib/ai/postGrowReflectionCandidateValidationSummary";
import { findPostGrowReflectionEnvelopeSample } from "@/lib/ai/postGrowReflectionEnvelopeSamples";
import {
  createMalformedPostGrowReflectionOutput,
  createValidPostGrowReflectionOutput,
} from "@/lib/ai/postGrowReflectionOutputFixtures";

describe("buildPostGrowReflectionCandidateValidationSummary", () => {
  it("summarizes validated raw candidate without candidate body text", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createValidPostGrowReflectionOutput()),
    );
    const summary = buildPostGrowReflectionCandidateValidationSummary(result);

    expect(summary.status).toBe("validated");
    expect(summary.outcomeLabel).toBe("Validated locally");
    expect(summary.inputKindLabel).toBe("Raw candidate");
    expect(summary.safeToPersist).toBe(false);
    expect(summary.rows).toContainEqual({ label: "Confidence", value: "High" });
    expect(JSON.stringify(summary)).not.toContain("flower VPD averaged 1.21 kPa");
    expect(summary.note).toMatch(/excludes raw pasted JSON/i);
  });

  it("summarizes validated envelope metadata safely", () => {
    const sample = findPostGrowReflectionEnvelopeSample("valid_envelope");
    const result = validatePostGrowReflectionCandidatePaste(sample.jsonText);
    const summary = buildPostGrowReflectionCandidateValidationSummary(result);

    expect(summary.status).toBe("validated");
    expect(summary.inputKindLabel).toBe("Envelope");
    expect(summary.rows).toContainEqual({
      label: "Envelope source",
      value: "local deterministic envelope sample",
    });
    expect(summary.rows).toContainEqual({ label: "Envelope format", value: "object" });
  });

  it("summarizes envelope contract rejection", () => {
    const sample = findPostGrowReflectionEnvelopeSample("contract_rejected_missing_candidate");
    const result = validatePostGrowReflectionCandidatePaste(sample.jsonText);
    const summary = buildPostGrowReflectionCandidateValidationSummary(result);

    expect(summary.status).toBe("envelope_rejected");
    expect(summary.outcomeLabel).toBe("Rejected by envelope contract");
    expect(summary.rows).toContainEqual({ label: "Issue codes", value: "missing_candidate" });
    expect(summary.rows.find((row) => row.label === "Validation options")?.value).toBe(
      "not available",
    );
  });

  it("summarizes reflection validator rejection", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createMalformedPostGrowReflectionOutput()),
    );
    const summary = buildPostGrowReflectionCandidateValidationSummary(result);

    expect(summary.status).toBe("validation_failed");
    expect(summary.outcomeLabel).toBe("Rejected by reflection validator");
    expect(summary.rows.find((row) => row.label === "Issue codes")?.value).toContain(
      "invalid_type",
    );
  });

  it("summarizes invalid JSON without pasted text", () => {
    const result = validatePostGrowReflectionCandidatePaste("{not-json");
    const summary = buildPostGrowReflectionCandidateValidationSummary(result);

    expect(summary.status).toBe("invalid_json");
    expect(summary.outcomeLabel).toBe("Invalid JSON");
    expect(summary.inputKindLabel).toBe("No candidate");
    expect(JSON.stringify(summary)).not.toContain("{not-json");
  });

  it("is deterministic", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createValidPostGrowReflectionOutput()),
    );
    expect(buildPostGrowReflectionCandidateValidationSummary(result)).toEqual(
      buildPostGrowReflectionCandidateValidationSummary(result),
    );
  });
});
