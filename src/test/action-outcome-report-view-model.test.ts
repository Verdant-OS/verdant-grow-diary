/**
 * Post-Action Outcome Analysis — report view model (read-only labels).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildActionOutcomeReportViewModel } from "@/lib/actionOutcomeReportViewModel";
import type { ActionOutcomeAnalysisReceipt } from "@/lib/actionOutcomeAnalysisTypes";

const ROOT = resolve(__dirname, "../..");

function baseReceipt(
  overrides: Partial<ActionOutcomeAnalysisReceipt> = {},
): ActionOutcomeAnalysisReceipt {
  return {
    schemaVersion: "1",
    actionQueueId: "aq-1",
    classification: "mixed",
    confidenceScore: 55,
    confidenceLevel: "medium",
    riskLevel: "watch",
    growerReportedOutcome: "too_soon",
    evidenceAgreement: "partially_agrees",
    summary: "Summary text.",
    metricComparisons: [
      {
        metric: "vpd_kpa",
        preValue: 1.9,
        postValue: 1.4,
        preTargetDistance: 0.3,
        postTargetDistance: 0,
        direction: "improved",
        evidenceQuality: "medium",
        sampleCounts: { pre: 2, post: 2 },
        explanation: "vpd_kpa moved closer to the grow target.",
      },
    ],
    supportingEvidence: ["vpd improved"],
    conflictingEvidence: [],
    missingInformation: ["No grow targets are configured."],
    cautions: ["Do not make additional large changes yet."],
    repeatNextRun: ["Collect another follow-up snapshot."],
    avoidNextRun: [],
    evidenceWindow: {
      actionCompletedAt: "2026-07-10T12:00:00.000Z",
      preWindowStart: "2026-07-09T12:00:00.000Z",
      preWindowEnd: "2026-07-10T12:00:00.000Z",
      postWindowStart: "2026-07-10T12:00:00.000Z",
      postWindowEnd: "2026-07-11T12:00:00.000Z",
    },
    ...overrides,
  };
}

describe("labels", () => {
  it.each([
    ["improved", "Evidence improved"],
    ["unchanged", "No clear change"],
    ["declined", "Evidence declined"],
    ["mixed", "Mixed evidence"],
    ["insufficient_evidence", "Not enough evidence"],
  ] as const)("classification %s → %s", (classification, label) => {
    const vm = buildActionOutcomeReportViewModel(baseReceipt({ classification }));
    expect(vm.classificationLabel).toBe(label);
  });

  it.each([
    ["agrees", "Grower and evidence agree"],
    ["partially_agrees", "Grower and evidence partially agree"],
    ["conflicts", "Grower and evidence disagree — more evidence needed"],
    ["not_comparable", "Not directly comparable"],
    ["no_grower_outcome", "No grower outcome recorded yet"],
  ] as const)("agreement %s → %s", (agreement, label) => {
    const vm = buildActionOutcomeReportViewModel(baseReceipt({ evidenceAgreement: agreement }));
    expect(vm.agreementLabel).toBe(label);
  });

  it("confidence label carries the band and the score", () => {
    const vm = buildActionOutcomeReportViewModel(baseReceipt());
    expect(vm.confidenceLabel).toBe("Medium confidence (55/100)");
  });

  it("metric rows format values and preserve explanations verbatim", () => {
    const vm = buildActionOutcomeReportViewModel(baseReceipt());
    expect(vm.metrics[0]).toEqual({
      metricLabel: "VPD (kPa)",
      directionLabel: "Improved",
      preValue: "1.90",
      postValue: "1.40",
      qualityLabel: "Moderate evidence",
      explanation: "vpd_kpa moved closer to the grow target.",
    });
  });

  it("arrays are copied, never aliased (read-only projection)", () => {
    const receipt = baseReceipt();
    const vm = buildActionOutcomeReportViewModel(receipt);
    vm.cautions.push("mutated");
    expect(receipt.cautions).toEqual(["Do not make additional large changes yet."]);
  });
});

describe("static hygiene", () => {
  it("view model has no React import and no JSX", () => {
    const src = readFileSync(join(ROOT, "src/lib/actionOutcomeReportViewModel.ts"), "utf8");
    expect(src).not.toMatch(/from ["']react["']/);
    expect(src).not.toMatch(/<[A-Z][A-Za-z]*[\s/>]/);
  });
});
