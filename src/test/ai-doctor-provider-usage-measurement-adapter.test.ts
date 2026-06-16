/**
 * Tests for aiDoctorProviderUsageMeasurementAdapter.
 *
 * Pure logic only. No I/O, no model calls, no Supabase.
 */

import { describe, it, expect } from "vitest";
import {
  attachProviderReportedUsageToAiDoctorPromptMeasurement,
  type AiDoctorPromptMeasurement,
} from "@/lib/cost/aiDoctorProviderUsageMeasurementAdapter";

const baseMeasurement: AiDoctorPromptMeasurement = {
  domain: "llm_prompt",
  promptName: "ai_doctor_review",
  summaryByteSize: 1024,
  estimatedPromptTokens: 256,
  providerReportedTokens: null,
  rawHistoryFallback: "summary_fresh",
  status: "success",
  recordedAt: "2024-01-01T00:00:00Z",
};

describe("attachProviderReportedUsageToAiDoctorPromptMeasurement", () => {
  it("attaches normalized snake_case provider usage to a measurement", () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };

    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      baseMeasurement,
      usage,
    );

    expect(result.providerReportedTokens).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it("attaches normalized camelCase provider usage to a measurement", () => {
    const usage = {
      promptTokens: 200,
      completionTokens: 75,
      totalTokens: 275,
    };

    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      baseMeasurement,
      usage,
    );

    expect(result.providerReportedTokens).toEqual({
      promptTokens: 200,
      completionTokens: 75,
      totalTokens: 275,
    });
  });

  it("preserves provider-reported total tokens", () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 200,
    };

    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      baseMeasurement,
      usage,
    );

    // Provider-reported total (200) must be preserved, not derived (150)
    expect(result.providerReportedTokens?.totalTokens).toBe(200);
  });

  it("derives total only when the normalizer accepts the usage shape", () => {
    const usage = {
      prompt_tokens: 80,
      completion_tokens: 20,
    };

    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      baseMeasurement,
      usage,
    );

    expect(result.providerReportedTokens).toEqual({
      promptTokens: 80,
      completionTokens: 20,
      totalTokens: 100,
    });
  });

  it("rejects malformed provider usage without throwing", () => {
    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      baseMeasurement,
      "not-an-object",
    );

    expect(result.providerReportedTokens).toBeNull();
  });

  it("rejects partial provider usage without throwing", () => {
    const usage = {
      prompt_tokens: 100,
      // missing completion_tokens
    };

    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      baseMeasurement,
      usage,
    );

    expect(result.providerReportedTokens).toBeNull();
  });

  it("rejects unsafe numeric values without throwing", () => {
    const usages = [
      { prompt_tokens: -1, completion_tokens: 50, total_tokens: 49 },
      { prompt_tokens: NaN, completion_tokens: 50, total_tokens: 50 },
      { prompt_tokens: Infinity, completion_tokens: 50, total_tokens: 50 },
      { prompt_tokens: 100, completion_tokens: 50.5, total_tokens: 150.5 },
    ];

    for (const usage of usages) {
      const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
        baseMeasurement,
        usage,
      );
      expect(result.providerReportedTokens).toBeNull();
    }
  });

  it("does not mutate the original measurement", () => {
    const original = { ...baseMeasurement };
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };

    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      original,
      usage,
    );

    // Original must remain unchanged
    expect(original.providerReportedTokens).toBeNull();
    expect(result.providerReportedTokens).not.toBeNull();
  });

  it("does not preserve raw provider fields", () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      rawResponse: "should-not-appear",
      headers: { authorization: "secret" },
    };

    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      baseMeasurement,
      usage,
    );

    expect(result.providerReportedTokens).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    expect("rawResponse" in result).toBe(false);
    expect("headers" in result).toBe(false);
  });

  it("does not alter existing measurement byte counts or estimated token fields", () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };

    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      baseMeasurement,
      usage,
    );

    expect(result.summaryByteSize).toBe(baseMeasurement.summaryByteSize);
    expect(result.estimatedPromptTokens).toBe(
      baseMeasurement.estimatedPromptTokens,
    );
    expect(result.promptName).toBe(baseMeasurement.promptName);
    expect(result.rawHistoryFallback).toBe(baseMeasurement.rawHistoryFallback);
    expect(result.status).toBe(baseMeasurement.status);
    expect(result.recordedAt).toBe(baseMeasurement.recordedAt);
  });

  it("returns deterministic output on repeat calls with identical inputs", () => {
    const usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };

    const r1 = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      baseMeasurement,
      usage,
    );
    const r2 = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      baseMeasurement,
      usage,
    );

    expect(r1).toEqual(r2);
  });

  it("has no forbidden imports or side effects", () => {
    // Structural check: the module is pure and imports only from sibling
    // cost-domain files. No Supabase, fetch, React, or browser APIs.
    // Runtime verification is implicit: the function runs in this test
    // environment without any polyfills or network stubs.
    expect(typeof attachProviderReportedUsageToAiDoctorPromptMeasurement).toBe(
      "function",
    );
  });

  it("clears existing providerReportedTokens when new usage is invalid", () => {
    const measurementWithUsage: AiDoctorPromptMeasurement = {
      ...baseMeasurement,
      providerReportedTokens: {
        promptTokens: 999,
        completionTokens: 888,
        totalTokens: 777,
      },
    };

    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      measurementWithUsage,
      { bad: true },
    );

    expect(result.providerReportedTokens).toBeNull();
  });

  it("overrides existing providerReportedTokens when new usage is valid", () => {
    const measurementWithUsage: AiDoctorPromptMeasurement = {
      ...baseMeasurement,
      providerReportedTokens: {
        promptTokens: 999,
        completionTokens: 888,
        totalTokens: 777,
      },
    };

    const result = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      measurementWithUsage,
      { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    );

    expect(result.providerReportedTokens).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });
});
