import { describe, expect, it } from "vitest";

import {
  POST_GROW_REFLECTION_DRY_RUN_HARNESS_VERSION,
  buildPostGrowReflectionDryRunScenarios,
  runPostGrowReflectionDryRunHarness,
  type PostGrowReflectionDryRunScenario,
} from "@/lib/ai/postGrowReflectionDryRunHarness";
import { POST_GROW_REFLECTION_ADAPTER_VERSION } from "@/lib/ai/postGrowReflectionAdapter";
import { createRichPhotoperiodReflectionContext } from "@/lib/ai/postGrowReflectionFixtures";
import { createUnsafeAutomationPostGrowReflectionOutput } from "@/lib/ai/postGrowReflectionOutputFixtures";

describe("runPostGrowReflectionDryRunHarness", () => {
  it("runs the default deterministic scenario suite", () => {
    const summary = runPostGrowReflectionDryRunHarness();

    expect(summary.harnessVersion).toBe(POST_GROW_REFLECTION_DRY_RUN_HARNESS_VERSION);
    expect(summary.adapterVersion).toBe(POST_GROW_REFLECTION_ADAPTER_VERSION);
    expect(summary.scenarioCount).toBe(5);
    expect(summary.passedCount).toBe(5);
    expect(summary.failedCount).toBe(0);
    expect(summary.validatedCount).toBe(1);
    expect(summary.rejectedCount).toBe(4);
    expect(summary.scenarios.map((scenario) => scenario.id)).toEqual([
      "rich-valid-output",
      "thin-high-confidence-rejected",
      "conflicting-overconfident-rejected",
      "rich-missing-evidence-rejected",
      "rich-unsafe-automation-rejected",
    ]);
  });

  it("summarizes safety reason codes from rejected candidates", () => {
    const summary = runPostGrowReflectionDryRunHarness();

    expect(summary.safetyIssueCodes).toEqual(
      expect.arrayContaining([
        "high_confidence_with_thin_data",
        "missing_evidence",
        "overconfident_language",
        "unsafe_language",
      ]),
    );
    expect(summary.scenarios.find((scenario) => scenario.id === "rich-unsafe-automation-rejected")?.issueCodes).toContain(
      "unsafe_language",
    );
    expect(summary.scenarios.find((scenario) => scenario.id === "thin-high-confidence-rejected")?.issueCodes).toContain(
      "high_confidence_with_thin_data",
    );
  });

  it("keeps repeated runs byte-for-byte deterministic at object level", () => {
    expect(runPostGrowReflectionDryRunHarness()).toEqual(runPostGrowReflectionDryRunHarness());
  });

  it("supports custom scenarios and reports expectation mismatches", () => {
    const scenario: PostGrowReflectionDryRunScenario = {
      id: "intentional-mismatch",
      label: "Mismatch proves failed harness count works",
      context: createRichPhotoperiodReflectionContext(),
      candidate: {
        source: "dry_run_fixture",
        rawOutput: createUnsafeAutomationPostGrowReflectionOutput(),
      },
      expectedStatus: "validated",
    };

    const summary = runPostGrowReflectionDryRunHarness([scenario]);

    expect(summary.scenarioCount).toBe(1);
    expect(summary.passedCount).toBe(0);
    expect(summary.failedCount).toBe(1);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.scenarios[0].actualStatus).toBe("rejected");
    expect(summary.scenarios[0].passed).toBe(false);
    expect(summary.scenarios[0].failureReason).toContain("unsafe_language");
  });

  it("exposes validation options for operator smoke-test diagnostics", () => {
    const summary = runPostGrowReflectionDryRunHarness();
    const thin = summary.scenarios.find((scenario) => scenario.id === "thin-high-confidence-rejected");

    expect(thin?.validationOptions).toEqual({
      sensorCoveragePct: 38,
      knownGapCount: 3,
      minEvidenceReferences: 2,
    });
  });
});

describe("buildPostGrowReflectionDryRunScenarios", () => {
  it("returns stable scenario metadata without running external work", () => {
    const scenarios = buildPostGrowReflectionDryRunScenarios();

    expect(scenarios).toHaveLength(5);
    expect(scenarios.every((scenario) => scenario.candidate.source === "dry_run_fixture")).toBe(true);
    expect(scenarios[0].context.grow_id).toBe("grow-reflection-rich-sour-diesel-001");
  });
});
