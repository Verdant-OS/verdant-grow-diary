import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_REVIEW_EVIDENCE_RECEIPT_SCHEMA_VERSION,
  buildAiDoctorReviewEvidenceAcceptance,
  buildAiDoctorReviewEvidenceReceiptSnapshot,
  isAiDoctorReviewEvidenceAcceptanceCoherentWithPacket,
  isAiDoctorReviewEvidenceReceiptSnapshot,
  normalizeAiDoctorReviewEvidenceAcceptance,
} from "@/lib/aiDoctorReviewEvidenceReceiptRules";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";

const AT = "2026-07-19T12:34:56.000Z";

function packet(): AiDoctorReviewRequestPacket {
  return {
    schemaVersion: 1,
    plant: {
      strain: "Private cultivar name",
      stage: "flower",
      medium: "coco",
      potSize: "11L",
    },
    readiness: {
      state: "strong",
      evidence: ["recent manual observation"],
      missing: [],
    },
    recentEvents: [{ at: AT, category: "feeding" }],
    recentSensorSnapshot: {
      capturedAt: AT,
      severity: "ok",
      readings: [
        { field: "temperature_c", value: 29.375, unit: "C" },
        { field: "humidity_pct", value: 57.125, unit: "%" },
      ],
    },
    recentSensorSnapshotAnnotation: {
      line: "Private sensor annotation",
      source: "manual",
      stale: false,
      trust: "medium",
      includesValues: true,
      safetyNotes: ["Private safety note"],
      missingInformationHints: ["Private missing hint"],
    },
    imported_sensor_history: null,
    recentRootZoneObservations: [
      {
        at: AT,
        eventType: "feeding",
        source: "manual",
        volumeMl: 1432.75,
        inputPh: 5.83,
        inputEcMsCm: 2.17,
        outputEcMsCm: null,
        runoffMl: null,
        runoffPh: null,
        runoffEcMsCm: null,
        waterTempC: null,
        nutrientLine: "Private nutrient line",
        products: [{ name: "Private product", amount: 7.125, unit: "ml" }],
      },
    ],
    missingLiveSensorReadings: true,
  };
}

function decision() {
  return buildAiDoctorReviewEvidenceAcceptance({
    reviewMode: "standard",
    importedHistory: { hasTentScope: true, included: false, omittedByChoice: false },
    rootZoneHistory: {
      scope: "plant_and_shared_tent",
      included: true,
      omittedByChoice: false,
    },
  });
}

describe("AI Doctor review evidence receipt rules", () => {
  it("freezes a deterministic collection decision without turning no-data into an omission", () => {
    expect(decision()).toEqual({
      reviewMode: "standard",
      importedHistory: { state: "none_available", scope: "tent_scoped" },
      rootZoneHistory: { state: "included", scope: "plant_and_shared_tent" },
    });

    expect(
      buildAiDoctorReviewEvidenceAcceptance({
        reviewMode: "historical_review",
        importedHistory: { hasTentScope: false, included: true, omittedByChoice: false },
        rootZoneHistory: { scope: "plant_only", included: false, omittedByChoice: true },
      }),
    ).toEqual({
      reviewMode: "historical_review",
      importedHistory: { state: "not_scoped", scope: "not_scoped" },
      rootZoneHistory: { state: "omitted_by_choice", scope: "plant_only" },
    });
  });

  it("strictly normalizes only coherent collection-decision shapes", () => {
    const valid = decision();
    expect(normalizeAiDoctorReviewEvidenceAcceptance(valid)).toEqual(valid);
    expect(normalizeAiDoctorReviewEvidenceAcceptance({ ...valid, unexpected: true })).toBeNull();
    expect(
      normalizeAiDoctorReviewEvidenceAcceptance({
        ...valid,
        importedHistory: { state: "included", scope: "not_scoped" },
      }),
    ).toBeNull();
    expect(
      normalizeAiDoctorReviewEvidenceAcceptance({
        ...valid,
        rootZoneHistory: { state: "not_scoped", scope: "plant_only" },
      }),
    ).toBeNull();
  });

  it("records availability and provenance but excludes free text, values, products, and raw annotations", () => {
    const receipt = buildAiDoctorReviewEvidenceReceiptSnapshot({
      packet: packet(),
      clientCollectionDecision: decision(),
    });

    expect(receipt).not.toBeNull();
    if (!receipt) throw new Error("expected a valid receipt");
    expect(receipt).toMatchObject({
      schemaVersion: AI_DOCTOR_REVIEW_EVIDENCE_RECEIPT_SCHEMA_VERSION,
      packetSchemaVersion: 1,
      clientCollectionDecision: decision(),
      plantProfile: { hasStrain: true, hasStage: true, hasMedium: true, hasPotSize: true },
      readiness: { state: "strong", evidenceCount: 1, missingCount: 0 },
      recentEvents: [{ at: AT, category: "feeding" }],
      recentSensorSnapshot: { capturedAt: AT, severity: "ok", readingCount: 2 },
      recentSensorSnapshotAnnotation: {
        source: "manual",
        stale: false,
        trust: "medium",
        includesValues: true,
      },
      rootZoneObservations: [
        {
          at: AT,
          eventType: "feeding",
          source: "manual",
          measuredFields: ["volumeMl", "inputPh", "inputEcMsCm"],
          hasNutrientLine: true,
          productCount: 1,
          invalidFields: [],
        },
      ],
      missingLiveSensorReadings: true,
    });
    expect(isAiDoctorReviewEvidenceReceiptSnapshot(receipt)).toBe(true);

    const serialized = JSON.stringify(receipt);
    for (const forbidden of [
      "Private cultivar name",
      "Private sensor annotation",
      "Private safety note",
      "Private missing hint",
      "Private nutrient line",
      "Private product",
      "29.375",
      "57.125",
      "1432.75",
      "5.83",
      "2.17",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps rollout-compatible null client metadata distinct from malformed metadata", () => {
    const receipt = buildAiDoctorReviewEvidenceReceiptSnapshot({ packet: packet() });
    expect(receipt?.clientCollectionDecision).toBeNull();
    expect(
      buildAiDoctorReviewEvidenceReceiptSnapshot({
        packet: packet(),
        clientCollectionDecision: { reviewMode: "standard" } as never,
      }),
    ).toBeNull();
  });

  it("binds included decisions to evidence actually present in the normalized packet", () => {
    const noHistory = packet();
    noHistory.recentRootZoneObservations = [];
    expect(isAiDoctorReviewEvidenceAcceptanceCoherentWithPacket(noHistory, decision())).toBe(false);
    expect(
      isAiDoctorReviewEvidenceAcceptanceCoherentWithPacket(
        noHistory,
        buildAiDoctorReviewEvidenceAcceptance({
          reviewMode: "standard",
          importedHistory: { hasTentScope: true, included: false, omittedByChoice: false },
          rootZoneHistory: { scope: "plant_only", included: false, omittedByChoice: false },
        }),
      ),
    ).toBe(true);
  });

  it("rejects injected receipt fields and malformed bounded fields before protected storage", () => {
    const receipt = buildAiDoctorReviewEvidenceReceiptSnapshot({
      packet: packet(),
      clientCollectionDecision: decision(),
    });
    if (!receipt) throw new Error("expected a valid receipt");

    expect(
      isAiDoctorReviewEvidenceReceiptSnapshot({ ...receipt, raw_prompt: "do not retain" }),
    ).toBe(false);
    expect(
      isAiDoctorReviewEvidenceReceiptSnapshot({
        ...receipt,
        recentEvents: Array.from({ length: 21 }, () => receipt.recentEvents[0]),
      }),
    ).toBe(false);
    expect(
      isAiDoctorReviewEvidenceReceiptSnapshot({
        ...receipt,
        rootZoneObservations: [
          {
            ...receipt.rootZoneObservations[0],
            measuredFields: ["volumeMl", "volumeMl"],
          },
        ],
      }),
    ).toBe(false);
  });
});
