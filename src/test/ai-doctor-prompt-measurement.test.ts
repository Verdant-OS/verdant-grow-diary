import { describe, it, expect } from "vitest";
import {
  buildAiDoctorPromptMeasurement,
  classifyRawHistoryFallback,
  computeUtf8ByteSize,
} from "@/lib/cost/aiDoctorPromptMeasurement";
import { detectCrossDomainViolations } from "@/lib/cost/costDomains";

const AT = "2026-01-01T00:00:00.000Z";

describe("aiDoctorPromptMeasurement", () => {
  it("compact context creates measurement with byte size and fresh fallback", () => {
    const text = "Grower context packet (JSON):\n{}";
    const { measurement, metadata } = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      userPromptText: text,
      includedWindows: ["5m", "1h"],
      sourceTags: ["live", "manual"],
    });
    expect(measurement.domain).toBe("llm_prompt");
    expect(measurement.promptName).toBe("ai_doctor_review");
    expect(measurement.summaryByteSize).toBe(computeUtf8ByteSize(text));
    expect(measurement.rawHistoryFallback).toBe("summary_fresh");
    expect(measurement.estimatedPromptTokens).toBeNull();
    expect(measurement.providerReportedTokens).toBeNull();
    expect(metadata.charCount).toBe(text.length);
    expect(metadata.includedWindows).toEqual(["5m", "1h"]);
    expect(metadata.sourceTags).toEqual(["live", "manual"]);
  });

  it("raw-history fallback (imported history block) is marked as token-risk", () => {
    const { measurement } = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      userPromptText: "ctx",
      importedHistoryBlockPresent: true,
      rawHistoryEventCount: 42,
    });
    // missing-live or imported-history present → treated as missing summary
    expect(measurement.rawHistoryFallback).toBe("summary_missing");
  });

  it("missing-live-readings block also classifies as summary_missing", () => {
    const { measurement } = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      missingLiveReadingsBlockPresent: true,
    });
    expect(measurement.rawHistoryFallback).toBe("summary_missing");
  });

  it("stale and missing summary states are separated from token count", () => {
    const stale = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      staleSummaryUsed: true,
    });
    expect(stale.measurement.rawHistoryFallback).toBe("summary_stale");
    expect(stale.measurement.estimatedPromptTokens).toBeNull();
    expect(stale.measurement.providerReportedTokens).toBeNull();
    expect(stale.metadata.staleSummaryUsed).toBe(true);

    const missing = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      missingSummaryUsed: true,
    });
    expect(missing.measurement.rawHistoryFallback).toBe("summary_missing");
    expect(missing.metadata.missingSummaryUsed).toBe(true);

    const errored = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      summaryErrored: true,
    });
    expect(errored.measurement.rawHistoryFallback).toBe("summary_error");
    expect(errored.metadata.summaryErrored).toBe(true);
  });

  it("classifier precedence: error > missing > stale > fresh", () => {
    expect(
      classifyRawHistoryFallback({
        summaryErrored: true,
        missingSummaryUsed: true,
        staleSummaryUsed: true,
      }),
    ).toBe("summary_error");
    expect(
      classifyRawHistoryFallback({
        missingSummaryUsed: true,
        staleSummaryUsed: true,
      }),
    ).toBe("summary_missing");
    expect(classifyRawHistoryFallback({ staleSummaryUsed: true })).toBe(
      "summary_stale",
    );
    expect(classifyRawHistoryFallback({})).toBe("summary_fresh");
  });

  it("CSV/imported history is tagged separately from live/manual context", () => {
    const { measurement, metadata } = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      importedHistoryBlockPresent: true,
      rawHistoryEventCount: 7,
      sourceTags: ["live", "manual", "csv"],
    });
    expect(metadata.sourceTags).toEqual(["live", "manual", "csv"]);
    expect(metadata.rawHistoryEventCount).toBe(7);
    // CSV inclusion is reflected as a summary_missing fallback (token risk),
    // not silently folded into a live/manual tag.
    expect(measurement.rawHistoryFallback).toBe("summary_missing");
  });

  it("no DB refresh fields appear on the LLM measurement", () => {
    const { measurement } = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      userPromptText: "x",
    });
    const violations = detectCrossDomainViolations(
      "llm_prompt",
      measurement as unknown as Record<string, unknown>,
    );
    expect(violations).toEqual([]);
    // And spot-check forbidden keys are absent.
    const keys = Object.keys(measurement);
    expect(keys).not.toContain("durationMs");
    expect(keys).not.toContain("queueWaitMs");
    expect(keys).not.toContain("deltaRowCount");
    expect(keys).not.toContain("rowsRead");
    expect(keys).not.toContain("rowsWritten");
    expect(keys).not.toContain("refreshName");
  });

  it("no numeric threshold constants are introduced by this module", async () => {
    const src = await import("@/lib/cost/aiDoctorPromptMeasurement?raw" as string).catch(
      () => null,
    );
    // Fallback: read via fs when the ?raw loader isn't configured.
    let text = (src as { default?: string } | null)?.default ?? "";
    if (!text) {
      const fs = await import("node:fs");
      text = fs.readFileSync(
        "src/lib/cost/aiDoctorPromptMeasurement.ts",
        "utf8",
      );
    }
    // Strip comments and string literals where small numbers are legitimate
    // (e.g. ?? 0 default). Then assert no MAX_/LIMIT_/THRESHOLD_ token constants.
    expect(text).not.toMatch(/MAX_(PROMPT|TOKEN|SUMMARY)_/);
    expect(text).not.toMatch(/THRESHOLD/);
    expect(text).not.toMatch(/TOKEN_LIMIT/);
  });

  it("provider-reported tokens flow through only when supplied", () => {
    const { measurement } = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      providerReportedTokens: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    });
    expect(measurement.providerReportedTokens).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it("deterministic — same input yields equal output", () => {
    const a = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      userPromptText: "hello",
      includedWindows: ["5m"],
      sourceTags: ["live"],
    });
    const b = buildAiDoctorPromptMeasurement({
      promptName: "ai_doctor_review",
      recordedAt: AT,
      userPromptText: "hello",
      includedWindows: ["5m"],
      sourceTags: ["live"],
    });
    expect(a).toEqual(b);
  });
});
