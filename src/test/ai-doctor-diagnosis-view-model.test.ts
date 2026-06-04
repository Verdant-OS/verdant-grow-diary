/**
 * Tests — AI Doctor 2.0 diagnosis view-model adapter.
 *
 * Pure / deterministic. No network, no Supabase, no UI.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptDiagnosisResultToViewModel } from "../lib/aiDoctorDiagnosisViewModel";
import type { DiagnosisResult } from "../lib/aiDoctorEngine";

function baseResult(overrides: Partial<DiagnosisResult> = {}): DiagnosisResult {
  return {
    summary: "Stub diagnosis summary.",
    key_observations: ["leaf droop"],
    contributing_factors: ["Sensor context sources present: live."],
    model_confidence_level: "High", // raw LLM self-report
    automated_confidence: {
      score: 55,
      level: "Medium",
      explanation: "Mixed signals.",
      conflicts_detected: ["vpd_stale"],
    },
    recommended_actions: ["Observe and re-check."],
    what_not_to_do: ["Do not adjust nutrients based on this output."],
    monitoring_priorities: ["Re-check sensor freshness."],
    questions_for_grower: ["What changed in the last 24h?"],
    ...overrides,
  };
}

describe("adaptDiagnosisResultToViewModel", () => {
  it("converts summary into display summary", () => {
    const vm = adaptDiagnosisResultToViewModel(baseResult());
    expect(vm.summary).toBe("Stub diagnosis summary.");
  });

  it("uses automated confidence as final confidence (not raw model)", () => {
    const vm = adaptDiagnosisResultToViewModel(baseResult());
    expect(vm.confidence.level).toBe("Medium");
    expect(vm.confidence.score).toBe(55);
    expect(vm.confidence.level).not.toBe("High");
  });

  it("preserves raw model confidence as audit metadata only", () => {
    const vm = adaptDiagnosisResultToViewModel(baseResult());
    expect(vm.audit.raw_model_confidence_level).toBe("High");
    expect(vm.audit.automated_downgraded_model).toBe(true);
  });

  it("does not mark a downgrade when automated >= raw", () => {
    const vm = adaptDiagnosisResultToViewModel(
      baseResult({
        model_confidence_level: "Low",
        automated_confidence: {
          score: 80,
          level: "High",
          explanation: "Strong corroboration.",
        },
      }),
    );
    expect(vm.audit.automated_downgraded_model).toBe(false);
    expect(vm.confidence.level).toBe("High");
  });

  it("displays confidence explanation and conflicts detected", () => {
    const vm = adaptDiagnosisResultToViewModel(baseResult());
    expect(vm.confidence.explanation).toBe("Mixed signals.");
    expect(vm.confidence.conflicts).toEqual(["vpd_stale"]);
  });

  it("displays questions for grower and what-not-to-do", () => {
    const vm = adaptDiagnosisResultToViewModel(baseResult());
    expect(vm.questions_for_grower).toEqual(["What changed in the last 24h?"]);
    expect(vm.missing_context).toEqual(["What changed in the last 24h?"]);
    expect(vm.what_not_to_do[0]).toMatch(/do not adjust nutrients/i);
  });

  it("falls back safely when automated_confidence is malformed", () => {
    const vm = adaptDiagnosisResultToViewModel(
      baseResult({
        automated_confidence: undefined as unknown as DiagnosisResult["automated_confidence"],
      }),
    );
    expect(vm.confidence.level).toBe("Low");
    expect(vm.confidence.score).toBe(40);
    expect(vm.confidence.explanation).toMatch(/conservative default/i);
  });

  it("handles missing optional fields without crashing", () => {
    const vm = adaptDiagnosisResultToViewModel(null);
    expect(vm.summary).toMatch(/observe and re-check/i);
    expect(vm.key_observations).toEqual([]);
    expect(vm.contributing_factors).toEqual([]);
    expect(vm.recommended_actions).toEqual([]);
    expect(vm.what_not_to_do).toEqual([]);
    expect(vm.monitoring_priorities).toEqual([]);
    expect(vm.questions_for_grower).toEqual([]);
    expect(vm.missing_context).toEqual([]);
    expect(vm.confidence.level).toBe("Low");
    expect(vm.confidence.conflicts).toEqual([]);
    expect(vm.audit.raw_model_confidence_level).toBe("Low");
    expect(vm.audit.automated_downgraded_model).toBe(false);
  });

  it("treats invalid raw model confidence string as Low", () => {
    const vm = adaptDiagnosisResultToViewModel(
      baseResult({
        model_confidence_level: "bogus" as unknown as DiagnosisResult["model_confidence_level"],
      }),
    );
    expect(vm.audit.raw_model_confidence_level).toBe("Low");
  });
});

describe("AI Doctor 2.0 diagnosis view-model — static safety", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../lib/aiDoctorDiagnosisViewModel.ts"),
    "utf8",
  );

  it("contains no privileged service key references", () => {
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("contains no functions.invoke or fetch calls", () => {
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
  });

  it("performs no Supabase writes", () => {
    for (const term of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(SRC).not.toContain(term);
    }
  });

  it("does not reference alerts or action_queue tables", () => {
    expect(SRC).not.toMatch(/from\(\s*['"]alerts['"]\s*\)/);
    expect(SRC).not.toMatch(/from\(\s*['"]action_queue['"]\s*\)/);
  });

  it("contains no device-control or automation strings", () => {
    for (const term of [
      "execute_device",
      "setpoint_write",
      "irrigation_control",
      "light_control",
      "fan_control",
      "auto_apply",
      "autopilot",
    ]) {
      expect(SRC).not.toContain(term);
    }
  });
});
