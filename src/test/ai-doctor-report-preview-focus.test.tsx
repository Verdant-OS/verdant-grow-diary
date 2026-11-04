/**
 * Audit finding 12 (keyboard): the AI Doctor report preview is a modal
 * dialog, so opening it moves focus inside and closing it returns focus
 * to the Preview report button. Mirrors the citation modal's handling.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

import AiDoctorDiagnosisPanel from "@/components/AiDoctorDiagnosisPanel";
import type { DiagnosisResult } from "@/lib/aiDoctorEngine";
import type { CitationContext } from "@/lib/aiDoctorEvidenceCitationRules";
import type { AiDoctorReportInput } from "@/lib/aiDoctorReportRules";

afterEach(() => cleanup());

function diag(): DiagnosisResult {
  return {
    summary: "Stub.",
    key_observations: [],
    contributing_factors: [],
    model_confidence_level: "Medium",
    automated_confidence: {
      score: 55,
      level: "Medium",
      explanation: "Mixed.",
      conflicts_detected: [],
    },
    recommended_actions: ["Re-check humidity in 24h."],
    what_not_to_do: [],
    monitoring_priorities: [],
    questions_for_grower: [],
  };
}

function ctx(): CitationContext {
  return {
    availableMetrics: [
      { key: "humidity_pct", statusLabel: "Accepted", derived: false, value: 55 },
      { key: "vpd_kpa", statusLabel: "Accepted", derived: true, value: 1.1 },
    ],
    missingMetrics: ["soil_moisture_pct"],
    hasRecentDiary: false,
    hasRecentPhotos: false,
    envCheckCapturedAt: "2026-06-08T10:00:00Z",
  };
}

function reportInput(): Omit<AiDoctorReportInput, "recommendations"> {
  return {
    generatedAt: "2026-06-08T12:00:00Z",
    summary: "Report summary.",
    alignment: {
      posture: "moderate_context",
      postureLabel: "Moderate evidence",
      postureCopy: "OK.",
      basisCopy: ["humidity_pct accepted"],
      guardrailWarning: null,
      moreDataReminder: "Capture soil moisture.",
      preferredVerbs: [],
    } as any,
    evidenceSummary: {
      liveSensorUsable: false,
      envCheckPresent: true,
      hasRecentDiary: false,
      hasRecentPhotos: false,
    },
    environmentCheck: {
      show: true,
      capturedAt: "2026-06-08T10:00:00Z",
      statusLabel: "Accepted",
      metricRows: [
        { key: "humidity_pct", statusLabel: "Accepted", value: 55, derived: false },
        { key: "vpd_kpa", statusLabel: "Accepted", value: 1.1, derived: true },
      ],
    },
    checklist: [{ key: "soil_moisture_pct", label: "Capture soil moisture", state: "needed" }],
  };
}

function renderPanel() {
  render(
    <AiDoctorDiagnosisPanel
      diagnosis={diag()}
      citationContext={ctx()}
      reportInput={reportInput()}
    />,
  );
  const opener = screen.getByTestId("ai-doctor-diagnosis-preview-report");
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe("AI Doctor report preview — keyboard focus", () => {
  it("moves focus into the dialog when it opens", () => {
    renderPanel();
    expect(document.activeElement).toBe(screen.getByTestId("ai-doctor-diagnosis-preview-close"));
  });

  it("returns focus to Preview report after Close", async () => {
    const opener = renderPanel();
    fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-preview-close"));
    expect(screen.queryByTestId("ai-doctor-diagnosis-preview")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("returns focus to Preview report after Escape", async () => {
    const opener = renderPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("ai-doctor-diagnosis-preview")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
