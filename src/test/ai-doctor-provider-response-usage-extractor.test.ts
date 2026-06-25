import { describe, it, expect } from "vitest";
import { extractProviderReportedUsageCandidate } from "@/lib/cost/aiDoctorProviderResponseUsageExtractor";
import { normalizeProviderReportedTokenUsage } from "@/lib/cost/aiDoctorProviderUsageRules";

describe("extractProviderReportedUsageCandidate", () => {
  describe("supported shapes", () => {
    it("extracts snake_case usage at top level", () => {
      const out = extractProviderReportedUsageCandidate({
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });
      expect(out).toEqual({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
    });

    it("extracts camelCase usage at top level", () => {
      const out = extractProviderReportedUsageCandidate({
        usage: { promptTokens: 5, completionTokens: 7, totalTokens: 12 },
      });
      expect(out).toEqual({ promptTokens: 5, completionTokens: 7, totalTokens: 12 });
    });

    it("extracts usage nested under response", () => {
      const out = extractProviderReportedUsageCandidate({
        response: { usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } },
      });
      expect(out).toEqual({ prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 });
    });

    it("extracts usage nested under data", () => {
      const out = extractProviderReportedUsageCandidate({
        data: { usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 } },
      });
      expect(out).toEqual({ prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 });
    });

    it("prefers top-level usage over nested envelopes", () => {
      const out = extractProviderReportedUsageCandidate({
        usage: { prompt_tokens: 11, completion_tokens: 22 },
        response: { usage: { prompt_tokens: 999, completion_tokens: 999 } },
      });
      expect(out).toEqual({ prompt_tokens: 11, completion_tokens: 22 });
    });
  });

  describe("rejected shapes", () => {
    it("returns null for null/undefined/primitives", () => {
      expect(extractProviderReportedUsageCandidate(null)).toBeNull();
      expect(extractProviderReportedUsageCandidate(undefined)).toBeNull();
      expect(extractProviderReportedUsageCandidate(42)).toBeNull();
      expect(extractProviderReportedUsageCandidate("usage")).toBeNull();
      expect(extractProviderReportedUsageCandidate(true)).toBeNull();
    });

    it("returns null for arrays at top level or in envelopes", () => {
      expect(extractProviderReportedUsageCandidate([])).toBeNull();
      expect(
        extractProviderReportedUsageCandidate([
          { usage: { prompt_tokens: 1, completion_tokens: 1 } },
        ]),
      ).toBeNull();
    });

    it("returns null when usage value is an array", () => {
      expect(extractProviderReportedUsageCandidate({ usage: [1, 2, 3] })).toBeNull();
    });

    it("returns null when usage value is primitive", () => {
      expect(extractProviderReportedUsageCandidate({ usage: 99 })).toBeNull();
      expect(extractProviderReportedUsageCandidate({ usage: "tokens" })).toBeNull();
      expect(extractProviderReportedUsageCandidate({ usage: null })).toBeNull();
    });

    it("returns null when usage object has no recognized keys", () => {
      expect(
        extractProviderReportedUsageCandidate({ usage: { foo: 1, bar: 2 } }),
      ).toBeNull();
    });

    it("returns null when response/data are not plain objects", () => {
      expect(extractProviderReportedUsageCandidate({ response: 1 })).toBeNull();
      expect(extractProviderReportedUsageCandidate({ data: "x" })).toBeNull();
      expect(extractProviderReportedUsageCandidate({ response: null })).toBeNull();
    });

    it("returns null for an object missing any usage hint", () => {
      expect(
        extractProviderReportedUsageCandidate({
          id: "resp_123",
          model: "gpt-4o-mini",
          choices: [{ message: { content: "hi" } }],
        }),
      ).toBeNull();
    });
  });

  describe("safety: no raw response leakage", () => {
    it("does not return ids, model, choices, headers, metadata, or message content", () => {
      const response = {
        id: "resp_secret_id",
        model: "gpt-4o-mini",
        object: "chat.completion",
        created: 1718000000,
        choices: [{ message: { role: "assistant", content: "PII-bearing reply" } }],
        headers: { authorization: "Bearer SECRET" },
        metadata: { request_id: "req_abc" },
        system_fingerprint: "fp_xyz",
        usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
      };
      const out = extractProviderReportedUsageCandidate(response);
      expect(out).toEqual({ prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 });
      const keys = Object.keys(out as Record<string, unknown>);
      for (const forbidden of [
        "id",
        "model",
        "object",
        "created",
        "choices",
        "headers",
        "metadata",
        "system_fingerprint",
        "authorization",
        "content",
        "message",
      ]) {
        expect(keys).not.toContain(forbidden);
      }
    });

    it("does not retain a reference to the original usage object", () => {
      const usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };
      const out = extractProviderReportedUsageCandidate({ usage });
      expect(out).not.toBe(usage);
      expect(out).toEqual(usage);
    });

    it("does not preserve the raw response object", () => {
      const response = { usage: { prompt_tokens: 1, completion_tokens: 1 }, secret: "x" };
      const out = extractProviderReportedUsageCandidate(response);
      expect(out).not.toBe(response);
      expect((out as Record<string, unknown>).secret).toBeUndefined();
    });
  });

  describe("determinism", () => {
    it("returns equal results across repeated calls", () => {
      const input = {
        response: { usage: { prompt_tokens: 8, completion_tokens: 9, total_tokens: 17 } },
      };
      const a = extractProviderReportedUsageCandidate(input);
      const b = extractProviderReportedUsageCandidate(input);
      const c = extractProviderReportedUsageCandidate(input);
      expect(a).toEqual(b);
      expect(b).toEqual(c);
    });

    it("does not mutate input across repeated calls", () => {
      const input = {
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      };
      const snapshot = JSON.parse(JSON.stringify(input));
      extractProviderReportedUsageCandidate(input);
      extractProviderReportedUsageCandidate(input);
      expect(input).toEqual(snapshot);
    });
  });

  describe("integration with normalizer", () => {
    it("extractor output feeds normalizer for snake_case", () => {
      const candidate = extractProviderReportedUsageCandidate({
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });
      const normalized = normalizeProviderReportedTokenUsage(candidate);
      expect(normalized).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    });

    it("extractor output feeds normalizer for camelCase nested in response", () => {
      const candidate = extractProviderReportedUsageCandidate({
        response: { usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 } },
      });
      const normalized = normalizeProviderReportedTokenUsage(candidate);
      expect(normalized).toEqual({ promptTokens: 2, completionTokens: 3, totalTokens: 5 });
    });

    it("null extractor output normalizes to null", () => {
      const candidate = extractProviderReportedUsageCandidate({ id: "x" });
      expect(candidate).toBeNull();
      expect(normalizeProviderReportedTokenUsage(candidate)).toBeNull();
    });
  });
});
