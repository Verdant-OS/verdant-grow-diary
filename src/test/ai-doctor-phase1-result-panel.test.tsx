/**
 * AI Doctor Phase 1 Result Panel presenter tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { AiDoctorPhase1ResultPanel } from "@/components/AiDoctorPhase1ResultPanel";
import type {
  AiDoctorContextPayload,
  AiDoctorDiagnosisResult,
} from "@/lib/aiDoctorEnginePhase1Foundation";

function ctx(
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

function result(
  overrides: Partial<AiDoctorDiagnosisResult> = {},
): AiDoctorDiagnosisResult {
  return {
    summary: "Cautious observation summary.",
    likely_issue: "Sensor data quality issue.",
    confidence: "low",
    evidence: ["e-one"],
    missing_information: ["m-one"],
    possible_causes: ["c-one"],
    immediate_action: "Observe and re-check.",
    what_not_to_do: ["w-one"],
    follow_up_24h: "Re-confirm tomorrow.",
    recovery_plan_3_day: "Hold stable for 3 days.",
    risk_level: "low",
    action_queue_suggestion: null,
    ...overrides,
  };
}

describe("AiDoctorPhase1ResultPanel", () => {
  it("renders all required result contract fields", () => {
    render(<AiDoctorPhase1ResultPanel context={ctx()} result={result()} />);
    const expected = [
      "ai-doctor-result-summary",
      "ai-doctor-result-likely-issue",
      "ai-doctor-result-confidence",
      "ai-doctor-result-risk",
      "ai-doctor-result-evidence",
      "ai-doctor-result-missing-information",
      "ai-doctor-result-possible-causes",
      "ai-doctor-result-immediate-action",
      "ai-doctor-result-what-not-to-do",
      "ai-doctor-result-follow-up-24h",
      "ai-doctor-result-recovery-plan-3-day",
    ];
    for (const id of expected) expect(screen.getByTestId(id)).toBeTruthy();
  });

  it("includes the sensor drilldown and the review gate", () => {
    render(<AiDoctorPhase1ResultPanel context={ctx()} result={result()} />);
    expect(screen.getByTestId("ai-doctor-sensor-summary-drilldown")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-action-suggestion-empty")).toBeTruthy();
  });

  it("preserves autoflower caution copy when strain is autoflower and confidence is not high", () => {
    render(
      <AiDoctorPhase1ResultPanel
        context={ctx({ strain: "Northern Lights Auto" })}
        result={result({ confidence: "medium" })}
      />,
    );
    expect(screen.getByTestId("ai-doctor-result-autoflower-caution")).toBeTruthy();
  });

  it("renders no write/save/attach/send/execute/run buttons", () => {
    const { container } = render(
      <AiDoctorPhase1ResultPanel context={ctx()} result={result()} />,
    );
    const forbidden = [
      /\bSave\b/i,
      /\bAttach\b/i,
      /\bSend\b/i,
      /\bApprove\b/i,
      /\bExecute\b/i,
      /\bRun\b/i,
      /control device/i,
      /Create Action Queue/i,
      /Add to diary/i,
      /Add to timeline/i,
    ];
    for (const re of forbidden) {
      expect(container.textContent ?? "").not.toMatch(re);
    }
    // No write-button affordances in the form of HTMLButtonElement labels
    const buttons = container.querySelectorAll("button");
    for (const b of Array.from(buttons)) {
      const txt = (b.textContent ?? "").toLowerCase();
      expect(txt).not.toMatch(/save|attach|approve|execute|run|send/);
    }
  });
});

// ---------------------------------------------------------------------------
// Static safety guards across the new read-only surface
// ---------------------------------------------------------------------------

describe("static safety — Phase 1 read-only result surface", () => {
  const files = [
    "src/lib/aiDoctorPhase1ResultViewModel.ts",
    "src/components/AiDoctorPhase1ResultPanel.tsx",
    "src/components/AiDoctorSensorSummaryDrilldown.tsx",
    "src/components/AiDoctorActionSuggestionReviewGate.tsx",
  ];

  function clean(p: string): string {
    return readFileSync(resolve(__dirname, "../..", p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  for (const p of files) {
    it(`${p} has no Supabase/fetch/model/write/device-control surface`, () => {
      const src = clean(p);
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/createClient\s*\(/);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/openai|anthropic|gemini|ai-gateway|lovable\.dev\/ai/i);
      expect(src).not.toMatch(/action_queue.*\.(insert|update|upsert|delete)/i);
      expect(src).not.toMatch(/diary.*\.(insert|update|upsert|delete)/i);
      expect(src).not.toMatch(/timeline.*\.(insert|update|upsert|delete)/i);
      expect(src).not.toMatch(/executeDeviceCommand|deviceControl|sendDeviceCommand/i);
      expect(src).not.toMatch(/service_role/i);
    });
  }
});
