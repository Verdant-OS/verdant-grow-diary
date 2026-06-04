/**
 * Tests — AiDoctorDiagnosisPanel presenter wiring.
 * Pure render tests. No Supabase, no network, no model calls.
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AiDoctorDiagnosisPanel, {
  AI_DOCTOR_DIAGNOSIS_EMPTY_COPY,
  AI_DOCTOR_DIAGNOSIS_LOADING_COPY,
  AI_DOCTOR_DIAGNOSIS_FALLBACK_CONFIDENCE_COPY,
} from "../components/AiDoctorDiagnosisPanel";
import type { DiagnosisResult } from "../lib/aiDoctorEngine";

function baseResult(overrides: Partial<DiagnosisResult> = {}): DiagnosisResult {
  return {
    summary: "Stub diagnosis summary.",
    key_observations: ["leaf droop"],
    contributing_factors: ["live sensor context present"],
    model_confidence_level: "High",
    automated_confidence: {
      score: 55,
      level: "Medium",
      explanation: "Mixed signals across sources.",
      conflicts_detected: ["vpd_stale", "temp_out_of_band"],
    },
    recommended_actions: ["Observe and re-check in 24h."],
    what_not_to_do: ["Do not adjust nutrients based on this output."],
    monitoring_priorities: ["Re-check sensor freshness."],
    questions_for_grower: ["What changed in the last 24h?"],
    ...overrides,
  };
}

describe("AiDoctorDiagnosisPanel", () => {
  afterEachCleanup();

  it("renders empty state when no diagnosis is provided", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={null} />);
    const panel = screen.getByTestId("ai-doctor-diagnosis-panel");
    expect(panel.getAttribute("data-state")).toBe("empty");
    expect(screen.getByTestId("ai-doctor-diagnosis-empty").textContent).toBe(
      AI_DOCTOR_DIAGNOSIS_EMPTY_COPY,
    );
  });

  it("renders loading state when isLoading and no diagnosis", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={null} isLoading />);
    const panel = screen.getByTestId("ai-doctor-diagnosis-panel");
    expect(panel.getAttribute("data-state")).toBe("loading");
    expect(screen.getByTestId("ai-doctor-diagnosis-loading").textContent).toBe(
      AI_DOCTOR_DIAGNOSIS_LOADING_COPY,
    );
  });

  it("renders summary", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={baseResult()} />);
    expect(screen.getByTestId("ai-doctor-diagnosis-summary").textContent).toBe(
      "Stub diagnosis summary.",
    );
  });

  it("renders automated confidence level and score (not raw model)", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={baseResult()} />);
    const badge = screen.getByTestId("ai-doctor-diagnosis-confidence");
    expect(badge.getAttribute("data-confidence-level")).toBe("Medium");
    expect(badge.getAttribute("data-confidence-score")).toBe("55");
    expect(badge.textContent).toMatch(/Medium/);
    expect(badge.textContent).not.toMatch(/High/);
  });

  it("renders confidence explanation", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={baseResult()} />);
    expect(
      screen.getByTestId("ai-doctor-diagnosis-confidence-explanation")
        .textContent,
    ).toBe("Mixed signals across sources.");
  });

  it("hides raw model confidence from primary confidence display", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={baseResult()} />);
    const badge = screen.getByTestId("ai-doctor-diagnosis-confidence");
    // Raw model said "High"; user-visible confidence must not be High.
    expect(badge.getAttribute("data-confidence-level")).not.toBe("High");
  });

  it("exposes raw model confidence only in audit metadata", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={baseResult()} />);
    const audit = screen.getByTestId(
      "ai-doctor-diagnosis-audit-raw-model-confidence",
    );
    expect(audit.getAttribute("data-raw-model-confidence")).toBe("High");
    expect(
      screen.getByTestId("ai-doctor-diagnosis-audit-downgrade"),
    ).toBeTruthy();
  });

  it("renders conflicts with calm review-first language and severity", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={baseResult()} />);
    const conflicts = screen.getByTestId("ai-doctor-diagnosis-conflicts");
    expect(conflicts.textContent).toMatch(/Conflicts detected/);
    expect(conflicts.textContent).toMatch(/Review these signals/i);
    const first = screen.getByTestId("ai-doctor-diagnosis-conflict-0");
    expect(first.getAttribute("data-severity")).toBe("review");
    expect(first.textContent).toMatch(/vpd_stale/);
  });

  it("renders fallback copy when automated confidence is the conservative default", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseResult({
          automated_confidence: undefined as unknown as DiagnosisResult["automated_confidence"],
        })}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-confidence-fallback").textContent,
    ).toBe(AI_DOCTOR_DIAGNOSIS_FALLBACK_CONFIDENCE_COPY);
    const panel = screen.getByTestId("ai-doctor-diagnosis-panel");
    expect(panel.getAttribute("data-confidence-fallback")).toBe("true");
  });

  it("does not crash on missing optional fields", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={{
          summary: "",
          key_observations: [],
          contributing_factors: [],
          model_confidence_level: "Low",
          automated_confidence: {
            score: 50,
            level: "Medium",
            explanation: "ok",
          },
          recommended_actions: [],
          what_not_to_do: [],
          monitoring_priorities: [],
          questions_for_grower: [],
        }}
      />,
    );
    expect(screen.getByTestId("ai-doctor-diagnosis-panel")).toBeTruthy();
    // No conflicts subsection when conflicts are absent
    expect(
      screen.queryByTestId("ai-doctor-diagnosis-conflicts"),
    ).toBeNull();
  });

  it("renders all content sections when populated", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={baseResult()} />);
    for (const tid of [
      "ai-doctor-diagnosis-key-observations",
      "ai-doctor-diagnosis-contributing-factors",
      "ai-doctor-diagnosis-recommended-actions",
      "ai-doctor-diagnosis-what-not-to-do",
      "ai-doctor-diagnosis-monitoring-priorities",
      "ai-doctor-diagnosis-questions-for-grower",
    ]) {
      expect(screen.getByTestId(tid)).toBeTruthy();
    }
  });
});

describe("AiDoctorDiagnosisPanel — static safety", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../components/AiDoctorDiagnosisPanel.tsx"),
    "utf8",
  );

  it("contains no privileged service key references", () => {
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("contains no edge invocations or fetches", () => {
    expect(SRC).not.toMatch(/functions\.invoke/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
  });

  it("performs no Supabase writes", () => {
    for (const t of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(SRC).not.toContain(t);
    }
  });

  it("does not touch alerts or action_queue tables", () => {
    expect(SRC).not.toMatch(/from\(\s*['"]alerts['"]\s*\)/);
    expect(SRC).not.toMatch(/from\(\s*['"]action_queue['"]\s*\)/);
  });

  it("contains no device-control or automation strings", () => {
    for (const t of [
      "execute_device",
      "setpoint_write",
      "irrigation_control",
      "light_control",
      "fan_control",
      "auto_apply",
      "autopilot",
      "scheduler.run",
    ]) {
      expect(SRC).not.toContain(t);
    }
  });
});

// ----- helpers -----
import { afterEach } from "vitest";
function afterEachCleanup() {
  afterEach(() => cleanup());
}
