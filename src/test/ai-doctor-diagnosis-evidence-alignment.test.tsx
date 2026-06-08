import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  buildDiagnosisEvidenceAlignmentVM,
  computeRecommendationPosture,
  AGGRESSIVE_CHANGES_GUARDRAIL,
  type DiagnosisEvidenceAlignmentInput,
} from "@/lib/aiDoctorDiagnosisEvidenceAlignmentRules";
import { buildAiDoctorDiagnosisEvidenceAlignmentVM } from "@/lib/aiDoctorViewModel";
import AiDoctorDiagnosisPanel from "@/components/AiDoctorDiagnosisPanel";
import type { DiagnosisResult } from "@/lib/aiDoctorEngine";
import type { AiDoctorSensorContext } from "@/lib/aiDoctorSensorContextRules";

function base(
  overrides: Partial<DiagnosisEvidenceAlignmentInput> = {},
): DiagnosisEvidenceAlignmentInput {
  return {
    hasLiveSensor: false,
    liveSensorUsable: false,
    envCheckPresent: false,
    envCheckAcceptedCount: 0,
    envCheckRejectedCount: 0,
    envCheckNotCheckedCount: 0,
    envCheckHasDerivedVpd: false,
    hasRecentDiary: false,
    hasRecentPhotos: false,
    moreDataNeededCount: 0,
    ...overrides,
  };
}

function liveSensor(): AiDoctorSensorContext {
  return {
    sourceState: "live",
    sourceLabel: "Live",
    capturedAt: "2026-06-08T12:00:00.000Z",
    recordedAt: "2026-06-08T12:00:00.000Z",
    isStale: false,
    isInvalid: false,
    usableMetrics: ["temperature_c"],
    missingMetrics: [],
    invalidMetrics: [],
    confidenceImpact: "none",
    contextSummary: "Live sensor reading with 1 usable metric(s).",
    safetyNotes: [],
  };
}

const ACCEPTED_NOTE = [
  "EcoWitt Environment Check",
  "Source: local EcoWitt validation (test/local data, not live device control).",
  "Captured at: 2026-06-08T12:00:00.000Z",
  "Validation status: accepted",
  "Accepted metrics: 3 · Rejected metrics: 0",
  "",
  "Per-metric results:",
  "  • temp_f: accepted (value=72.4)",
  "  • humidity_pct: accepted (value=55)",
  "  • vpd_kpa: accepted (value=1.1) — derived",
].join("\n");

const REJECTED_NOTE = [
  "EcoWitt Environment Check",
  "Source: local EcoWitt validation (test/local data, not live device control).",
  "Captured at: 2026-06-08T12:00:00.000Z",
  "Validation status: rejected",
  "Accepted metrics: 1 · Rejected metrics: 1",
  "",
  "Per-metric results:",
  "  • temp_f: accepted (value=72.4)",
  "  • humidity_pct: rejected (value=120) — out of range",
  "  • soil_moisture_pct: not_checked (value=—)",
].join("\n");

const stubDiagnosis: DiagnosisResult = {
  summary: "Stub diagnosis.",
  key_observations: [],
  contributing_factors: [],
  recommended_actions: [],
  what_not_to_do: [],
  monitoring_priorities: [],
  questions_for_grower: [],
  model_confidence_level: "Low",
  automated_confidence: {
    score: 50,
    level: "Medium",
    explanation: "Test.",
  },
} as unknown as DiagnosisResult;

describe("aiDoctorDiagnosisEvidenceAlignmentRules — posture mapping", () => {
  it("live + accepted env check + diary/photo → strong_context", () => {
    const p = computeRecommendationPosture(
      base({
        hasLiveSensor: true,
        liveSensorUsable: true,
        envCheckPresent: true,
        envCheckAcceptedCount: 3,
        hasRecentDiary: true,
      }),
    );
    expect(p).toBe("strong_context");
  });

  it("accepted env check without live sensor → max moderate_context", () => {
    const p = computeRecommendationPosture(
      base({
        envCheckPresent: true,
        envCheckAcceptedCount: 3,
        hasRecentDiary: true,
        hasRecentPhotos: true,
      }),
    );
    expect(p).toBe("moderate_context");
  });

  it("mixed/rejected/not_checked env check → max weak_context", () => {
    const p = computeRecommendationPosture(
      base({
        hasLiveSensor: true,
        liveSensorUsable: true,
        envCheckPresent: true,
        envCheckAcceptedCount: 1,
        envCheckRejectedCount: 1,
        hasRecentDiary: true,
        hasRecentPhotos: true,
      }),
    );
    expect(p).toBe("weak_context");
  });

  it("no evidence at all → insufficient_context", () => {
    expect(computeRecommendationPosture(base())).toBe("insufficient_context");
  });

  it("local/test-only evidence never produces strong_context", () => {
    const p = computeRecommendationPosture(
      base({
        envCheckPresent: true,
        envCheckAcceptedCount: 3,
        hasRecentDiary: true,
        hasRecentPhotos: true,
      }),
    );
    expect(p).not.toBe("strong_context");
  });
});

describe("aiDoctorDiagnosisEvidenceAlignmentRules — basis copy + guardrails", () => {
  it("derived VPD basis copy says context only, not raw sensor reading", () => {
    const vm = buildDiagnosisEvidenceAlignmentVM(
      base({
        envCheckPresent: true,
        envCheckAcceptedCount: 3,
        envCheckHasDerivedVpd: true,
      }),
    );
    expect(
      vm.basisCopy.some((b) =>
        /VPD was used as derived context, not as a raw sensor reading/i.test(b),
      ),
    ).toBe(true);
  });

  it("rejected/not_checked basis copy says recommendations should stay conservative", () => {
    const vm = buildDiagnosisEvidenceAlignmentVM(
      base({
        envCheckPresent: true,
        envCheckAcceptedCount: 1,
        envCheckRejectedCount: 1,
      }),
    );
    expect(
      vm.basisCopy.some((b) =>
        /rejected or not checked, so recommendations should stay conservative/i.test(b),
      ),
    ).toBe(true);
  });

  it("missing live sensor basis copy appears when no live telemetry exists", () => {
    const vm = buildDiagnosisEvidenceAlignmentVM(
      base({
        envCheckPresent: true,
        envCheckAcceptedCount: 1,
      }),
    );
    expect(
      vm.basisCopy.some((b) =>
        /No recent live sensor readings were available/i.test(b),
      ),
    ).toBe(true);
  });

  it("weak/insufficient posture emits the aggressive-changes guardrail", () => {
    const weak = buildDiagnosisEvidenceAlignmentVM(
      base({
        envCheckPresent: true,
        envCheckAcceptedCount: 0,
        envCheckRejectedCount: 1,
      }),
    );
    const insufficient = buildDiagnosisEvidenceAlignmentVM(base());
    expect(weak.guardrailWarning).toBe(AGGRESSIVE_CHANGES_GUARDRAIL);
    expect(insufficient.guardrailWarning).toBe(AGGRESSIVE_CHANGES_GUARDRAIL);
  });

  it("strong/moderate posture VM contains no device-control or autopilot verbs", () => {
    const strong = buildDiagnosisEvidenceAlignmentVM(
      base({
        hasLiveSensor: true,
        liveSensorUsable: true,
        envCheckPresent: true,
        envCheckAcceptedCount: 3,
        hasRecentDiary: true,
      }),
    );
    const moderate = buildDiagnosisEvidenceAlignmentVM(
      base({ hasLiveSensor: true, liveSensorUsable: true }),
    );
    const text =
      JSON.stringify(strong) + JSON.stringify(moderate);
    expect(text).not.toMatch(
      /turn_on|turn_off|toggleDevice|setOutletState|autopilot|automate/i,
    );
  });

  it("more-data-needed reminder appears with count when >0", () => {
    const vm = buildDiagnosisEvidenceAlignmentVM(
      base({ moreDataNeededCount: 3 }),
    );
    expect(vm.moreDataReminder).toMatch(/3 items/);
    expect(vm.moreDataReminder).toMatch(/missing Environment Check metrics/i);
  });
});

describe("buildAiDoctorDiagnosisEvidenceAlignmentVM — wiring", () => {
  it("live + accepted env-check + diary maps to strong_context", () => {
    const vm = buildAiDoctorDiagnosisEvidenceAlignmentVM({
      sensorContext: liveSensor(),
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00.000Z", noteBody: ACCEPTED_NOTE },
      ],
      hasRecentDiary: true,
    });
    expect(vm.posture).toBe("strong_context");
  });

  it("rejected env-check caps posture at weak_context even with live + diary", () => {
    const vm = buildAiDoctorDiagnosisEvidenceAlignmentVM({
      sensorContext: liveSensor(),
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00.000Z", noteBody: REJECTED_NOTE },
      ],
      hasRecentDiary: true,
    });
    expect(vm.posture).toBe("weak_context");
    expect(vm.guardrailWarning).toBe(AGGRESSIVE_CHANGES_GUARDRAIL);
  });
});

describe("AiDoctorDiagnosisPanel — evidence alignment rendering", () => {
  it("renders posture label and copy when evidenceAlignment provided", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(
      base({
        hasLiveSensor: true,
        liveSensorUsable: true,
        envCheckPresent: true,
        envCheckAcceptedCount: 3,
        hasRecentDiary: true,
      }),
    );
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={stubDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    expect(screen.getByTestId("ai-doctor-diagnosis-posture-label")).toHaveTextContent(
      "Strong context",
    );
    expect(screen.getByTestId("ai-doctor-diagnosis-posture-copy")).toHaveTextContent(
      /multiple supporting evidence sources/i,
    );
  });

  it("renders guardrail warning when posture is weak", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(
      base({
        envCheckPresent: true,
        envCheckRejectedCount: 1,
      }),
    );
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={stubDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-guardrail-warning"),
    ).toHaveTextContent(/Do not make aggressive nutrient, irrigation, or equipment changes/i);
  });

  it("renders more-data-needed link when count > 0", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(
      base({ moreDataNeededCount: 2 }),
    );
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={stubDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-more-data-reminder"),
    ).toHaveTextContent(/2 items/);
  });

  it("omits the evidence alignment section entirely when prop absent", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={stubDiagnosis} />);
    expect(
      screen.queryByTestId("ai-doctor-diagnosis-evidence-alignment"),
    ).toBeNull();
  });

  it("visible alignment output does not expose tokens/auth/user_id/service_role", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(
      base({
        envCheckPresent: true,
        envCheckRejectedCount: 1,
        envCheckHasDerivedVpd: true,
        moreDataNeededCount: 1,
      }),
    );
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={stubDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(
      /service_role|bridge_token|authorization|bearer\s|jwt|api_key|user_id/i,
    );
  });
});

describe("static safety scan — alignment files", () => {
  it("no writes / functions.invoke / action_queue / device-control", async () => {
    const fs = await import("node:fs/promises");
    const files = [
      "src/lib/aiDoctorDiagnosisEvidenceAlignmentRules.ts",
      "src/lib/aiDoctorViewModel.ts",
      "src/components/AiDoctorDiagnosisPanel.tsx",
    ];
    for (const f of files) {
      const src = await fs.readFile(f, "utf8");
      expect(src).not.toMatch(/sensor_readings/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(
        /turn_on|turn_off|device_control|toggleDevice|setOutletState/i,
      );
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
  });
});
