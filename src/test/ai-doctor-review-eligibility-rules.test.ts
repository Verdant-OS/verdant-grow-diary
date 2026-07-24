import { describe, expect, it } from "vitest";
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";
import type { ImportedSensorHistorySection } from "@/lib/aiDoctorContextCompiler";
import type { CsvHistorySensorRowLike } from "@/lib/aiDoctorCsvHistoryContextRules";
import {
  AI_DOCTOR_HISTORICAL_REVIEW_MIN_VALID_OBSERVATIONS,
  evaluateAiDoctorReviewEligibility,
} from "@/lib/aiDoctorReviewEligibilityRules";

function context(
  readiness: AiDoctorContextResult["readiness"],
  hasPlantProfile = true,
): AiDoctorContextResult {
  return {
    readiness,
    missing: [],
    evidence: hasPlantProfile ? ["plant-profile"] : [],
    counts: {
      recentEvents: 0,
      recentWateringOrFeeding: 0,
      recentManualSnapshots: 0,
      recentWarnings: 0,
    },
    latest: { manualSnapshotAt: null },
    safeNextStep: "",
    diagnosisClaimed: false,
  };
}

function history(
  overrides: Partial<ImportedSensorHistorySection> = {},
): ImportedSensorHistorySection {
  return {
    hasCsvHistory: true,
    historicalLabel: "CSV history",
    notForLiveDiagnosis:
      "This is imported CSV history, not live telemetry. Do not diagnose from CSV history alone.",
    totalReadings: 2,
    dateRange: {
      earliest: "2026-06-01T10:00:00.000Z",
      latest: "2026-06-02T10:00:00.000Z",
    },
    vendors: [],
    metrics: [{ metric: "temperature_c", unit: "C", count: 2, min: 23, max: 25, avg: 24 }],
    excludedQualityCount: 0,
    suspiciousFlagCount: 0,
    sectionLabel: "Imported sensor history",
    guidance: [],
    ...overrides,
  };
}

function row(
  captured_at: string,
  overrides: Partial<CsvHistorySensorRowLike> = {},
): CsvHistorySensorRowLike {
  return {
    metric: "temperature_c",
    value: 24,
    unit: "C",
    captured_at,
    source: "csv",
    quality: "ok",
    ...overrides,
  };
}

const historicalRows = [
  row("2026-06-01T10:00:00.000Z"),
  row("2026-06-02T10:00:00.000Z", { value: 25 }),
];

describe("AI Doctor review eligibility", () => {
  it.each(["partial", "strong"] as const)(
    "preserves the existing %s context path without CSV history",
    (readiness) => {
      expect(
        evaluateAiDoctorReviewEligibility({
          context: context(readiness),
          hasPlantProfile: true,
          importedHistory: null,
          missingLiveSensorReadings: true,
        }),
      ).toEqual({
        allowed: true,
        mode: "standard",
        reason: "context_ready",
        validObservationCount: 0,
      });
    },
  );

  it("opens only a limited historical review for sufficient sanitized CSV history", () => {
    const result = evaluateAiDoctorReviewEligibility({
      context: context("insufficient"),
      hasPlantProfile: true,
      importedHistory: history(),
      historicalRows,
      missingLiveSensorReadings: true,
    });

    expect(result).toEqual({
      allowed: true,
      mode: "historical_review",
      reason: "historical_context_ready",
      validObservationCount: AI_DOCTOR_HISTORICAL_REVIEW_MIN_VALID_OBSERVATIONS,
    });
  });

  it("fails closed without a real plant profile", () => {
    const result = evaluateAiDoctorReviewEligibility({
      context: context("insufficient", false),
      hasPlantProfile: false,
      importedHistory: history(),
      historicalRows,
      missingLiveSensorReadings: true,
    });
    expect(result).toMatchObject({
      allowed: false,
      mode: "blocked",
      reason: "missing_plant_profile",
    });
  });

  it.each([
    ["empty history", null, historicalRows, "missing_csv_history"],
    [
      "one numeric observation",
      history(),
      [row("2026-06-01T10:00:00.000Z")],
      "too_few_valid_observations",
    ],
    [
      "one historical timestamp",
      history(),
      [row("2026-06-01T10:00:00.000Z"), row("2026-06-01T10:00:00.000Z", { value: 25 })],
      "single_historical_timestamp",
    ],
    [
      "malformed historical timestamps",
      history(),
      [row("not-a-date"), row("also-not-a-date")],
      "too_few_valid_observations",
    ],
  ] as const)("blocks %s", (_label, importedHistory, rows, reason) => {
    const result = evaluateAiDoctorReviewEligibility({
      context: context("insufficient"),
      hasPlantProfile: true,
      importedHistory,
      historicalRows: rows,
      missingLiveSensorReadings: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe("blocked");
    expect(result.reason).toBe(reason);
  });

  it("does not let a later nonnumeric row make one valid timestamp look longitudinal", () => {
    const sameTimestamp = "2026-06-01T10:00:00.000Z";
    const result = evaluateAiDoctorReviewEligibility({
      context: context("insufficient"),
      hasPlantProfile: true,
      importedHistory: history({
        dateRange: {
          earliest: sameTimestamp,
          latest: "2026-06-02T10:00:00.000Z",
        },
      }),
      historicalRows: [
        row(sameTimestamp),
        row(sameTimestamp, { metric: "humidity_pct", value: 55 }),
        row("2026-06-02T10:00:00.000Z", { value: "not-a-number" }),
      ],
      missingLiveSensorReadings: true,
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: "single_historical_timestamp",
      validObservationCount: 2,
    });
  });

  it.each(["degraded", "stale", "invalid", "unknown"])(
    "excludes explicit %s-quality rows from historical evidence",
    (quality) => {
      const result = evaluateAiDoctorReviewEligibility({
        context: context("insufficient"),
        hasPlantProfile: true,
        importedHistory: history({ metrics: [], excludedQualityCount: 2 }),
        historicalRows: [
          row("2026-06-01T10:00:00.000Z", { quality }),
          row("2026-06-02T10:00:00.000Z", { quality }),
        ],
        missingLiveSensorReadings: true,
      });

      expect(result).toMatchObject({
        allowed: false,
        reason: "too_few_valid_observations",
        validObservationCount: 0,
      });
    },
  );

  it("accepts canonical ok and legacy missing quality without weakening the timestamp gate", () => {
    const result = evaluateAiDoctorReviewEligibility({
      context: context("insufficient"),
      hasPlantProfile: true,
      importedHistory: history(),
      historicalRows: [
        row("2026-06-01T10:00:00.000Z", { quality: "ok" }),
        row("2026-06-02T10:00:00.000Z", { quality: undefined }),
      ],
      missingLiveSensorReadings: true,
    });

    expect(result).toMatchObject({
      allowed: true,
      mode: "historical_review",
      validObservationCount: 2,
    });
  });

  it("never counts non-CSV rows as historical evidence", () => {
    const result = evaluateAiDoctorReviewEligibility({
      context: context("insufficient"),
      hasPlantProfile: true,
      importedHistory: history(),
      historicalRows: historicalRows.map((item) => ({ ...item, source: "manual" })),
      missingLiveSensorReadings: true,
    });
    expect(result).toMatchObject({
      allowed: false,
      reason: "too_few_valid_observations",
      validObservationCount: 0,
    });
  });

  it("does not use the historical bypass when current telemetry is present", () => {
    const result = evaluateAiDoctorReviewEligibility({
      context: context("insufficient"),
      hasPlantProfile: true,
      importedHistory: history(),
      historicalRows,
      missingLiveSensorReadings: false,
    });
    expect(result).toMatchObject({
      allowed: false,
      mode: "blocked",
      reason: "current_telemetry_requires_standard_context",
    });
  });

  it("is deterministic for repeated identical input", () => {
    const input = {
      context: context("insufficient"),
      hasPlantProfile: true,
      importedHistory: history(),
      historicalRows,
      missingLiveSensorReadings: true,
    };
    expect(evaluateAiDoctorReviewEligibility(input)).toEqual(
      evaluateAiDoctorReviewEligibility(input),
    );
  });
});
