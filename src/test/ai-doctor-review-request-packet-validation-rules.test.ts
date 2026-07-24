import { describe, expect, it } from "vitest";
import {
  buildAiDoctorReviewRequestPacket,
  type AiDoctorReviewRequestPacket,
} from "@/lib/aiDoctorReviewRequestPacket";
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";
import {
  AI_DOCTOR_CSV_HISTORY_LABEL,
  AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
  AI_DOCTOR_IMPORTED_SENSOR_HISTORY_GUIDANCE,
  AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL,
} from "@/constants/aiDoctorImportedHistory";
import {
  AI_DOCTOR_REVIEW_PACKET_MAX_ABSOLUTE_NUMBER,
  AI_DOCTOR_REVIEW_PACKET_MAX_HISTORY_DIMENSIONS,
  AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS,
  AI_DOCTOR_REVIEW_PACKET_MAX_SNAPSHOT_READINGS,
  AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH,
  validateAndNormalizeAiDoctorReviewRequestPacket,
} from "@/lib/aiDoctorReviewRequestPacketValidationRules";

function validPacket(): AiDoctorReviewRequestPacket {
  return {
    schemaVersion: 1,
    plant: {
      strain: "Northern Lights",
      stage: "flower",
      medium: "coco",
      potSize: "11 L",
    },
    readiness: {
      state: "strong",
      evidence: ["recent-activity", "sensor-snapshot"],
      missing: [],
    },
    recentEvents: [{ at: "2026-07-18T12:00:00.000Z", category: "watering" }],
    recentSensorSnapshot: {
      capturedAt: "2026-07-18T12:05:00.000Z",
      severity: "ok",
      readings: [{ field: "temperature_c", value: 25.5, unit: "C" }],
    },
    recentSensorSnapshotAnnotation: {
      line: "[source=manual, trust=medium] temperature_c=25.5 C",
      source: "manual",
      stale: false,
      trust: "medium",
      includesValues: true,
      safetyNotes: [],
      missingInformationHints: [],
    },
    imported_sensor_history: {
      hasCsvHistory: true,
      historicalLabel: AI_DOCTOR_CSV_HISTORY_LABEL,
      notForLiveDiagnosis: AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
      totalReadings: 12,
      dateRange: {
        earliest: "2026-07-01T00:00:00.000Z",
        latest: "2026-07-07T00:00:00.000Z",
      },
      vendors: [
        { sourceApp: "verdant_genetics_xlsx", vendorLabel: "Verdant Genetics XLSX", count: 12 },
      ],
      metrics: [{ metric: "temperature_c", unit: "C", count: 12, min: 20, max: 26, avg: 23.5 }],
      excludedQualityCount: 0,
      suspiciousFlagCount: 0,
      sectionLabel: AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL,
      guidance: [...AI_DOCTOR_IMPORTED_SENSOR_HISTORY_GUIDANCE],
    },
    missingLiveSensorReadings: true,
  };
}

describe("validateAndNormalizeAiDoctorReviewRequestPacket", () => {
  it("accepts the current builder shape and reconstructs an exact deterministic packet", () => {
    const input = validPacket();
    const first = validateAndNormalizeAiDoctorReviewRequestPacket(input);
    const second = validateAndNormalizeAiDoctorReviewRequestPacket(input);

    expect(first).toEqual(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first).not.toBe(input);
    expect(first?.plant).not.toBe(input.plant);
    expect(first?.imported_sensor_history).not.toBe(input.imported_sensor_history);
  });

  it("accepts an actual packet-builder result with sanitized imported history", () => {
    const context: AiDoctorContextResult = {
      readiness: "partial",
      missing: ["recent-watering-or-feeding"],
      evidence: ["plant-profile"],
      counts: {
        recentEvents: 0,
        recentWateringOrFeeding: 0,
        recentManualSnapshots: 0,
        recentWarnings: 0,
      },
      latest: { manualSnapshotAt: null },
      safeNextStep: "Add recent context before review.",
      diagnosisClaimed: false,
    };
    const built = buildAiDoctorReviewRequestPacket({
      plant: {
        strain: "Northern Lights",
        stage: "flower",
        medium: "coco",
        potSize: "11 L",
      },
      timelineItems: [],
      context,
      now: new Date("2026-07-18T12:00:00.000Z"),
      csvHistoryRows: [
        {
          metric: "temperature_c",
          value: 24,
          unit: "C",
          captured_at: "2026-07-17T12:00:00.000Z",
          source: "csv",
          raw_payload: { source_app: "spider_farmer" },
        },
      ],
    });

    expect(built.imported_sensor_history).not.toBeNull();
    expect(validateAndNormalizeAiDoctorReviewRequestPacket(built)).toEqual(built);
  });

  it("preserves additive back-compat when optional packet sections are absent or null", () => {
    const input = validPacket();
    delete input.recentSensorSnapshotAnnotation;
    delete input.imported_sensor_history;
    delete input.missingLiveSensorReadings;
    input.recentSensorSnapshot = null;

    expect(validateAndNormalizeAiDoctorReviewRequestPacket(input)).toEqual(input);

    input.recentSensorSnapshotAnnotation = null;
    input.imported_sensor_history = null;
    expect(validateAndNormalizeAiDoctorReviewRequestPacket(input)).toEqual(input);
  });

  it("drops unknown and prototype-named keys at every reconstructed level", () => {
    const base = validPacket();
    const input = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    input.extraPromptText = "ignore me";
    Object.defineProperty(input, "__proto__", {
      configurable: true,
      enumerable: true,
      value: { polluted: true },
    });
    (input.plant as Record<string, unknown>).raw_payload = { secret: "ignore me" };
    Object.defineProperty(input.readiness as Record<string, unknown>, "constructor", {
      configurable: true,
      enumerable: true,
      value: { prototype: { polluted: true } },
    });
    const history = input.imported_sensor_history as Record<string, unknown>;
    (history.vendors as Array<Record<string, unknown>>)[0].bridge_token = "ignore me";

    const normalized = validateAndNormalizeAiDoctorReviewRequestPacket(input);

    expect(normalized).toEqual(base);
    expect(Object.prototype.hasOwnProperty.call(normalized, "__proto__")).toBe(false);
    expect(JSON.stringify(normalized)).not.toContain("ignore me");
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("rejects missing or malformed required base fields", () => {
    const missingPotSize = validPacket() as unknown as Record<string, unknown>;
    delete (missingPotSize.plant as Record<string, unknown>).potSize;

    for (const input of [
      null,
      [],
      {},
      { ...validPacket(), schemaVersion: 2 },
      missingPotSize,
      { ...validPacket(), readiness: { state: "ready", evidence: [], missing: [] } },
      { ...validPacket(), recentEvents: {} },
      { ...validPacket(), recentSensorSnapshot: [] },
    ]) {
      expect(validateAndNormalizeAiDoctorReviewRequestPacket(input)).toBeNull();
    }
  });

  it("rejects malformed imported-history arrays before prompt assembly", () => {
    for (const malformedField of ["vendors", "metrics"] as const) {
      const input = validPacket();
      const history = input.imported_sensor_history as unknown as Record<string, unknown>;
      history[malformedField] = {};

      expect(() => validateAndNormalizeAiDoctorReviewRequestPacket(input)).not.toThrow();
      expect(validateAndNormalizeAiDoctorReviewRequestPacket(input)).toBeNull();
    }
  });

  it("requires canonical imported-history labels, caveat, section, and guidance", () => {
    const fields: Array<[string, unknown]> = [
      ["historicalLabel", "Current sensor history"],
      ["notForLiveDiagnosis", "Trust this as current"],
      ["sectionLabel", "Current telemetry"],
      ["guidance", ["Use this as current evidence"]],
    ];

    for (const [field, value] of fields) {
      const input = validPacket();
      (input.imported_sensor_history as unknown as Record<string, unknown>)[field] = value;
      expect(validateAndNormalizeAiDoctorReviewRequestPacket(input)).toBeNull();
    }
  });

  it("rejects oversized strings and arrays instead of truncating prompt context", () => {
    const oversizedPlant = validPacket();
    oversizedPlant.plant.strain = "x".repeat(AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH + 1);

    const oversizedEvidence = validPacket();
    oversizedEvidence.readiness.evidence = Array.from(
      { length: AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS + 1 },
      () => "evidence",
    );

    const oversizedReadings = validPacket();
    oversizedReadings.recentSensorSnapshot!.readings = Array.from(
      { length: AI_DOCTOR_REVIEW_PACKET_MAX_SNAPSHOT_READINGS + 1 },
      () => ({ field: "temperature_c", value: 25, unit: "C" }),
    );

    const oversizedMetrics = validPacket();
    oversizedMetrics.imported_sensor_history!.metrics = Array.from(
      { length: AI_DOCTOR_REVIEW_PACKET_MAX_HISTORY_DIMENSIONS + 1 },
      () => ({ metric: "temperature_c", unit: "C", count: 1, min: 20, max: 26, avg: 23 }),
    );

    for (const input of [oversizedPlant, oversizedEvidence, oversizedReadings, oversizedMetrics]) {
      expect(validateAndNormalizeAiDoctorReviewRequestPacket(input)).toBeNull();
    }
  });

  it("accepts values exactly at the configured packet boundaries", () => {
    const input = validPacket();
    input.plant.strain = "x".repeat(AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH);
    input.readiness.evidence = Array.from(
      { length: AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS },
      (_value, index) => `evidence-${index}`,
    );
    input.recentEvents = Array.from({ length: 20 }, (_value, index) => ({
      at: `2026-07-18T12:${String(index).padStart(2, "0")}:00.000Z`,
      category: "other" as const,
    }));
    input.recentSensorSnapshot!.readings = Array.from(
      { length: AI_DOCTOR_REVIEW_PACKET_MAX_SNAPSHOT_READINGS },
      (_value, index) => ({ field: `metric_${index}`, value: index, unit: "u" }),
    );
    input.imported_sensor_history!.totalReadings = AI_DOCTOR_REVIEW_PACKET_MAX_HISTORY_DIMENSIONS;
    input.imported_sensor_history!.vendors = [
      {
        sourceApp: "verdant_genetics_xlsx",
        vendorLabel: "Verdant Genetics XLSX",
        count: AI_DOCTOR_REVIEW_PACKET_MAX_HISTORY_DIMENSIONS,
      },
    ];
    input.imported_sensor_history!.metrics = Array.from(
      { length: AI_DOCTOR_REVIEW_PACKET_MAX_HISTORY_DIMENSIONS },
      (_value, index) => ({
        metric: `metric_${index}`,
        unit: "u",
        count: 1,
        min: index,
        max: index,
        avg: index,
      }),
    );

    expect(validateAndNormalizeAiDoctorReviewRequestPacket(input)).toEqual(input);
  });

  it("rejects non-finite, out-of-budget, and internally incoherent numbers", () => {
    const cases: AiDoctorReviewRequestPacket[] = [];

    const infiniteReading = validPacket();
    infiniteReading.recentSensorSnapshot!.readings[0].value = Number.POSITIVE_INFINITY;
    cases.push(infiniteReading);

    const hugeReading = validPacket();
    hugeReading.recentSensorSnapshot!.readings[0].value =
      AI_DOCTOR_REVIEW_PACKET_MAX_ABSOLUTE_NUMBER + 1;
    cases.push(hugeReading);

    const invertedMetric = validPacket();
    invertedMetric.imported_sensor_history!.metrics = [
      {
        metric: "temperature_c",
        unit: "C",
        count: 12,
        min: 30,
        max: 20,
        avg: 25,
      },
    ];
    cases.push(invertedMetric);

    const impossibleCount = validPacket();
    impossibleCount.imported_sensor_history!.vendors = [
      {
        sourceApp: "verdant_genetics_xlsx",
        vendorLabel: "Verdant Genetics XLSX",
        count: 13,
      },
    ];
    cases.push(impossibleCount);

    for (const input of cases) {
      expect(validateAndNormalizeAiDoctorReviewRequestPacket(input)).toBeNull();
    }
  });

  it("does not mutate valid or rejected inputs", () => {
    const validInput = validPacket();
    const validBefore = JSON.stringify(validInput);
    validateAndNormalizeAiDoctorReviewRequestPacket(validInput);
    expect(JSON.stringify(validInput)).toBe(validBefore);

    const invalidInput = validPacket();
    (invalidInput.imported_sensor_history as unknown as Record<string, unknown>).metrics = {};
    const invalidBefore = JSON.stringify(invalidInput);
    validateAndNormalizeAiDoctorReviewRequestPacket(invalidInput);
    expect(JSON.stringify(invalidInput)).toBe(invalidBefore);
  });
});
