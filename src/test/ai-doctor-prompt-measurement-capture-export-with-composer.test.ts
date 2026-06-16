/**
 * Operator-only capture/export safety for AI Doctor prompt measurements
 * that were produced via the runtime provider response composer.
 *
 * Hard guarantees verified here:
 *   - Valid providerReportedTokens flow through capture → CSV as numeric cells.
 *   - Null providerReportedTokens flow through as blank cells.
 *   - Raw provider response fields (id, model, choices, headers, metadata,
 *     message content, authorization) NEVER appear in captured rows or CSV.
 *   - Capture store remains bounded (storage safety bound, not a token budget).
 *   - CSV export is deterministic for a fixed capture sequence.
 *   - Capture store rejects forbidden bundle fields (rawResponse, etc.).
 */
import { describe, expect, it } from "vitest";
import {
  buildAiDoctorPromptMeasurement,
  attachProviderResponseUsageToAiDoctorPromptMeasurement,
} from "@/lib/cost";
import {
  createAiDoctorPromptMeasurementCaptureStore,
  CAPTURE_STORE_SAFETY_BOUND,
} from "@/lib/cost/aiDoctorPromptMeasurementCaptureStore";
import { serializeAiDoctorPromptMeasurementsToCsv } from "@/lib/cost/aiDoctorPromptMeasurementCsvExport";

const RAW_RESPONSE = {
  id: "resp_SECRET_ID",
  model: "secret-model",
  system_fingerprint: "fp_SECRET",
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
  choices: [
    {
      message: {
        role: "assistant",
        content: "RAW-MODEL-OUTPUT-MUST-NOT-LEAK",
      },
    },
  ],
  headers: { authorization: "Bearer SECRET-TOKEN" },
  metadata: { trace: "TRACE-ID-MUST-NOT-LEAK" },
};

function buildBundleWithProviderUsage(promptName: string, raw: unknown) {
  const bundle = buildAiDoctorPromptMeasurement({
    promptName,
    recordedAt: "2026-06-16T00:00:00.000Z",
    userPromptText: "hello",
  });
  const withUsage = attachProviderResponseUsageToAiDoctorPromptMeasurement(
    bundle.measurement,
    raw,
  );
  return { measurement: withUsage, metadata: bundle.metadata };
}

describe("operator-only capture/export with provider usage composer", () => {
  it("captures sanitized providerReportedTokens and excludes raw response fields", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    store.capture(buildBundleWithProviderUsage("ai_doctor_review", RAW_RESPONSE));

    const captured = store.list();
    expect(captured).toHaveLength(1);
    expect(captured[0].measurement.providerReportedTokens).toEqual({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    });
    const serialized = JSON.stringify(captured);
    for (const forbidden of [
      "resp_SECRET_ID",
      "secret-model",
      "fp_SECRET",
      "RAW-MODEL-OUTPUT-MUST-NOT-LEAK",
      "Bearer SECRET-TOKEN",
      "TRACE-ID-MUST-NOT-LEAK",
      "choices",
      "system_fingerprint",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("exports provider tokens as numeric cells; raw response fields never appear", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    store.capture(buildBundleWithProviderUsage("ai_doctor_review", RAW_RESPONSE));
    const csv = serializeAiDoctorPromptMeasurementsToCsv(store.list());
    expect(csv).toContain("12,8,20");
    for (const forbidden of [
      "resp_SECRET_ID",
      "secret-model",
      "fp_SECRET",
      "RAW-MODEL-OUTPUT-MUST-NOT-LEAK",
      "Bearer SECRET-TOKEN",
      "TRACE-ID-MUST-NOT-LEAK",
      "system_fingerprint",
      "authorization",
    ]) {
      expect(csv).not.toContain(forbidden);
    }
  });

  it("exports blank cells when provider usage is null (missing/malformed)", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    store.capture(
      buildBundleWithProviderUsage("ai_doctor_review", { id: "x" }),
    );
    store.capture(
      buildBundleWithProviderUsage("ai_doctor_review", {
        usage: { prompt_tokens: "not-a-number" },
      }),
    );
    const csv = serializeAiDoctorPromptMeasurementsToCsv(store.list());
    const rows = csv.trim().split("\n");
    // Header + 2 rows.
    expect(rows).toHaveLength(3);
    for (const row of rows.slice(1)) {
      const cells = row.split(",");
      // provider token columns (indexes 7..9) are blank.
      expect(cells.slice(7, 10)).toEqual(["", "", ""]);
    }
  });

  it("CSV export is deterministic for a fixed capture sequence", () => {
    const make = () => {
      const store = createAiDoctorPromptMeasurementCaptureStore();
      store.capture(buildBundleWithProviderUsage("ai_doctor_review", RAW_RESPONSE));
      store.capture(buildBundleWithProviderUsage("ai_doctor_review", { id: "x" }));
      return serializeAiDoctorPromptMeasurementsToCsv(store.list());
    };
    expect(make()).toBe(make());
  });

  it("capture store stays bounded (storage safety bound, not a token budget)", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore(3);
    for (let i = 0; i < 10; i += 1) {
      store.capture(
        buildBundleWithProviderUsage(`p_${i}`, RAW_RESPONSE),
      );
    }
    expect(store.size()).toBe(3);
    expect(store.list().map((c) => c.measurement.promptName)).toEqual([
      "p_7",
      "p_8",
      "p_9",
    ]);
    expect(CAPTURE_STORE_SAFETY_BOUND).toBeGreaterThan(0);
  });

  it("capture store rejects forbidden raw provider fields on the bundle", () => {
    const store = createAiDoctorPromptMeasurementCaptureStore();
    const base = buildBundleWithProviderUsage("ai_doctor_review", RAW_RESPONSE);
    const tainted = { ...base, providerResponse: RAW_RESPONSE } as unknown as Parameters<
      typeof store.capture
    >[0];
    expect(() => store.capture(tainted)).toThrow(/providerResponse/);
  });
});
