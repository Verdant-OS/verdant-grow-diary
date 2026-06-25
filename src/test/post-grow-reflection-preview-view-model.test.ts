import { describe, expect, it } from "vitest";

import {
  POST_GROW_REFLECTION_PREVIEW_LABELS,
  buildPostGrowReflectionPreviewViewModel,
} from "@/lib/ai/postGrowReflectionPreviewViewModel";
import {
  buildPostGrowReflectionDryRunScenarios,
  runPostGrowReflectionDryRunHarness,
} from "@/lib/ai/postGrowReflectionDryRunHarness";

describe("buildPostGrowReflectionPreviewViewModel", () => {
  it("selects the validated dry-run scenario and exposes confidence + sections", () => {
    const vm = buildPostGrowReflectionPreviewViewModel();
    expect(vm.status).toBe("present");
    if (vm.status !== "present") return;
    expect(vm.scenarioId).toBe("rich-valid-output");
    expect(vm.confidence).toBe("High");
    expect(vm.confidenceLabel).toBe("Confidence: High");
    const keys = vm.sections.map((s) => s.key);
    expect(keys).toEqual([
      "executive_reflection",
      "key_wins",
      "repeat_next_run",
      "adjust_or_avoid",
      "post_harvest_specific_insights",
      "pheno_strain_notes",
      "low_risk_experiments",
      "gaps",
    ]);
    const exec = vm.sections.find((s) => s.key === "executive_reflection");
    expect(exec?.kind).toBe("paragraph");
    expect(exec?.paragraph?.length ?? 0).toBeGreaterThan(0);
    const wins = vm.sections.find((s) => s.key === "key_wins");
    expect(wins?.kind).toBe("list");
    expect((wins?.items ?? []).length).toBeGreaterThan(0);
  });

  it("includes operator/dry-run/not-saved/no-live-AI labels", () => {
    const vm = buildPostGrowReflectionPreviewViewModel();
    const texts = vm.labels.map((label) => label.text);
    expect(texts).toContain(POST_GROW_REFLECTION_PREVIEW_LABELS.operatorPreview);
    expect(texts).toContain(POST_GROW_REFLECTION_PREVIEW_LABELS.dryRunFixture);
    expect(texts).toContain(POST_GROW_REFLECTION_PREVIEW_LABELS.validatedOutput);
    expect(texts).toContain(POST_GROW_REFLECTION_PREVIEW_LABELS.notSaved);
    expect(texts).toContain(POST_GROW_REFLECTION_PREVIEW_LABELS.noLiveAiCall);
  });

  it("keeps validation options visible on the preview", () => {
    const vm = buildPostGrowReflectionPreviewViewModel();
    expect(vm.status).toBe("present");
    if (vm.status !== "present") return;
    expect(vm.validationOptions.label).toMatch(/sensorCoveragePct=/);
    expect(vm.validationOptions.label).toMatch(/knownGapCount=/);
    expect(vm.validationOptions.label).toMatch(/minEvidenceReferences=/);
    expect(vm.validationOptions.minEvidenceReferences).toBeGreaterThanOrEqual(1);
  });

  it("returns the empty state when no scenarios validate", () => {
    const rejectingScenarios = buildPostGrowReflectionDryRunScenarios().filter(
      (s) => s.expectedStatus === "rejected",
    );
    const summary = runPostGrowReflectionDryRunHarness(rejectingScenarios);
    const vm = buildPostGrowReflectionPreviewViewModel({
      scenarios: rejectingScenarios,
      summary,
    });
    expect(vm.status).toBe("empty");
    if (vm.status !== "empty") return;
    expect(vm.emptyMessage).toMatch(/No validated reflection preview is available/);
    expect(vm.emptyMessage).toMatch(/Review rejected scenarios/);
    // labels still preserved on empty state
    const texts = vm.labels.map((label) => label.text);
    expect(texts).toContain(POST_GROW_REFLECTION_PREVIEW_LABELS.operatorPreview);
    expect(texts).toContain(POST_GROW_REFLECTION_PREVIEW_LABELS.noLiveAiCall);
  });
});
