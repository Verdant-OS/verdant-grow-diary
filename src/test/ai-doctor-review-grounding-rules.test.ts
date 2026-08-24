import { describe, expect, it } from "vitest";
import {
  validateAiDoctorReviewGrounding,
  type AiDoctorReviewGroundingFailureReason,
} from "@/lib/aiDoctorReviewGroundingRules";
import type { AiDoctorReviewRequestPacket } from "@/lib/aiDoctorReviewRequestPacket";
import type { AiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";

const CAPTURED_AT = "2026-08-24T12:00:00.000Z";

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

  it("rejects a claimed logged event that is absent from the packet", () => {
    expectReason(
      makeResult({ evidence: ["The plant was watered yesterday."] }),
      makePacket({ recentEvents: [] }),
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
  });
});
