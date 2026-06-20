import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  asAiDoctorPromptMeasurement,
  type AiDoctorPromptMeasurement,
} from "@/lib/cost/costDomains";
import { attachProviderResponseUsageToAiDoctorPromptMeasurement } from "@/lib/cost/aiDoctorProviderResponseMeasurementComposer";
import { extractProviderReportedUsageCandidate } from "@/lib/cost/aiDoctorProviderResponseUsageExtractor";
import { normalizeProviderReportedTokenUsage } from "@/lib/cost/aiDoctorProviderUsageRules";
import { attachProviderReportedUsageToAiDoctorPromptMeasurement } from "@/lib/cost/aiDoctorProviderUsageMeasurementAdapter";

function makeBaseMeasurement(
  overrides: Partial<AiDoctorPromptMeasurement> = {},
): AiDoctorPromptMeasurement {
  return asAiDoctorPromptMeasurement({
    domain: "llm_prompt",
    promptName: "ai_doctor_review",
    summaryByteSize: 1234,
    estimatedPromptTokens: 200,
    providerReportedTokens: null,
    rawHistoryFallback: "summary_fresh",
    status: "success",
    recordedAt: "2026-06-16T12:00:00.000Z",
    ...overrides,
  });
}

describe("attachProviderResponseUsageToAiDoctorPromptMeasurement", () => {
  it("attaches usage from top-level snake_case provider response", () => {
    const base = makeBaseMeasurement();
    const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(base, {
      id: "chatcmpl_abc",
      model: "gpt-4o-mini",
      choices: [{ message: { content: "secret" } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });
    expect(result.providerReportedTokens).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it("attaches usage from top-level camelCase provider response", () => {
    const base = makeBaseMeasurement();
    const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(base, {
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
    expect(result.providerReportedTokens).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it("attaches usage from response.usage", () => {
    const base = makeBaseMeasurement();
    const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(base, {
      response: {
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      },
    });
    expect(result.providerReportedTokens).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });
  });

  it("attaches usage from data.usage", () => {
    const base = makeBaseMeasurement();
    const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(base, {
      data: {
        usage: { prompt_tokens: 7, completion_tokens: 11, total_tokens: 18 },
      },
    });
    expect(result.providerReportedTokens).toEqual({
      promptTokens: 7,
      completionTokens: 11,
      totalTokens: 18,
    });
  });

  it("top-level usage wins over nested usage", () => {
    const base = makeBaseMeasurement();
    const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(base, {
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      response: {
        usage: { prompt_tokens: 999, completion_tokens: 999, total_tokens: 1998 },
      },
      data: {
        usage: { prompt_tokens: 888, completion_tokens: 888, total_tokens: 1776 },
      },
    });
    expect(result.providerReportedTokens).toEqual({
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    });
  });

  it("clears providerReportedTokens for invalid provider responses", () => {
    const base = makeBaseMeasurement({
      providerReportedTokens: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    });
    for (const bad of [null, undefined, 42, "x", true, [], { foo: "bar" }]) {
      const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(
        base,
        bad,
      );
      expect(result.providerReportedTokens).toBeNull();
    }
  });

  it("clears providerReportedTokens for malformed usage", () => {
    const base = makeBaseMeasurement();
    const cases = [
      { usage: { prompt_tokens: -1, completion_tokens: 1, total_tokens: 0 } },
      { usage: { prompt_tokens: "10", completion_tokens: 5, total_tokens: 15 } },
      { usage: { prompt_tokens: 1.5, completion_tokens: 1, total_tokens: 2 } },
      { usage: { prompt_tokens: Number.NaN, completion_tokens: 1, total_tokens: 2 } },
      { usage: { prompt_tokens: 10 } }, // missing completion
    ];
    for (const bad of cases) {
      const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(
        base,
        bad,
      );
      expect(result.providerReportedTokens).toBeNull();
    }
  });

  it("does not preserve raw response fields on the measurement", () => {
    const base = makeBaseMeasurement();
    const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(base, {
      id: "chatcmpl_abc",
      model: "gpt-4o",
      choices: [{ message: { content: "secret" }, finish_reason: "stop" }],
      headers: { authorization: "Bearer sk-secret" },
      metadata: { request_id: "req_1" },
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    });
    const keys = Object.keys(result);
    for (const forbidden of [
      "id",
      "model",
      "choices",
      "headers",
      "metadata",
      "authorization",
      "message",
      "content",
      "request_id",
      "usage",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    expect(JSON.stringify(result)).not.toContain("sk-secret");
    expect(JSON.stringify(result)).not.toContain("chatcmpl_abc");
  });

  it("does not mutate the original measurement", () => {
    const base = makeBaseMeasurement({
      providerReportedTokens: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    });
    const snapshot = JSON.stringify(base);
    const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(base, {
      usage: { prompt_tokens: 99, completion_tokens: 1, total_tokens: 100 },
    });
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(result).not.toBe(base);
  });

  it("preserves existing byte / estimate / fallback fields", () => {
    const base = makeBaseMeasurement({
      summaryByteSize: 4242,
      estimatedPromptTokens: 314,
      rawHistoryFallback: "summary_missing",
      promptName: "ai_doctor_review",
      recordedAt: "2026-06-16T09:00:00.000Z",
    });
    const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(base, {
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });
    expect(result.summaryByteSize).toBe(4242);
    expect(result.estimatedPromptTokens).toBe(314);
    expect(result.rawHistoryFallback).toBe("summary_missing");
    expect(result.promptName).toBe("ai_doctor_review");
    expect(result.recordedAt).toBe("2026-06-16T09:00:00.000Z");
    expect(result.domain).toBe("llm_prompt");
    expect(result.status).toBe("success");
  });

  it("is deterministic across repeated calls", () => {
    const base = makeBaseMeasurement();
    const response = {
      usage: { prompt_tokens: 33, completion_tokens: 11, total_tokens: 44 },
    };
    const a = attachProviderResponseUsageToAiDoctorPromptMeasurement(
      base,
      response,
    );
    const b = attachProviderResponseUsageToAiDoctorPromptMeasurement(
      base,
      response,
    );
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("end-to-end: raw response -> extractor -> normalizer -> composer", () => {
    const raw = {
      id: "chatcmpl_e2e",
      model: "gpt-4o-mini",
      choices: [{ message: { content: "ignored" } }],
      usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 },
    };
    const candidate = extractProviderReportedUsageCandidate(raw);
    const normalized = normalizeProviderReportedTokenUsage(candidate);
    const viaAdapter = attachProviderReportedUsageToAiDoctorPromptMeasurement(
      makeBaseMeasurement(),
      normalized,
    );
    const viaComposer = attachProviderResponseUsageToAiDoctorPromptMeasurement(
      makeBaseMeasurement(),
      raw,
    );
    expect(viaComposer.providerReportedTokens).toEqual({
      promptTokens: 42,
      completionTokens: 8,
      totalTokens: 50,
    });
    expect(viaComposer).toEqual(viaAdapter);
  });

  it("end-to-end: invalid raw response collapses to null at every stage", () => {
    const raw = { id: "x", foo: "bar", choices: [] };
    expect(extractProviderReportedUsageCandidate(raw)).toBeNull();
    expect(normalizeProviderReportedTokenUsage(null)).toBeNull();
    const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(
      makeBaseMeasurement(),
      raw,
    );
    expect(result.providerReportedTokens).toBeNull();
  });

  it("end-to-end: raw provider fields never survive the full chain", () => {
    const raw = {
      id: "chatcmpl_secret_id",
      model: "secret-model",
      authorization: "Bearer sk-LEAKED",
      headers: { "x-api-key": "LEAKED" },
      choices: [{ message: { content: "LEAKED_CONTENT" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(
      makeBaseMeasurement(),
      raw,
    );
    const serialized = JSON.stringify(result);
    for (const leak of [
      "chatcmpl_secret_id",
      "secret-model",
      "sk-LEAKED",
      "x-api-key",
      "LEAKED",
      "LEAKED_CONTENT",
      "choices",
      "authorization",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("structural safety: no forbidden imports or side effects in source", () => {
    const filePath = path.resolve(
      process.cwd(),
      "src/lib/cost/aiDoctorProviderResponseMeasurementComposer.ts",
    );
    const source = fs.readFileSync(filePath, "utf8");
    for (const forbidden of [
      "supabase",
      "fetch(",
      "localStorage",
      "sessionStorage",
      "window.",
      "document.",
      "import React",
      "from \"react",
      "console.log",
      "setTimeout",
      "setInterval",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  describe("uncommon provider response shapes regression", () => {
    const uncommonShapes: ReadonlyArray<{ label: string; input: unknown }> = [
      { label: "{ usage: null }", input: { usage: null } },
      { label: "{ usage: [] }", input: { usage: [] } },
      { label: "{ usage: { total_tokens: 100 } }", input: { usage: { total_tokens: 100 } } },
      { label: "{ usage: { prompt_tokens: 10 } }", input: { usage: { prompt_tokens: 10 } } },
      { label: "{ usage: { completion_tokens: 5 } }", input: { usage: { completion_tokens: 5 } } },
      {
        label: "{ usage: { prompt_tokens: 10, completion_tokens: null } }",
        input: { usage: { prompt_tokens: 10, completion_tokens: null } },
      },
      { label: "{ response: { usage: null } }", input: { response: { usage: null } } },
      { label: "{ data: { usage: [] } }", input: { data: { usage: [] } } },
      {
        label: "{ result: { usage: ... } } unsupported envelope",
        input: { result: { usage: { prompt_tokens: 10, completion_tokens: 5 } } },
      },
      {
        label: "{ choices: [{ usage: ... }] } not searched recursively",
        input: { choices: [{ usage: { prompt_tokens: 10, completion_tokens: 5 } }] },
      },
      {
        label: "{ usage: { input_tokens, output_tokens } } Anthropic-style",
        input: { usage: { input_tokens: 10, output_tokens: 5 } },
      },
      {
        label: "deeply nested usage",
        input: { a: { b: { c: { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } } } },
      },
    ];

    for (const { label, input } of uncommonShapes) {
      it(`clears providerReportedTokens for ${label}`, () => {
        const base = makeBaseMeasurement({
          providerReportedTokens: { promptTokens: 9, completionTokens: 9, totalTokens: 18 },
        });
        const baseSnapshot = JSON.stringify(base);

        const result = attachProviderResponseUsageToAiDoctorPromptMeasurement(
          base,
          input,
        );

        expect(result.providerReportedTokens).toBeNull();
        expect(JSON.stringify(base)).toBe(baseSnapshot);
        const keys = Object.keys(result);
        for (const forbidden of [
          "id",
          "model",
          "choices",
          "headers",
          "metadata",
          "authorization",
          "usage",
          "response",
          "data",
          "result",
          "input_tokens",
          "output_tokens",
        ]) {
          expect(keys).not.toContain(forbidden);
        }
      });
    }
  });
});

describe("cost library entrypoint (src/lib/cost)", () => {
  it("re-exports the composer and attaches valid usage end-to-end", async () => {
    const mod = await import("@/lib/cost");
    expect(typeof mod.attachProviderResponseUsageToAiDoctorPromptMeasurement).toBe(
      "function",
    );

    const base = makeBaseMeasurement();
    const result = mod.attachProviderResponseUsageToAiDoctorPromptMeasurement(
      base,
      {
        id: "chatcmpl_entrypoint",
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      },
    );

    expect(result.providerReportedTokens).toEqual({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    });
    expect(JSON.stringify(result)).not.toContain("chatcmpl_entrypoint");
  });

  it("structural safety: entrypoint has no forbidden imports or side effects", () => {
    const filePath = path.resolve(process.cwd(), "src/lib/cost/index.ts");
    const source = fs.readFileSync(filePath, "utf8");
    for (const forbidden of [
      "fetch(",
      "supabase",
      "localStorage",
      "sessionStorage",
      "window.",
      "document.",
      "setTimeout",
      "setInterval",
      "import React",
      "from \"react",
      "supabase/functions",
      "@/integrations/supabase",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

