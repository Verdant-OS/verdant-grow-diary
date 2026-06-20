import { describe, expect, it } from "vitest";

import { buildPostGrowReflectionOperatorDiagnosticsViewModel } from "@/lib/ai/postGrowReflectionOperatorDiagnosticsViewModel";
import { runPostGrowReflectionDryRunHarness } from "@/lib/ai/postGrowReflectionDryRunHarness";

describe("buildPostGrowReflectionOperatorDiagnosticsViewModel", () => {
  it("summarizes the default dry-run harness as green", () => {
    const viewModel = buildPostGrowReflectionOperatorDiagnosticsViewModel();

    expect(viewModel.route).toBe("/operator/post-grow-reflection-dry-run");
    expect(viewModel.statusLabel).toBe("Green");
    expect(viewModel.statusDetail).toMatch(/All dry-run scenario expectations passed/i);
    expect(viewModel.metrics.map((metric) => [metric.label, metric.value])).toEqual([
      ["Scenarios", "5"],
      ["Passed", "5"],
      ["Failed", "0"],
      ["Validated", "1"],
      ["Rejected", "4"],
    ]);
  });

  it("exposes safety reason codes and scenario rows", () => {
    const viewModel = buildPostGrowReflectionOperatorDiagnosticsViewModel();

    expect(viewModel.safetyIssueCodesLabel).toContain("unsafe_language");
    expect(viewModel.safetyIssueCodesLabel).toContain("missing_evidence");
    expect(viewModel.scenarios).toHaveLength(5);
    expect(viewModel.scenarios[0]).toMatchObject({
      id: "rich-valid-output",
      expectedStatus: "validated",
      actualStatus: "validated",
      passedLabel: "Pass",
      issueCodesLabel: "none",
      failureReasonLabel: "none",
    });
    expect(
      viewModel.scenarios.find((scenario) => scenario.id === "rich-unsafe-automation-rejected")?.issueCodesLabel,
    ).toContain("unsafe_language");
  });

  it("marks the panel as needs-review when a supplied summary has failures", () => {
    const summary = runPostGrowReflectionDryRunHarness();
    const viewModel = buildPostGrowReflectionOperatorDiagnosticsViewModel({
      ...summary,
      failedCount: 1,
      passedCount: summary.passedCount - 1,
    });

    expect(viewModel.statusLabel).toBe("Needs review");
    expect(viewModel.statusDetail).toMatch(/inspect the scenario table/i);
    expect(viewModel.metrics.find((metric) => metric.label === "Failed")?.value).toBe("1");
  });

  it("states operator-only guardrails", () => {
    const viewModel = buildPostGrowReflectionOperatorDiagnosticsViewModel();

    expect(viewModel.safetyRules.join("\n")).toMatch(/Operator-only route/i);
    expect(viewModel.safetyRules.join("\n")).toMatch(/Do not call a model or provider/i);
    expect(viewModel.safetyRules.join("\n")).toMatch(/No Supabase, persistence, schema, or report UI wiring/i);
  });
});
