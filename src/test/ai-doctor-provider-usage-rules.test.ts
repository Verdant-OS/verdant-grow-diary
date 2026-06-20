import { describe, it, expect } from "vitest";
import {
  normalizeProviderReportedTokenUsage,
  type ProviderReportedTokenUsage,
} from "../lib/cost/aiDoctorProviderUsageRules";

describe("normalizeProviderReportedTokenUsage", () => {
  it("normalizes snake_case OpenAI-compatible usage", () => {
    const input = {
      prompt_tokens: 150,
      completion_tokens: 42,
      total_tokens: 192,
    };
    const result = normalizeProviderReportedTokenUsage(input);
    expect(result).toEqual({
      promptTokens: 150,
      completionTokens: 42,
      totalTokens: 192,
    });
  });

  it("normalizes camelCase usage", () => {
    const input = {
      promptTokens: 200,
      completionTokens: 55,
      totalTokens: 255,
    };
    const result = normalizeProviderReportedTokenUsage(input);
    expect(result).toEqual({
      promptTokens: 200,
      completionTokens: 55,
      totalTokens: 255,
    });
  });

  it("derives total when prompt + completion are valid and total is absent", () => {
    const input = {
      prompt_tokens: 100,
      completion_tokens: 30,
    };
    const result = normalizeProviderReportedTokenUsage(input);
    expect(result).toEqual({
      promptTokens: 100,
      completionTokens: 30,
      totalTokens: 130,
    });
  });

  it("preserves provider total when provider reports it", () => {
    const input = {
      prompt_tokens: 100,
      completion_tokens: 30,
      total_tokens: 200, // provider-reported total differs from sum
    };
    const result = normalizeProviderReportedTokenUsage(input);
    expect(result).toEqual({
      promptTokens: 100,
      completionTokens: 30,
      totalTokens: 200,
    });
  });

  it("returns null for null input", () => {
    expect(normalizeProviderReportedTokenUsage(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeProviderReportedTokenUsage(undefined)).toBeNull();
  });

  it("returns null for non-object input (string)", () => {
    expect(normalizeProviderReportedTokenUsage("not an object")).toBeNull();
  });

  it("returns null for non-object input (number)", () => {
    expect(normalizeProviderReportedTokenUsage(123)).toBeNull();
  });

  it("returns null for negative values", () => {
    const input = {
      prompt_tokens: -1,
      completion_tokens: 10,
      total_tokens: 9,
    };
    expect(normalizeProviderReportedTokenUsage(input)).toBeNull();
  });

  it("returns null for NaN", () => {
    const input = {
      prompt_tokens: NaN,
      completion_tokens: 10,
      total_tokens: 10,
    };
    expect(normalizeProviderReportedTokenUsage(input)).toBeNull();
  });

  it("returns null for Infinity", () => {
    const input = {
      prompt_tokens: Infinity,
      completion_tokens: 10,
      total_tokens: 10,
    };
    expect(normalizeProviderReportedTokenUsage(input)).toBeNull();
  });

  it("returns null for -Infinity", () => {
    const input = {
      prompt_tokens: -Infinity,
      completion_tokens: 10,
      total_tokens: 10,
    };
    expect(normalizeProviderReportedTokenUsage(input)).toBeNull();
  });

  it("returns null for string numbers", () => {
    const input = {
      prompt_tokens: "150",
      completion_tokens: 42,
      total_tokens: 192,
    };
    expect(normalizeProviderReportedTokenUsage(input)).toBeNull();
  });

  it("returns null for partial untrustworthy usage (missing completion)", () => {
    const input = {
      prompt_tokens: 150,
      total_tokens: 192,
    };
    expect(normalizeProviderReportedTokenUsage(input)).toBeNull();
  });

  it("returns null for partial untrustworthy usage (missing prompt)", () => {
    const input = {
      completion_tokens: 42,
      total_tokens: 192,
    };
    expect(normalizeProviderReportedTokenUsage(input)).toBeNull();
  });

  it("returns null when only total is present", () => {
    const input = {
      total_tokens: 192,
    };
    expect(normalizeProviderReportedTokenUsage(input)).toBeNull();
  });

  it("does not include raw prompt/response/header fields in normalized output", () => {
    const input = {
      prompt_tokens: 150,
      completion_tokens: 42,
      total_tokens: 192,
      prompt: "raw prompt text",
      response: "raw response text",
      headers: { "x-request-id": "abc" },
      api_key: "secret",
    };
    const result = normalizeProviderReportedTokenUsage(input);
    expect(result).toEqual({
      promptTokens: 150,
      completionTokens: 42,
      totalTokens: 192,
    });
    // Type-level check: ensure no extra keys leak through
    const keys = Object.keys(result as ProviderReportedTokenUsage);
    expect(keys).toEqual(["promptTokens", "completionTokens", "totalTokens"]);
  });

  it("rejects fractional token counts", () => {
    const input = {
      prompt_tokens: 150.5,
      completion_tokens: 42,
      total_tokens: 192.5,
    };
    expect(normalizeProviderReportedTokenUsage(input)).toBeNull();
  });

  it("prefers snake_case over camelCase when both are present", () => {
    const input = {
      prompt_tokens: 100,
      promptTokens: 999,
      completion_tokens: 30,
      completionTokens: 888,
      total_tokens: 130,
      totalTokens: 777,
    };
    const result = normalizeProviderReportedTokenUsage(input);
    expect(result).toEqual({
      promptTokens: 100,
      completionTokens: 30,
      totalTokens: 130,
    });
  });
});
