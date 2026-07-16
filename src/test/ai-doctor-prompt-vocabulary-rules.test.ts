import { describe, expect, it } from "vitest";

import {
  buildValidatorSafeAiDoctorPromptValue,
  sanitizeAiDoctorPromptText,
} from "@/lib/aiDoctorPromptVocabularyRules";
import { AI_DOCTOR_REVIEW_BANNED_WORDS } from "@/lib/aiDoctorReviewResultContract";

const BANNED_RE = new RegExp(`\\b(${AI_DOCTOR_REVIEW_BANNED_WORDS.join("|")})\\b`, "i");

describe("aiDoctorPromptVocabularyRules", () => {
  it("translates every result-validator banned word without changing unrelated text", () => {
    const input =
      "Confirmed live readings connected and synced; imported notes said the plant was cured and guaranteed certain. Delivery stayed normal.";
    const output = sanitizeAiDoctorPromptText(input);

    expect(output).not.toMatch(BANNED_RE);
    expect(output).toContain("Supported current readings communicating and updated");
    expect(output).toContain("historical notes");
    expect(output.toLowerCase()).toContain("delivery");
  });

  it("sanitizes nested packet keys and values without mutating the source", () => {
    const source = {
      imported_sensor_history: {
        notForLiveDiagnosis: "Imported CSV history is not live telemetry.",
        guidance: ["No connected device is confirmed."],
      },
      hasLiveSensorReadings: false,
      missingLiveSensorReadings: true,
      note: "delivery remains normal",
    };

    const safe = buildValidatorSafeAiDoctorPromptValue(source) as Record<string, unknown>;
    const serialized = JSON.stringify(safe);

    expect(serialized).not.toMatch(BANNED_RE);
    expect(safe).toHaveProperty("historical_sensor_context");
    expect(safe).toHaveProperty("hasCurrentSensorReadings", false);
    expect(safe).toHaveProperty("missingCurrentSensorReadings", true);
    expect(serialized).toContain("delivery remains normal");
    expect(source.imported_sensor_history.notForLiveDiagnosis).toContain("not live telemetry");
  });

  it("is deterministic for repeated inputs", () => {
    const packet = { source: "live", note: "confirmed" };
    expect(buildValidatorSafeAiDoctorPromptValue(packet)).toEqual(
      buildValidatorSafeAiDoctorPromptValue(packet),
    );
  });
});
