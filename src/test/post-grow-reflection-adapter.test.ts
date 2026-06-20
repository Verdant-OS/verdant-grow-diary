import { describe, expect, it } from "vitest";

import {
  POST_GROW_REFLECTION_ADAPTER_VERSION,
  adaptPostGrowReflectionCandidate,
  buildPostGrowReflectionAdapterRequest,
} from "@/lib/ai/postGrowReflectionAdapter";
import { POST_GROW_REFLECTION_PROMPT_VERSION } from "@/lib/ai/postGrowReflectionPrompt";
import {
  createRichPhotoperiodReflectionContext,
  createThinAutoflowerReflectionContext,
} from "@/lib/ai/postGrowReflectionFixtures";
import {
  createMalformedPostGrowReflectionOutput,
  createUnsafeAutomationPostGrowReflectionOutput,
  createValidPostGrowReflectionOutput,
} from "@/lib/ai/postGrowReflectionOutputFixtures";

describe("buildPostGrowReflectionAdapterRequest", () => {
  it("builds a deterministic adapter request from GrowContext", () => {
    const context = createRichPhotoperiodReflectionContext();
    const request = buildPostGrowReflectionAdapterRequest(context);

    expect(request.adapterVersion).toBe(POST_GROW_REFLECTION_ADAPTER_VERSION);
    expect(request.promptVersion).toBe(POST_GROW_REFLECTION_PROMPT_VERSION);
    expect(request.growId).toBe("grow-reflection-rich-sour-diesel-001");
    expect(request.growName).toBe("Sour Diesel 4x4 Spring Run");
    expect(request.prompt).toContain('"sensor_coverage_pct": 92');
    expect(request.metadata).toEqual({
      sensorCoveragePct: 92,
      knownGapCount: 0,
      eventCount: 4,
      sourceTags: ["live", "manual"],
    });
    expect(request.validationOptions).toEqual({
      sensorCoveragePct: 92,
      knownGapCount: 0,
      minEvidenceReferences: 2,
    });
    expect(buildPostGrowReflectionAdapterRequest(context)).toEqual(request);
  });

  it("derives stricter validation options for thin context", () => {
    const request = buildPostGrowReflectionAdapterRequest(createThinAutoflowerReflectionContext(), {
      minEvidenceReferences: 3,
    });

    expect(request.validationOptions).toEqual({
      sensorCoveragePct: 38,
      knownGapCount: 3,
      minEvidenceReferences: 3,
    });
    expect(request.metadata.sourceTags).toEqual(["manual"]);
  });
});

describe("adaptPostGrowReflectionCandidate", () => {
  it("returns ReflectionOutput only after validation passes", () => {
    const result = adaptPostGrowReflectionCandidate({
      context: createRichPhotoperiodReflectionContext(),
      candidate: {
        source: "dry_run_fixture",
        rawOutput: createValidPostGrowReflectionOutput(),
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("validated");
      expect(result.output.executive_reflection).toContain("1.21 kPa");
      expect(result.issues).toEqual([]);
    }
  });

  it("accepts JSON string candidates and validates them", () => {
    const result = adaptPostGrowReflectionCandidate({
      context: createRichPhotoperiodReflectionContext(),
      candidate: {
        source: "external_candidate",
        rawOutput: JSON.stringify(createValidPostGrowReflectionOutput()),
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output.confidence).toBe("High");
  });

  it("returns structured failure for malformed candidates", () => {
    const result = adaptPostGrowReflectionCandidate({
      context: createRichPhotoperiodReflectionContext(),
      candidate: {
        source: "dry_run_fixture",
        rawOutput: createMalformedPostGrowReflectionOutput(),
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe("validation_failed");
      expect(result.output).toBeNull();
      expect(result.failureReason).toContain("invalid_type");
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("returns structured failure for unsafe equipment-control candidates", () => {
    const result = adaptPostGrowReflectionCandidate({
      context: createRichPhotoperiodReflectionContext(),
      candidate: {
        source: "dry_run_fixture",
        rawOutput: createUnsafeAutomationPostGrowReflectionOutput(),
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureReason).toContain("unsafe_language");
      expect(result.issues.some((issue) => issue.code === "unsafe_language")).toBe(true);
    }
  });

  it("lowers trust for thin context by rejecting high-confidence output", () => {
    const result = adaptPostGrowReflectionCandidate({
      context: createThinAutoflowerReflectionContext(),
      candidate: {
        source: "dry_run_fixture",
        rawOutput: createValidPostGrowReflectionOutput(),
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failureReason).toContain("high_confidence_with_thin_data");
  });
});
