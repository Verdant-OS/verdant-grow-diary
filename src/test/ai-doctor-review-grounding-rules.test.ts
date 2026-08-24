import { describe, expect, it } from "vitest";
import {
  validateAiDoctorReviewGrounding,
  type AiDoctorReviewGroundingFailureReason,
} from "@/lib/aiDoctorReviewGroundingRules";
import {
  AI_DOCTOR_CSV_HISTORY_LABEL,
  AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
  AI_DOCTOR_IMPORTED_SENSOR_HISTORY_GUIDANCE,
  AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL,
} from "@/constants/aiDoctorImportedHistory";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";
import type { AiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";

const CAPTURED_AT = "2026-08-24T12:00:00.000Z";

type RootZoneObservation = NonNullable<
  AiDoctorReviewRequestPacket["recentRootZoneObservations"]
>[number];
type ImportedSensorHistory = NonNullable<AiDoctorReviewRequestPacket["imported_sensor_history"]>;

function makeRootZoneObservation(
  overrides: Partial<RootZoneObservation> = {},
): RootZoneObservation {
  return {
    at: CAPTURED_AT,
    eventType: "watering",
    source: "manual",
    volumeMl: null,
    inputPh: 6.2,
    inputEcMsCm: null,
    outputEcMsCm: null,
    runoffMl: null,
    runoffPh: null,
    runoffEcMsCm: null,
    waterTempC: null,
    nutrientLine: null,
    products: [],
    ...overrides,
  };
}

function makeImportedSensorHistory(
  metrics: ImportedSensorHistory["metrics"],
  overrides: Partial<ImportedSensorHistory> = {},
): ImportedSensorHistory {
  return {
    hasCsvHistory: true,
    historicalLabel: AI_DOCTOR_CSV_HISTORY_LABEL,
    notForLiveDiagnosis: AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
    totalReadings: 12,
    dateRange: {
      earliest: "2026-08-01T12:00:00.000Z",
      latest: CAPTURED_AT,
    },
    vendors: [],
    metrics,
    excludedQualityCount: 0,
    suspiciousFlagCount: 0,
    sectionLabel: AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL,
    guidance: [...AI_DOCTOR_IMPORTED_SENSOR_HISTORY_GUIDANCE],
    ...overrides,
  };
}

function makePacket(
  overrides: Partial<AiDoctorReviewRequestPacket> = {},
): AiDoctorReviewRequestPacket {
  return {
    schemaVersion: 1,
    plant: {
      strain: "Example cultivar",
      stage: "flower",
      medium: "soil",
      potSize: "11 L",
    },
    readiness: {
      state: "strong",
      evidence: ["Recent watering and a source-labeled snapshot are available."],
      missing: [],
    },
    recentEvents: [{ at: CAPTURED_AT, category: "watering" }],
    recentSensorSnapshot: {
      capturedAt: CAPTURED_AT,
      severity: "ok",
      readings: [
        { field: "temperature_c", value: 25, unit: "°C" },
        { field: "humidity_pct", value: 58, unit: "%" },
      ],
    },
    recentSensorSnapshotAnnotation: {
      line: "LATEST_SENSOR_SNAPSHOT [source=live, stale=false, trust=high]: temperature=25C humidity=58%",
      source: "live",
      stale: false,
      trust: "high",
      includesValues: true,
      safetyNotes: [],
      missingInformationHints: [],
    },
    missingLiveSensorReadings: false,
    ...overrides,
  };
}

function makeResult(overrides: Partial<AiDoctorReviewResult> = {}): AiDoctorReviewResult {
  return {
    summary: "The available context supports a cautious observation-only review.",
    likely_issue: "A possible stress pattern needs follow-up evidence.",
    confidence: "medium",
    evidence: ["Temperature is 25 C in the current source-labeled snapshot."],
    missing_information: [],
    possible_causes: ["Normal variation remains possible."],
    immediate_action: "Observe the plant and add a follow-up note if its condition changes.",
    what_not_to_do: "Do not make abrupt equipment changes from this review.",
    twenty_four_hour_follow_up: "Recheck the plant and record any visible change within 24 hours.",
    three_day_recovery_plan: "Keep observations consistent and review the trend after three days.",
    risk_level: "watch",
    ...overrides,
  };
}

function expectReason(
  result: AiDoctorReviewResult,
  packet: AiDoctorReviewRequestPacket,
  reason: AiDoctorReviewGroundingFailureReason,
): void {
  expect(validateAiDoctorReviewGrounding(result, packet)).toEqual({ ok: false, reason });
}

describe("validateAiDoctorReviewGrounding", () => {
  it("accepts packet-backed cautious output without rewriting either input", () => {
    const packet = makePacket();
    const result = makeResult({
      confidence: "high",
      evidence: ["Temperature is 25 C and a recent watering event are available."],
      summary:
        "The tent environment is stable in the source-labeled snapshot, with follow-up still advised.",
    });
    const packetBefore = structuredClone(packet);
    const resultBefore = structuredClone(result);

    expect(validateAiDoctorReviewGrounding(result, packet)).toEqual({ ok: true });
    expect(packet).toEqual(packetBefore);
    expect(result).toEqual(resultBefore);
  });

  it("rejects high confidence without affirmative review evidence", () => {
    expectReason(
      makeResult({ confidence: "high", evidence: [] }),
      makePacket(),
      "high_confidence_without_affirmative_evidence",
    );
  });

  it("rejects high confidence when the packet itself has no affirmative evidence", () => {
    expectReason(
      makeResult({ confidence: "high" }),
      makePacket({
        readiness: {
          state: "strong",
          evidence: ["No current observations are available."],
          missing: [],
        },
        recentEvents: [],
        recentSensorSnapshot: null,
        recentSensorSnapshotAnnotation: null,
        missingLiveSensorReadings: true,
      }),
      "high_confidence_without_affirmative_evidence",
    );
  });

  it("does not let stale or invalid root-zone rows authorize high confidence", () => {
    const missingCurrentSnapshot = ["A source-labeled current snapshot is missing."];
    const result = makeResult({
      confidence: "high",
      evidence: ["A recorded root-zone observation needs cautious follow-up."],
      missing_information: missingCurrentSnapshot,
    });
    const noOtherEvidence = {
      readiness: {
        state: "strong" as const,
        evidence: ["No current observations are available."],
        missing: [],
      },
      recentEvents: [],
      recentSensorSnapshot: null,
      recentSensorSnapshotAnnotation: null,
      missingLiveSensorReadings: true,
    } satisfies Partial<AiDoctorReviewRequestPacket>;

    for (const source of ["demo", "stale", "invalid", "unknown"] as const) {
      expectReason(
        result,
        makePacket({
          ...noOtherEvidence,
          recentRootZoneObservations: [makeRootZoneObservation({ source })],
        }),
        "high_confidence_without_affirmative_evidence",
      );
    }
    expectReason(
      result,
      makePacket({
        ...noOtherEvidence,
        recentRootZoneObservations: [makeRootZoneObservation({ invalidFields: ["inputPh"] })],
      }),
      "high_confidence_without_affirmative_evidence",
    );
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({
          confidence: "high",
          evidence: ["The recorded input pH is 6.2."],
          missing_information: missingCurrentSnapshot,
        }),
        makePacket({
          ...noOtherEvidence,
          recentRootZoneObservations: [makeRootZoneObservation()],
        }),
      ),
    ).toEqual({ ok: true });
  });

  it("rejects partial context that hides missing information", () => {
    expectReason(
      makeResult({ missing_information: [] }),
      makePacket({
        readiness: {
          state: "partial",
          evidence: ["A recent watering event is available."],
          missing: ["A recent plant photo is not available."],
        },
      }),
      "missing_information_required",
    );
  });

  it("rejects weak annotated context that omits its missing information", () => {
    expectReason(
      makeResult({ missing_information: [] }),
      makePacket({
        recentSensorSnapshotAnnotation: {
          line: "LATEST_SENSOR_SNAPSHOT [source=csv, stale=false, trust=low]",
          source: "csv",
          stale: false,
          trust: "low",
          includesValues: true,
          safetyNotes: ["Historical source only."],
          missingInformationHints: ["Collect a current source-labeled snapshot."],
        },
      }),
      "missing_information_required",
    );
  });

  it("rejects absolute certainty that passed the structural shape", () => {
    expectReason(
      makeResult({ summary: "This is definitely a nutrient problem." }),
      makePacket(),
      "absolute_certainty",
    );
  });

  it("rejects direct sensor claims that disagree with the packet", () => {
    expectReason(
      makeResult({ evidence: ["Humidity is 72 percent in the tent."] }),
      makePacket(),
      "claim_not_supported_by_packet",
    );
  });

  it("rejects an unsupported numeric claim hidden in missing information", () => {
    expectReason(
      makeResult({ missing_information: ["Humidity is 72 percent."] }),
      makePacket(),
      "claim_not_supported_by_packet",
    );
  });

  it("rejects absolute certainty hidden in missing information", () => {
    expectReason(
      makeResult({ missing_information: ["This is definitely complete."] }),
      makePacket(),
      "absolute_certainty",
    );
  });

  it("rejects unsupported event and snapshot claims hidden in missing information", () => {
    expectReason(
      makeResult({ missing_information: ["The plant was watered yesterday."] }),
      makePacket({ recentEvents: [] }),
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({
        evidence: [],
        missing_information: ["The current sensor snapshot shows a normal trend."],
      }),
      makePacket({ recentSensorSnapshot: null, recentSensorSnapshotAnnotation: null }),
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({
        missing_information: ["No concern exists because the plant was watered yesterday."],
      }),
      makePacket({ recentEvents: [] }),
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({
        missing_information: [
          "No watering problem exists because the plant was watered yesterday.",
        ],
      }),
      makePacket({ recentEvents: [] }),
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({
        missing_information: [
          "No watering event is missing because the plant was watered yesterday.",
        ],
      }),
      makePacket({ recentEvents: [] }),
      "claim_not_supported_by_packet",
    );
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ missing_information: ["No watering event is available."] }),
        makePacket({ recentEvents: [] }),
      ),
    ).toEqual({ ok: true });
  });

  it("checks direct packet claims in every action and follow-up field", () => {
    const unsupportedClaims = [
      { immediate_action: "Humidity is 72 percent, so observe." },
      { what_not_to_do: "Humidity is 72 percent, so avoid abrupt changes." },
      { twenty_four_hour_follow_up: "Humidity is 72 percent, so recheck tomorrow." },
      { three_day_recovery_plan: "Humidity is 72 percent, then review recovery." },
    ] satisfies readonly Partial<AiDoctorReviewResult>[];

    for (const override of unsupportedClaims) {
      expectReason(makeResult(override), makePacket(), "claim_not_supported_by_packet");
    }
  });

  it("rejects absolute certainty in an action field", () => {
    expectReason(
      makeResult({ immediate_action: "Definitely observe today." }),
      makePacket(),
      "absolute_certainty",
    );
  });

  it("normalizes compatible temperature units and rejects incompatible or ambiguous claims", () => {
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ evidence: ["Temperature is 77 F in the snapshot."] }),
        makePacket(),
      ),
    ).toEqual({ ok: true });

    expectReason(
      makeResult({ evidence: ["Temperature is 25 F in the snapshot."] }),
      makePacket(),
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({ evidence: ["Temperature is 25 in the snapshot."] }),
      makePacket(),
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({ evidence: ["Temperature is 25 C/F in the snapshot."] }),
      makePacket(),
      "claim_not_supported_by_packet",
    );
  });

  it("normalizes EC conductivity units but rejects an incompatible EC unit", () => {
    const microSiemensPacket = makePacket({
      recentSensorSnapshot: {
        capturedAt: CAPTURED_AT,
        severity: "ok",
        readings: [{ field: "ec_ms_cm", value: 1200, unit: "µS/cm" }],
      },
    });

    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ evidence: ["EC is 1.2 mS/cm in the snapshot."] }),
        microSiemensPacket,
      ),
    ).toEqual({ ok: true });
    expectReason(
      makeResult({ evidence: ["EC is 1.2 µS/cm in the snapshot."] }),
      microSiemensPacket,
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({ evidence: ["EC is 1.2 mS/uS in the snapshot."] }),
      microSiemensPacket,
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({ evidence: ["EC is 1.2 mS/cm/uS in the snapshot."] }),
      microSiemensPacket,
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({ evidence: ["EC is 1.2 mS/cm/µS/cm in the snapshot."] }),
      microSiemensPacket,
      "claim_not_supported_by_packet",
    );
  });

  it("grounds direct root-zone measurements only from valid, claim-local observations", () => {
    const missingCurrentSnapshot = ["A source-labeled current snapshot is missing."];
    const rootZoneOnlyPacket = makePacket({
      recentSensorSnapshot: null,
      recentSensorSnapshotAnnotation: null,
      missingLiveSensorReadings: true,
      recentRootZoneObservations: [makeRootZoneObservation()],
    });

    expect(
      validateAiDoctorReviewGrounding(
        makeResult({
          evidence: ["The recorded input pH is 6.2."],
          missing_information: missingCurrentSnapshot,
        }),
        rootZoneOnlyPacket,
      ),
    ).toEqual({ ok: true });

    expectReason(
      makeResult({
        evidence: ["Historical CSV input pH is 6.2."],
        missing_information: missingCurrentSnapshot,
      }),
      rootZoneOnlyPacket,
      "claim_not_supported_by_packet",
    );

    expect(
      validateAiDoctorReviewGrounding(
        makeResult({
          evidence: ["Historical CSV input pH is 6.2."],
          missing_information: missingCurrentSnapshot,
        }),
        makePacket({
          recentSensorSnapshot: null,
          recentSensorSnapshotAnnotation: null,
          missingLiveSensorReadings: true,
          recentRootZoneObservations: [makeRootZoneObservation({ source: "csv" })],
        }),
      ),
    ).toEqual({ ok: true });

    expectReason(
      makeResult({
        evidence: ["pH is 6.2."],
        missing_information: missingCurrentSnapshot,
      }),
      rootZoneOnlyPacket,
      "claim_not_supported_by_packet",
    );

    for (const provenance of ["current", "live", "latest"] as const) {
      expectReason(
        makeResult({
          evidence: [`The ${provenance} input pH is 6.2.`],
          missing_information: missingCurrentSnapshot,
        }),
        rootZoneOnlyPacket,
        "claim_not_supported_by_packet",
      );
    }

    for (const source of ["demo", "stale", "invalid", "unknown"] as const) {
      expectReason(
        makeResult({
          evidence: ["The recorded input pH is 6.2."],
          missing_information: missingCurrentSnapshot,
        }),
        makePacket({
          recentSensorSnapshot: null,
          recentSensorSnapshotAnnotation: null,
          missingLiveSensorReadings: true,
          recentRootZoneObservations: [makeRootZoneObservation({ source })],
        }),
        "claim_not_supported_by_packet",
      );
    }

    expectReason(
      makeResult({
        evidence: ["The recorded input pH is 6.2."],
        missing_information: missingCurrentSnapshot,
      }),
      makePacket({
        recentSensorSnapshot: null,
        recentSensorSnapshotAnnotation: null,
        missingLiveSensorReadings: true,
        recentRootZoneObservations: [makeRootZoneObservation({ invalidFields: ["inputPh"] })],
      }),
      "claim_not_supported_by_packet",
    );
  });

  it("grounds only named, trustworthy historical aggregate evidence", () => {
    const historyOnlyPacket = makePacket({
      recentSensorSnapshot: null,
      recentSensorSnapshotAnnotation: null,
      missingLiveSensorReadings: true,
      imported_sensor_history: makeImportedSensorHistory([
        { metric: "temperature_c", unit: "C", count: 12, min: 20, max: 26, avg: 25 },
      ]),
    });
    const missingCurrentSnapshot = ["A source-labeled current snapshot is missing."];

    expect(
      validateAiDoctorReviewGrounding(
        makeResult({
          evidence: ["Historical average temperature is 25 C."],
          missing_information: missingCurrentSnapshot,
        }),
        historyOnlyPacket,
      ),
    ).toEqual({ ok: true });
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({
          evidence: ["Historical temperature averages 25 C."],
          missing_information: missingCurrentSnapshot,
        }),
        historyOnlyPacket,
      ),
    ).toEqual({ ok: true });

    expectReason(
      makeResult({
        evidence: ["Historical temperature is 25 C."],
        missing_information: missingCurrentSnapshot,
      }),
      historyOnlyPacket,
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({
        evidence: ["Current temperature is 25 C."],
        missing_information: missingCurrentSnapshot,
      }),
      historyOnlyPacket,
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({
        evidence: ["Current CSV average temperature is 25 C."],
        missing_information: missingCurrentSnapshot,
      }),
      historyOnlyPacket,
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({
        evidence: ["Current temperature has a historical average of 25 C."],
        missing_information: missingCurrentSnapshot,
      }),
      historyOnlyPacket,
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({
        evidence: ["Historical average temperature is 25 C."],
        missing_information: missingCurrentSnapshot,
      }),
      makePacket({
        recentSensorSnapshot: null,
        recentSensorSnapshotAnnotation: null,
        missingLiveSensorReadings: true,
        imported_sensor_history: makeImportedSensorHistory(
          [{ metric: "temperature_c", unit: "C", count: 12, min: 20, max: 26, avg: 25 }],
          { suspiciousFlagCount: 1 },
        ),
      }),
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({
        summary: "The tent environment is stable.",
        evidence: ["Historical average temperature is 25 C."],
        missing_information: missingCurrentSnapshot,
      }),
      historyOnlyPacket,
      "healthy_environment_without_trustworthy_snapshot",
    );
  });

  it("does not parse a future timing check as a bare numeric metric assertion", () => {
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ twenty_four_hour_follow_up: "Recheck temperature 24 hours from now." }),
        makePacket(),
      ),
    ).toEqual({ ok: true });
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ twenty_four_hour_follow_up: "Recheck temperature at 24 hours from now." }),
        makePacket(),
      ),
    ).toEqual({ ok: true });
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ twenty_four_hour_follow_up: "Recheck temperature 25 C in 24 hours." }),
        makePacket(),
      ),
    ).toEqual({ ok: true });
    expectReason(
      makeResult({ twenty_four_hour_follow_up: "Temperature is 24 C; recheck in 24 hours." }),
      makePacket(),
      "claim_not_supported_by_packet",
    );

    const phPacket = makePacket({
      recentSensorSnapshot: {
        capturedAt: CAPTURED_AT,
        severity: "ok",
        readings: [
          { field: "temperature_c", value: 25, unit: "C" },
          { field: "ph", value: 6.2, unit: "pH" },
        ],
      },
    });
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ evidence: ["pH 6.2 in the source-labeled snapshot."] }),
        phPacket,
      ),
    ).toEqual({ ok: true });
    expectReason(
      makeResult({ evidence: ["pH 6.0 in the source-labeled snapshot."] }),
      phPacket,
      "claim_not_supported_by_packet",
    );
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ twenty_four_hour_follow_up: "Recheck pH 6 hours from now." }),
        phPacket,
      ),
    ).toEqual({ ok: true });
    for (const followUp of [
      "Recheck pH 6-8 hours from now.",
      "Recheck pH 6 - 8 hours from now.",
      "Recheck pH 6–8 hours from now.",
      "Recheck pH: 6 to 8 hours from now.",
    ]) {
      expect(
        validateAiDoctorReviewGrounding(
          makeResult({ twenty_four_hour_follow_up: followUp }),
          phPacket,
        ),
      ).toEqual({ ok: true });
    }
  });

  it("does not let a temporal range hide a later numeric assertion", () => {
    const packetWithoutSnapshotOrRootZoneEvidence = makePacket({
      readiness: {
        state: "strong",
        evidence: ["No current observations are available."],
        missing: [],
      },
      recentEvents: [],
      recentSensorSnapshot: null,
      recentSensorSnapshotAnnotation: null,
      missingLiveSensorReadings: true,
    });

    for (const range of ["6 — 8 hours", "6 — 8"]) {
      expectReason(
        makeResult({
          evidence: [],
          missing_information: ["A source-labeled current snapshot is missing."],
          what_not_to_do: `Do not make a decision at ${range} pH is 6.2.`,
        }),
        packetWithoutSnapshotOrRootZoneEvidence,
        "claim_not_supported_by_packet",
      );
    }
  });

  it("grounds common metric assertion connectors without treating timing as telemetry", () => {
    const temperaturePacket = makePacket({
      recentSensorSnapshot: {
        capturedAt: CAPTURED_AT,
        severity: "ok",
        readings: [{ field: "temperature_c", value: 25, unit: "C" }],
      },
    });

    for (const claim of [
      "Current temperature remains at 30 C.",
      "Current temperature sits at 30 C.",
      "Current temperature averages 30 C.",
    ]) {
      expectReason(
        makeResult({ evidence: [claim] }),
        temperaturePacket,
        "claim_not_supported_by_packet",
      );
    }
    for (const claim of [
      "Current temperature remains at 25 C.",
      "Current temperature sits at 25 C.",
      "Current temperature averages 25 C.",
    ]) {
      expect(
        validateAiDoctorReviewGrounding(makeResult({ evidence: [claim] }), temperaturePacket),
      ).toEqual({
        ok: true,
      });
    }
    for (const followUp of [
      "Recheck temperature at 24 hours.",
      "Recheck temperature remains at 24 hours.",
      "Temperature sits at 6–8 hours.",
      "Temperature averages 6 to 8 hours.",
    ]) {
      expect(
        validateAiDoctorReviewGrounding(
          makeResult({ twenty_four_hour_follow_up: followUp }),
          temperaturePacket,
        ),
      ).toEqual({ ok: true });
    }
  });

  it("uses a precision-aware, metric-bounded tolerance for packet-backed values", () => {
    const roundedTemperaturePacket = makePacket({
      recentSensorSnapshot: {
        capturedAt: CAPTURED_AT,
        severity: "ok",
        readings: [
          { field: "temperature_c", value: 25.04, unit: "C" },
          { field: "humidity_pct", value: 58, unit: "%" },
        ],
      },
    });

    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ evidence: ["Temperature is 25 C in the source-labeled snapshot."] }),
        roundedTemperaturePacket,
      ),
    ).toEqual({ ok: true });
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ evidence: ["Temperature is 25.0 C in the source-labeled snapshot."] }),
        roundedTemperaturePacket,
      ),
    ).toEqual({ ok: true });
    expectReason(
      makeResult({ evidence: ["Temperature is 25.00 C in the source-labeled snapshot."] }),
      roundedTemperaturePacket,
      "claim_not_supported_by_packet",
    );
    expectReason(
      makeResult({ evidence: ["Temperature is 26 C in the source-labeled snapshot."] }),
      roundedTemperaturePacket,
      "claim_not_supported_by_packet",
    );

    const phPacket = makePacket({
      recentSensorSnapshot: {
        capturedAt: CAPTURED_AT,
        severity: "ok",
        readings: [
          { field: "temperature_c", value: 25, unit: "C" },
          { field: "ph", value: 6.2, unit: "pH" },
        ],
      },
    });
    expectReason(
      makeResult({ evidence: ["pH is 6.0 in the source-labeled snapshot."] }),
      phPacket,
      "claim_not_supported_by_packet",
    );
  });

  it("rejects a claimed logged event that is absent from the packet", () => {
    expectReason(
      makeResult({ evidence: ["The plant was watered yesterday."] }),
      makePacket({ recentEvents: [] }),
      "claim_not_supported_by_packet",
    );
  });

  it("accepts passive event uncertainty but rejects a hidden factual event claim", () => {
    const noWateringPacket = makePacket({ recentEvents: [] });

    expect(
      validateAiDoctorReviewGrounding(
        makeResult({
          evidence: [],
          missing_information: ["Cannot confirm when the plant was last watered."],
        }),
        noWateringPacket,
      ),
    ).toEqual({ ok: true });
    expectReason(
      makeResult({
        evidence: [],
        missing_information: [
          "Cannot confirm when the plant was last watered because it was watered yesterday.",
        ],
      }),
      noWateringPacket,
      "claim_not_supported_by_packet",
    );
  });

  it("does not treat a future metric check as a fabricated numeric reading", () => {
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ summary: "Check temperature in 24 hours before drawing conclusions." }),
        makePacket(),
      ),
    ).toEqual({ ok: true });
  });

  it("rejects stable or healthy environmental claims without an annotated trustworthy snapshot", () => {
    expectReason(
      makeResult({
        summary: "The tent environment is stable and healthy.",
        missing_information: ["A source-labeled current snapshot is needed."],
      }),
      makePacket({ recentSensorSnapshotAnnotation: null, missingLiveSensorReadings: true }),
      "healthy_environment_without_trustworthy_snapshot",
    );
  });

  it("requires trustworthy evidence for the specific healthy environmental metric", () => {
    const temperatureOnlyPacket = makePacket({
      recentSensorSnapshot: {
        capturedAt: CAPTURED_AT,
        severity: "ok",
        readings: [{ field: "temperature_c", value: 25, unit: "C" }],
      },
    });

    expectReason(
      makeResult({ summary: "Humidity is healthy." }),
      temperatureOnlyPacket,
      "healthy_environment_without_trustworthy_snapshot",
    );
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ summary: "Temperature is healthy." }),
        temperatureOnlyPacket,
      ),
    ).toEqual({ ok: true });
    expectReason(
      makeResult({ summary: "Temperature and humidity are healthy." }),
      temperatureOnlyPacket,
      "healthy_environment_without_trustworthy_snapshot",
    );
    expectReason(
      makeResult({ summary: "CO2 is healthy." }),
      temperatureOnlyPacket,
      "healthy_environment_without_trustworthy_snapshot",
    );
    const co2Packet = makePacket({
      recentSensorSnapshot: {
        capturedAt: CAPTURED_AT,
        severity: "ok",
        readings: [{ field: "co2_ppm", value: 800, unit: "ppm" }],
      },
    });
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ summary: "CO2 is healthy.", evidence: [] }),
        co2Packet,
      ),
    ).toEqual({ ok: true });
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ summary: "The tent environment is healthy." }),
        temperatureOnlyPacket,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects a stable environment claim in a follow-up field without a trustworthy snapshot", () => {
    expectReason(
      makeResult({
        twenty_four_hour_follow_up: "The tent environment is stable; recheck tomorrow.",
        missing_information: ["A source-labeled current snapshot is needed."],
      }),
      makePacket({ recentSensorSnapshotAnnotation: null, missingLiveSensorReadings: true }),
      "healthy_environment_without_trustworthy_snapshot",
    );
  });

  it("checks stable-environment claims in missing information but allows a real uncertainty disclosure", () => {
    const weakPacket = makePacket({
      readiness: {
        state: "partial",
        evidence: ["A recent watering event is available."],
        missing: ["A source-labeled current snapshot is not available."],
      },
      recentSensorSnapshot: null,
      recentSensorSnapshotAnnotation: null,
      missingLiveSensorReadings: true,
    });

    expectReason(
      makeResult({ missing_information: ["The tent environment is stable."] }),
      weakPacket,
      "healthy_environment_without_trustworthy_snapshot",
    );
    expectReason(
      makeResult({
        missing_information: ["The tent environment is not unknown and is stable."],
      }),
      weakPacket,
      "healthy_environment_without_trustworthy_snapshot",
    );
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({
          evidence: [],
          missing_information: [
            "Cannot confirm whether tent conditions are stable without a source-labeled current snapshot.",
          ],
        }),
        weakPacket,
      ),
    ).toEqual({ ok: true });
    expect(
      validateAiDoctorReviewGrounding(
        makeResult({
          evidence: [],
          missing_information: ["A source-labeled current snapshot is missing."],
        }),
        weakPacket,
      ),
    ).toEqual({ ok: true });
  });

  it("does not let the word without exempt an unsupported healthy-environment claim", () => {
    expectReason(
      makeResult({
        summary: "The tent environment is stable without a current snapshot.",
        missing_information: ["A source-labeled current snapshot is needed."],
      }),
      makePacket({ recentSensorSnapshotAnnotation: null, missingLiveSensorReadings: true }),
      "healthy_environment_without_trustworthy_snapshot",
    );
  });

  it("rejects automatic or device-control language while allowing explicit cautions", () => {
    expectReason(
      makeResult({ immediate_action: "Automatically adjust the fan overnight." }),
      makePacket(),
      "automation_or_device_language",
    );

    expect(
      validateAiDoctorReviewGrounding(
        makeResult({ what_not_to_do: "Do not automatically adjust the fan from this review." }),
        makePacket(),
      ),
    ).toEqual({ ok: true });

    for (const delimiter of ["—", "–", "-"]) {
      expectReason(
        makeResult({
          immediate_action: `Do not make a decision at 6 ${delimiter} automatically adjust the fan overnight.`,
        }),
        makePacket(),
        "automation_or_device_language",
      );
    }
    expectReason(
      makeResult({
        immediate_action:
          "Do not make a decision at 6 — 8 hours automatically adjust the fan overnight.",
      }),
      makePacket(),
      "automation_or_device_language",
    );

    expectReason(
      makeResult({ immediate_action: "Autopilot the fan overnight." }),
      makePacket(),
      "automation_or_device_language",
    );
    expectReason(
      makeResult({ immediate_action: "Automatic irrigation overnight." }),
      makePacket(),
      "automation_or_device_language",
    );
    expectReason(
      makeResult({ immediate_action: "Automatic dosing overnight." }),
      makePacket(),
      "automation_or_device_language",
    );
  });

  it("does not let a cautious prefix hide unsupported claims after a prose dash", () => {
    const packetWithoutEventsOrSnapshot = makePacket({
      readiness: {
        state: "strong",
        evidence: ["No current observations are available."],
        missing: [],
      },
      recentEvents: [],
      recentSensorSnapshot: null,
      recentSensorSnapshotAnnotation: null,
      missingLiveSensorReadings: true,
    });

    for (const claim of [
      "The plant was watered yesterday.",
      "The latest sensor snapshot shows stress.",
    ]) {
      for (const delimiter of ["—", "–", "-"]) {
        expectReason(
          makeResult({
            evidence: [],
            missing_information: ["A source-labeled current snapshot is missing."],
            immediate_action: `Do not make a decision at 6 ${delimiter} ${claim}`,
          }),
          packetWithoutEventsOrSnapshot,
          "claim_not_supported_by_packet",
        );
      }
    }
  });
});
