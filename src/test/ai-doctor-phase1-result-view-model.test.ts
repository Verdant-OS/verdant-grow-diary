/**
 * AI Doctor Phase 1 — Result view model tests (pure).
 */
import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_METRIC_ORDER,
  AI_DOCTOR_SOURCE_ORDER,
  NO_TRUSTED_VALUE_LABEL,
  buildAiDoctorPhase1ResultViewModel,
  buildSensorSummaryRows,
  buildSourceBreakdownRows,
  formatMetricLabel,
  formatMetricValue,
  formatSourceLabel,
} from "@/lib/aiDoctorPhase1ResultViewModel";
import type {
  AiDoctorContextPayload,
  AiDoctorDiagnosisResult,
} from "@/lib/aiDoctorEnginePhase1Foundation";

function emptyContext(
  overrides: Partial<AiDoctorContextPayload> = {},
): AiDoctorContextPayload {
  return {
    grow_id: "g1",
    tent_id: "t1",
    plant_id: "p1",
    plant_name: "P",
    strain: null,
    stage: "veg",
    medium: null,
    pot_size: null,
    recent_logs: [],
    recent_photos_count: 0,
    recent_watering_events: 0,
    recent_feeding_events: 0,
    sensor_summary: [],
    source_breakdown: [],
    missing_context: [],
    context_trust_level: "low",
    ...overrides,
  };
}

function baseResult(
  overrides: Partial<AiDoctorDiagnosisResult> = {},
): AiDoctorDiagnosisResult {
  return {
    summary: "S",
    likely_issue: "L",
    confidence: "low",
    evidence: [],
    missing_information: [],
    possible_causes: [],
    immediate_action: "Observe.",
    what_not_to_do: [],
    follow_up_24h: "Re-check.",
    recovery_plan_3_day: "Stable.",
    risk_level: "low",
    action_queue_suggestion: null,
    ...overrides,
  };
}

describe("view model — metric ordering", () => {
  it("emits all 9 metrics in canonical order even when context is empty", () => {
    const rows = buildSensorSummaryRows(emptyContext());
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.metric)).toEqual([...AI_DOCTOR_METRIC_ORDER]);
  });

  it("preserves canonical order regardless of context insertion order", () => {
    const ctx = emptyContext({
      sensor_summary: [
        {
          metric: "reservoir_ph",
          latest_value: 6,
          latest_source: "live",
          latest_captured_at: "2026-06-04T11:00:00Z",
          is_stale: false,
          is_invalid: false,
          is_degraded: false,
          sample_count_7d: 1,
        },
        {
          metric: "temperature_c",
          latest_value: 22,
          latest_source: "live",
          latest_captured_at: "2026-06-04T11:00:00Z",
          is_stale: false,
          is_invalid: false,
          is_degraded: false,
          sample_count_7d: 1,
        },
      ],
    });
    const rows = buildSensorSummaryRows(ctx);
    expect(rows[0].metric).toBe("temperature_c");
    expect(rows[7].metric).toBe("reservoir_ph");
  });
});

describe("view model — source ordering", () => {
  it("emits sources in canonical enum order with zero-fill", () => {
    const rows = buildSourceBreakdownRows(
      emptyContext({
        source_breakdown: [
          { source: "invalid", reading_count_7d: 2 },
          { source: "live", reading_count_7d: 5 },
        ],
      }),
    );
    expect(rows.map((r) => r.source)).toEqual([...AI_DOCTOR_SOURCE_ORDER]);
    expect(rows.find((r) => r.source === "live")!.count).toBe(5);
    expect(rows.find((r) => r.source === "invalid")!.count).toBe(2);
    expect(rows.find((r) => r.source === "csv")!.count).toBe(0);
  });
});

describe("view model — missing values never invented", () => {
  it("formats null values as No trusted value", () => {
    const rows = buildSensorSummaryRows(emptyContext());
    for (const r of rows) {
      expect(r.latestValueDisplay).toBe(NO_TRUSTED_VALUE_LABEL);
      expect(r.latestSourceDisplay).toBe(NO_TRUSTED_VALUE_LABEL);
      expect(r.latestCapturedAtDisplay).toBe(NO_TRUSTED_VALUE_LABEL);
      expect(r.freshness.kind).toBe("missing");
    }
  });

  it("formats numeric values with units and never returns NaN/undefined", () => {
    expect(formatMetricValue("temperature_c", 22)).toContain("22");
    expect(formatMetricValue("temperature_c", 22)).toContain("°C");
    expect(formatMetricValue("vpd_kpa", null)).toBe(NO_TRUSTED_VALUE_LABEL);
  });

  it("exposes display labels for every metric/source", () => {
    for (const m of AI_DOCTOR_METRIC_ORDER) {
      expect(formatMetricLabel(m)).toBeTruthy();
    }
    for (const s of AI_DOCTOR_SOURCE_ORDER) {
      expect(formatSourceLabel(s)).toBeTruthy();
    }
  });
});

describe("view model — top-level result mapping", () => {
  it("passes through all required result fields", () => {
    const vm = buildAiDoctorPhase1ResultViewModel({
      context: emptyContext(),
      result: baseResult({
        evidence: ["e1"],
        missing_information: ["m1"],
        possible_causes: ["c1"],
        what_not_to_do: ["w1"],
      }),
    });
    expect(vm.summary).toBe("S");
    expect(vm.likely_issue).toBe("L");
    expect(vm.confidence).toBe("low");
    expect(vm.risk_level).toBe("low");
    expect(vm.evidence).toEqual(["e1"]);
    expect(vm.missing_information).toEqual(["m1"]);
    expect(vm.possible_causes).toEqual(["c1"]);
    expect(vm.what_not_to_do).toEqual(["w1"]);
    expect(vm.confidence_copy.length).toBeGreaterThan(0);
    expect(vm.risk_copy.length).toBeGreaterThan(0);
  });

  it("surfaces autoflower caution when strain hints autoflower + non-high confidence", () => {
    const vm = buildAiDoctorPhase1ResultViewModel({
      context: emptyContext({ strain: "Northern Lights Auto" }),
      result: baseResult({ confidence: "medium" }),
    });
    expect(vm.autoflower_caution).toBe(true);
  });

  it("suppresses autoflower caution at high confidence", () => {
    const vm = buildAiDoctorPhase1ResultViewModel({
      context: emptyContext({ strain: "Auto Skunk" }),
      result: baseResult({ confidence: "high" }),
    });
    expect(vm.autoflower_caution).toBe(false);
  });
});
