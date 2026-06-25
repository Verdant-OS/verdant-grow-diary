import {
  POST_GROW_REFLECTION_ADAPTER_VERSION,
  adaptPostGrowReflectionCandidate,
  type PostGrowReflectionAdapterCandidate,
} from "./postGrowReflectionAdapter";
import {
  createConflictingSignalsReflectionContext,
  createRichPhotoperiodReflectionContext,
  createThinAutoflowerReflectionContext,
} from "./postGrowReflectionFixtures";
import {
  createMissingEvidencePostGrowReflectionOutput,
  createOverconfidentPostGrowReflectionOutput,
  createUnsafeAutomationPostGrowReflectionOutput,
  createValidPostGrowReflectionOutput,
} from "./postGrowReflectionOutputFixtures";
import type { GrowContext, ReflectionConfidence } from "./postGrowReflectionTypes";
import type { PostGrowReflectionValidationIssue } from "./postGrowReflectionOutputValidator";

export const POST_GROW_REFLECTION_DRY_RUN_HARNESS_VERSION = "post-grow-reflection-dry-run-harness-v1";

export type PostGrowReflectionDryRunExpectedStatus = "validated" | "rejected";

export interface PostGrowReflectionDryRunScenario {
  id: string;
  label: string;
  context: GrowContext;
  candidate: PostGrowReflectionAdapterCandidate;
  expectedStatus: PostGrowReflectionDryRunExpectedStatus;
}

export interface PostGrowReflectionDryRunScenarioResult {
  id: string;
  label: string;
  growId: string;
  candidateSource: PostGrowReflectionAdapterCandidate["source"];
  expectedStatus: PostGrowReflectionDryRunExpectedStatus;
  actualStatus: PostGrowReflectionDryRunExpectedStatus;
  passed: boolean;
  issueCodes: string[];
  failureReason: string | null;
  outputConfidence: ReflectionConfidence | null;
  validationOptions: {
    sensorCoveragePct: number;
    knownGapCount: number;
    minEvidenceReferences: number;
  };
}

export interface PostGrowReflectionDryRunSummary {
  harnessVersion: typeof POST_GROW_REFLECTION_DRY_RUN_HARNESS_VERSION;
  adapterVersion: typeof POST_GROW_REFLECTION_ADAPTER_VERSION;
  scenarioCount: number;
  passedCount: number;
  failedCount: number;
  validatedCount: number;
  rejectedCount: number;
  safetyIssueCodes: string[];
  scenarios: PostGrowReflectionDryRunScenarioResult[];
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function issueCodes(issues: PostGrowReflectionValidationIssue[]): string[] {
  return uniqueSorted(issues.map((issue) => issue.code));
}

export function buildPostGrowReflectionDryRunScenarios(): PostGrowReflectionDryRunScenario[] {
  return [
    {
      id: "rich-valid-output",
      label: "Rich photoperiod context with valid evidence-backed candidate",
      context: createRichPhotoperiodReflectionContext(),
      candidate: {
        source: "dry_run_fixture",
        rawOutput: createValidPostGrowReflectionOutput(),
      },
      expectedStatus: "validated",
    },
    {
      id: "thin-high-confidence-rejected",
      label: "Thin autoflower context rejects high-confidence candidate",
      context: createThinAutoflowerReflectionContext(),
      candidate: {
        source: "dry_run_fixture",
        rawOutput: createValidPostGrowReflectionOutput(),
      },
      expectedStatus: "rejected",
    },
    {
      id: "conflicting-overconfident-rejected",
      label: "Conflicting context rejects certainty language",
      context: createConflictingSignalsReflectionContext(),
      candidate: {
        source: "dry_run_fixture",
        rawOutput: createOverconfidentPostGrowReflectionOutput(),
      },
      expectedStatus: "rejected",
    },
    {
      id: "rich-missing-evidence-rejected",
      label: "Rich context rejects generic candidate with missing evidence",
      context: createRichPhotoperiodReflectionContext(),
      candidate: {
        source: "dry_run_fixture",
        rawOutput: createMissingEvidencePostGrowReflectionOutput(),
      },
      expectedStatus: "rejected",
    },
    {
      id: "rich-unsafe-automation-rejected",
      label: "Rich context rejects unsafe equipment-control candidate",
      context: createRichPhotoperiodReflectionContext(),
      candidate: {
        source: "dry_run_fixture",
        rawOutput: createUnsafeAutomationPostGrowReflectionOutput(),
      },
      expectedStatus: "rejected",
    },
  ];
}

export function runPostGrowReflectionDryRunHarness(
  scenarios: PostGrowReflectionDryRunScenario[] = buildPostGrowReflectionDryRunScenarios(),
): PostGrowReflectionDryRunSummary {
  const results = scenarios.map<PostGrowReflectionDryRunScenarioResult>((scenario) => {
    const adapterResult = adaptPostGrowReflectionCandidate({
      context: scenario.context,
      candidate: scenario.candidate,
    });
    const actualStatus: PostGrowReflectionDryRunExpectedStatus =
      adapterResult.status === "validated" ? "validated" : "rejected";
    const codes = issueCodes(adapterResult.issues);
    const failureReason =
      adapterResult.status === "validation_failed" ? adapterResult.failureReason : null;
    const outputConfidence =
      adapterResult.status === "validated" ? adapterResult.output.confidence : null;

    return {
      id: scenario.id,
      label: scenario.label,
      growId: scenario.context.grow_id,
      candidateSource: scenario.candidate.source,
      expectedStatus: scenario.expectedStatus,
      actualStatus,
      passed: actualStatus === scenario.expectedStatus,
      issueCodes: codes,
      failureReason,
      outputConfidence,
      validationOptions: adapterResult.request.validationOptions,
    };
  });

  return {
    harnessVersion: POST_GROW_REFLECTION_DRY_RUN_HARNESS_VERSION,
    adapterVersion: POST_GROW_REFLECTION_ADAPTER_VERSION,
    scenarioCount: results.length,
    passedCount: results.filter((result) => result.passed).length,
    failedCount: results.filter((result) => !result.passed).length,
    validatedCount: results.filter((result) => result.actualStatus === "validated").length,
    rejectedCount: results.filter((result) => result.actualStatus === "rejected").length,
    safetyIssueCodes: uniqueSorted(results.flatMap((result) => result.issueCodes)),
    scenarios: results,
  };
}
