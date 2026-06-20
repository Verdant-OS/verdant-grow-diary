import { describe, expect, it } from "vitest";

import { validatePostGrowReflectionCandidatePaste } from "@/lib/ai/postGrowReflectionCandidatePasteValidator";
import { createThinAutoflowerReflectionContext } from "@/lib/ai/postGrowReflectionFixtures";
import {
  createMalformedPostGrowReflectionOutput,
  createUnsafeAutomationPostGrowReflectionOutput,
  createValidPostGrowReflectionOutput,
} from "@/lib/ai/postGrowReflectionOutputFixtures";

const envelopeKind = "post_grow_reflection_candidate";

describe("validatePostGrowReflectionCandidatePaste", () => {
  it("returns idle before the operator validates a paste", () => {
    const result = validatePostGrowReflectionCandidatePaste();
    expect(result.status).toBe("idle");
    expect(result.message).toMatch(/Paste a candidate ReflectionOutput JSON or candidate envelope/);
  });

  it("returns empty state for blank pasted text", () => {
    const result = validatePostGrowReflectionCandidatePaste("   ");
    expect(result.status).toBe("empty");
    expect(result.message).toMatch(/Paste a candidate before validating/);
  });

  it("returns invalid_json for malformed JSON", () => {
    const result = validatePostGrowReflectionCandidatePaste("{not-json");
    expect(result.status).toBe("invalid_json");
    if (result.status !== "invalid_json") return;
    expect(result.message).toBe("Pasted candidate is not valid JSON.");
    expect(result.parseError.length).toBeGreaterThan(0);
  });

  it("validates a known good raw candidate", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createValidPostGrowReflectionOutput()),
    );
    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;
    expect(result.inputKind).toBe("raw_candidate");
    expect(result.envelopeMetadata).toBeNull();
    expect(result.confidence).toBe("High");
    expect(result.confidenceLabel).toBe("Confidence: High");
    expect(result.sections.map((section) => section.key)).toEqual([
      "executive_reflection",
      "key_wins",
      "repeat_next_run",
      "adjust_or_avoid",
      "post_harvest_specific_insights",
      "pheno_strain_notes",
      "low_risk_experiments",
      "gaps",
    ]);
    expect(result.validationOptions.label).toMatch(/sensorCoveragePct=/);
  });

  it("validates a candidate envelope and exposes safe metadata", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify({
        kind: envelopeKind,
        candidate: createValidPostGrowReflectionOutput(),
        metadata: {
          sourceLabel: "manual envelope sample",
          requestLabel: "candidate-envelope-001",
          createdAt: "2026-06-20T15:00:00.000Z",
        },
      }),
    );

    expect(result.status).toBe("validated");
    if (result.status !== "validated") return;
    expect(result.inputKind).toBe("envelope");
    expect(result.labels.map((label) => label.text)).toContain("Envelope paste");
    expect(result.envelopeMetadata).toEqual({
      sourceLabel: "manual envelope sample",
      requestLabel: "candidate-envelope-001",
      createdAt: "2026-06-20T15:00:00.000Z",
      candidateFormat: "object",
      label:
        "sourceLabel=manual envelope sample; requestLabel=candidate-envelope-001; createdAt=2026-06-20T15:00:00.000Z; candidateFormat=object",
    });
  });

  it("rejects an invalid candidate envelope before reflection validation", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify({
        kind: envelopeKind,
        metadata: { sourceLabel: "missing candidate" },
      }),
    );

    expect(result.status).toBe("envelope_rejected");
    if (result.status !== "envelope_rejected") return;
    expect(result.issueCodes).toContain("missing_candidate");
    expect(result.failureReason).toMatch(/missing candidate/i);
  });

  it("rejects malformed candidate shape", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createMalformedPostGrowReflectionOutput()),
    );
    expect(result.status).toBe("validation_failed");
    if (result.status !== "validation_failed") return;
    expect(result.inputKind).toBe("raw_candidate");
    expect(result.issueCodes).toContain("invalid_type");
    expect(result.failureReason).toContain("invalid_type");
  });

  it("rejects unsafe equipment-control candidate text", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createUnsafeAutomationPostGrowReflectionOutput()),
    );
    expect(result.status).toBe("validation_failed");
    if (result.status !== "validation_failed") return;
    expect(result.issueCodes).toContain("unsafe_language");
    expect(result.failureReason).toContain("unsafe_language");
  });

  it("keeps high-confidence output rejected when a thin context is supplied", () => {
    const result = validatePostGrowReflectionCandidatePaste(
      JSON.stringify(createValidPostGrowReflectionOutput()),
      { context: createThinAutoflowerReflectionContext() },
    );
    expect(result.status).toBe("validation_failed");
    if (result.status !== "validation_failed") return;
    expect(result.issueCodes).toContain("high_confidence_with_thin_data");
  });

  it("is deterministic for repeated validation", () => {
    const raw = JSON.stringify(createValidPostGrowReflectionOutput());
    expect(validatePostGrowReflectionCandidatePaste(raw)).toEqual(
      validatePostGrowReflectionCandidatePaste(raw),
    );
  });
});
