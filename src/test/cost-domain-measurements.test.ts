import { describe, it, expect } from "vitest";
import {
  asAiDoctorPromptMeasurement,
  asWindowRefreshMeasurement,
  computeObservedCadence,
  detectCrossDomainViolations,
  isTokenRiskEvent,
} from "@/lib/cost/costDomains";
import {
  COST_THRESHOLDS,
  thresholdsAreAllTbd,
} from "@/lib/cost/costThresholds";

describe("cost-domain separation", () => {
  it("DB refresh measurement rejects token fields", () => {
    expect(() =>
      asWindowRefreshMeasurement({
        domain: "db_refresh",
        refreshName: "tent_environment_5m",
        durationMs: 12,
        queueWaitMs: 0,
        deltaRowCount: 3,
        status: "success",
        recordedAt: "2026-01-01T00:00:00.000Z",
        promptTokens: 1234,
      }),
    ).toThrow(/promptTokens/);
  });

  it("DB refresh measurement rejects summary byte size and provider fields", () => {
    const violations = detectCrossDomainViolations("db_refresh", {
      summaryByteSize: 100,
      providerName: "lovable-ai",
      rawHistoryFallback: "summary_stale",
    });
    const keys = violations.map((v) => v.offendingKey).sort();
    expect(keys).toEqual(
      ["providerName", "rawHistoryFallback", "summaryByteSize"].sort(),
    );
  });

  it("AI prompt measurement rejects DB refresh fields", () => {
    expect(() =>
      asAiDoctorPromptMeasurement({
        domain: "llm_prompt",
        promptName: "ai_doctor_review",
        summaryByteSize: 800,
        estimatedPromptTokens: 400,
        providerReportedTokens: null,
        rawHistoryFallback: "summary_fresh",
        status: "success",
        recordedAt: "2026-01-01T00:00:00.000Z",
        durationMs: 50,
      }),
    ).toThrow(/durationMs/);
  });

  it("AI prompt measurement rejects rowsRead/rowsWritten/queueWaitMs/refreshName", () => {
    const violations = detectCrossDomainViolations("llm_prompt", {
      rowsRead: 1,
      rowsWritten: 2,
      queueWaitMs: 3,
      refreshName: "x",
    });
    expect(violations.map((v) => v.offendingKey).sort()).toEqual(
      ["queueWaitMs", "refreshName", "rowsRead", "rowsWritten"].sort(),
    );
  });

  it("ingest-rate helper computes observed cadence from timestamped readings", () => {
    const now = 1_700_000_000_000;
    const ts = [
      now - 30_000, // 30s
      now - 90_000, // 1.5m
      now - 4 * 60_000, // 4m
      now - 30 * 60_000, // 30m
      now - 6 * 60 * 60_000, // 6h
      now - 23 * 60 * 60_000, // 23h
      now - 48 * 60 * 60_000, // 48h (out of 24h window)
    ];
    expect(computeObservedCadence({ nowMs: now, readingTimestampsMs: ts })).toEqual({
      per1m: 1,
      per5m: 3,
      per1h: 4,
      per24h: 6,
    });
  });

  it("cadence helper ignores future timestamps and non-finite values", () => {
    const now = 1_700_000_000_000;
    const ts = [now + 5_000, Number.NaN, Number.POSITIVE_INFINITY, now - 10_000];
    expect(computeObservedCadence({ nowMs: now, readingTimestampsMs: ts })).toEqual({
      per1m: 1,
      per5m: 1,
      per1h: 1,
      per24h: 1,
    });
  });

  it("cadence helper is deterministic and order-independent", () => {
    const now = 1_700_000_000_000;
    const a = [now - 1_000, now - 2_000, now - 3_000];
    const b = [...a].reverse();
    expect(computeObservedCadence({ nowMs: now, readingTimestampsMs: a })).toEqual(
      computeObservedCadence({ nowMs: now, readingTimestampsMs: b }),
    );
  });

  it("stale/missing summary state is represented separately from token cost", () => {
    const m = asAiDoctorPromptMeasurement({
      domain: "llm_prompt",
      promptName: "ai_doctor_review",
      summaryByteSize: 0,
      estimatedPromptTokens: null,
      providerReportedTokens: null,
      rawHistoryFallback: "summary_missing",
      status: "success",
      recordedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(m.rawHistoryFallback).toBe("summary_missing");
    // Token cost fields remain null — stale state did not get collapsed into them.
    expect(m.estimatedPromptTokens).toBeNull();
    expect(m.providerReportedTokens).toBeNull();
  });

  it("raw-history fallback is the token-risk event", () => {
    expect(isTokenRiskEvent("summary_fresh")).toBe(false);
    expect(isTokenRiskEvent("summary_stale")).toBe(true);
    expect(isTokenRiskEvent("summary_missing")).toBe(true);
    expect(isTokenRiskEvent("summary_error")).toBe(true);
  });

  it("threshold config contains only TBD markers, no fabricated numeric limits", () => {
    expect(thresholdsAreAllTbd(COST_THRESHOLDS)).toBe(true);
    for (const group of Object.values(COST_THRESHOLDS)) {
      for (const value of Object.values(group)) {
        expect(typeof value).toBe("string");
        expect(value).toMatch(/^TBD_(MEASURED|LOAD_TEST)$/);
      }
    }
  });

  it("measurement wrappers are deterministic and repeatable", () => {
    const base = {
      domain: "db_refresh" as const,
      refreshName: "x",
      durationMs: 1,
      queueWaitMs: 0,
      deltaRowCount: 0,
      status: "success" as const,
      recordedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(asWindowRefreshMeasurement({ ...base })).toEqual(
      asWindowRefreshMeasurement({ ...base }),
    );
  });
});
