import {
  POST_GROW_REFLECTION_DRY_RUN_HARNESS_VERSION,
  runPostGrowReflectionDryRunHarness,
  type PostGrowReflectionDryRunSummary,
} from "./postGrowReflectionDryRunHarness";

export interface PostGrowReflectionOperatorDiagnosticsMetric {
  label: string;
  value: string;
  helper: string;
}

export interface PostGrowReflectionOperatorDiagnosticsScenarioRow {
  id: string;
  label: string;
  growId: string;
  expectedStatus: string;
  actualStatus: string;
  passedLabel: "Pass" | "Fail";
  issueCodesLabel: string;
  failureReasonLabel: string;
  validationOptionsLabel: string;
}

export interface PostGrowReflectionOperatorDiagnosticsViewModel {
  title: string;
  subtitle: string;
  route: "/operator/post-grow-reflection-dry-run";
  harnessVersion: typeof POST_GROW_REFLECTION_DRY_RUN_HARNESS_VERSION;
  statusLabel: "Green" | "Needs review";
  statusDetail: string;
  metrics: PostGrowReflectionOperatorDiagnosticsMetric[];
  safetyIssueCodesLabel: string;
  scenarios: PostGrowReflectionOperatorDiagnosticsScenarioRow[];
  safetyRules: string[];
}

function countLabel(value: number): string {
  return String(value);
}

function listLabel(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function validationOptionsLabel(options: {
  sensorCoveragePct: number;
  knownGapCount: number;
  minEvidenceReferences: number;
}): string {
  return `sensorCoveragePct=${options.sensorCoveragePct}; knownGapCount=${options.knownGapCount}; minEvidenceReferences=${options.minEvidenceReferences}`;
}

export function buildPostGrowReflectionOperatorDiagnosticsViewModel(
  summary: PostGrowReflectionDryRunSummary = runPostGrowReflectionDryRunHarness(),
): PostGrowReflectionOperatorDiagnosticsViewModel {
  const isGreen = summary.failedCount === 0;

  return {
    title: "Post-Grow Reflection Dry-Run",
    subtitle:
      "Operator-only diagnostics for the fixture harness. This page reads deterministic local fixtures only and does not generate, save, or send reflection data.",
    route: "/operator/post-grow-reflection-dry-run",
    harnessVersion: summary.harnessVersion,
    statusLabel: isGreen ? "Green" : "Needs review",
    statusDetail: isGreen
      ? "All dry-run scenario expectations passed."
      : "One or more dry-run scenario expectations failed; inspect the scenario table before exposing reflection surfaces.",
    metrics: [
      {
        label: "Scenarios",
        value: countLabel(summary.scenarioCount),
        helper: "Fixture scenarios executed through the adapter.",
      },
      {
        label: "Passed",
        value: countLabel(summary.passedCount),
        helper: "Scenario expectations matched adapter results.",
      },
      {
        label: "Failed",
        value: countLabel(summary.failedCount),
        helper: "Scenario expectations that did not match adapter results.",
      },
      {
        label: "Validated",
        value: countLabel(summary.validatedCount),
        helper: "Candidates accepted as ReflectionOutput.",
      },
      {
        label: "Rejected",
        value: countLabel(summary.rejectedCount),
        helper: "Candidates blocked by validation.",
      },
    ],
    safetyIssueCodesLabel: listLabel(summary.safetyIssueCodes),
    scenarios: summary.scenarios.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      growId: scenario.growId,
      expectedStatus: scenario.expectedStatus,
      actualStatus: scenario.actualStatus,
      passedLabel: scenario.passed ? "Pass" : "Fail",
      issueCodesLabel: listLabel(scenario.issueCodes),
      failureReasonLabel: scenario.failureReason ?? "none",
      validationOptionsLabel: validationOptionsLabel(scenario.validationOptions),
    })),
    safetyRules: [
      "Operator-only route. Do not add grower-facing navigation.",
      "Fixture harness only. Do not call a model or provider.",
      "No Supabase, persistence, schema, or report UI wiring in this slice.",
      "Rejected scenarios must stay visible so unsafe output is not mistaken for healthy output.",
    ],
  };
}
