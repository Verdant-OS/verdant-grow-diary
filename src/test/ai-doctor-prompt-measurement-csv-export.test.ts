import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_PROMPT_MEASUREMENT_CSV_COLUMNS,
  serializeAiDoctorPromptMeasurementsToCsv,
} from "@/lib/cost/aiDoctorPromptMeasurementCsvExport";
import { createAiDoctorPromptMeasurementCaptureStore } from "@/lib/cost/aiDoctorPromptMeasurementCaptureStore";
import { buildAiDoctorPromptMeasurement } from "@/lib/cost/aiDoctorPromptMeasurement";

describe("aiDoctorPromptMeasurementCsvExport", () => {
  it("emits header-only CSV when no measurements exist", () => {
    const csv = serializeAiDoctorPromptMeasurementsToCsv([]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(AI_DOCTOR_PROMPT_MEASUREMENT_CSV_COLUMNS.join(","));
  });

  it("uses deterministic column order", () => {
    expect(AI_DOCTOR_PROMPT_MEASUREMENT_CSV_COLUMNS[0]).toBe("recordedAt");
    expect(AI_DOCTOR_PROMPT_MEASUREMENT_CSV_COLUMNS[1]).toBe("promptName");
    expect(AI_DOCTOR_PROMPT_MEASUREMENT_CSV_COLUMNS.at(-1)).toBe("sourceTags");
  });

  it("serializes provider tokens, arrays as pipe-delimited, and escapes specials", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    store.capture(
      buildAiDoctorPromptMeasurement({
        promptName: 'name, with "quote"\nand newline',
        recordedAt: "2026-06-16T00:00:00Z",
        userPromptText: "hi",
        providerReportedTokens: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
        includedWindows: ["5m", "1h"],
        sourceTags: ["live", "csv"],
      }),
    );
    const csv = serializeAiDoctorPromptMeasurementsToCsv(store.list());
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"name, with ""quote""\nand newline"');
    expect(lines[1]).toContain("10,5,15");
    expect(lines[1]).toContain("5m|1h");
    expect(lines[1]).toContain("live|csv");
  });

  it("renders missing provider tokens as blank cells", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    store.capture(
      buildAiDoctorPromptMeasurement({
        promptName: "ai_doctor_review",
        recordedAt: "2026-06-16T00:00:00Z",
        userPromptText: "hi",
      }),
    );
    const csv = serializeAiDoctorPromptMeasurementsToCsv(store.list());
    // providerPromptTokens / providerCompletionTokens / providerTotalTokens cells are blank
    expect(csv).toMatch(/summary_fresh/);
    expect(csv.split("\n")[1].split(",").slice(7, 10)).toEqual(["", "", ""]);
  });

  it("does not include any prompt text or raw response field in the CSV", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    store.capture(
      buildAiDoctorPromptMeasurement({
        promptName: "ai_doctor_review",
        recordedAt: "2026-06-16T00:00:00Z",
        userPromptText: "SECRET-DIARY-CONTENT-XYZ",
      }),
    );
    const csv = serializeAiDoctorPromptMeasurementsToCsv(store.list());
    expect(csv).not.toContain("SECRET-DIARY-CONTENT-XYZ");
    expect(csv).not.toMatch(/userPromptText|rawResponse|providerResponse/);
  });
});
