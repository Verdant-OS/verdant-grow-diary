/**
 * premium-export-panel-pending.test.tsx
 *
 * Verifies AiDoctorDiagnosisPanel premium download buttons:
 *   - disable while the server preflight is in flight
 *   - never trigger duplicate downloads from rapid clicks
 *   - call the builder exactly once when preflight allows
 *   - never call the builder when preflight denies
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { DiagnosisResult } from "@/lib/aiDoctorEngine";
import type { AiDoctorReportInput } from "@/lib/aiDoctorReportRules";

const buildPdfSpy = vi.fn(() => new Uint8Array([1, 2, 3]));
const downloadPdfSpy = vi.fn();
const buildCsvSpy = vi.fn(() => "a,b\n1,2");
const downloadCsvSpy = vi.fn();

vi.mock("@/lib/aiDoctorReportRules", async () => {
  const actual: any = await vi.importActual("@/lib/aiDoctorReportRules");
  return {
    ...actual,
    buildAiDoctorReportPdfBytes: (...args: any[]) => buildPdfSpy.apply(null, args as []),
    downloadAiDoctorReportPdf: (...args: any[]) => downloadPdfSpy.apply(null, args as []),
  };
});
vi.mock("@/lib/aiDoctorEvidenceCsvExportRules", async () => {
  const actual: any = await vi.importActual(
    "@/lib/aiDoctorEvidenceCsvExportRules",
  );
  return {
    ...actual,
    buildAiDoctorEvidenceCsv: (...args: any[]) => buildCsvSpy.apply(null, args as []),
    downloadAiDoctorEvidenceCsv: (...args: any[]) => downloadCsvSpy.apply(null, args as []),
  };
});

let invokeImpl: (...args: unknown[]) => unknown = async () => ({
  data: { ok: true },
  error: null,
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeImpl(...a) },
  },
}));

import AiDoctorDiagnosisPanel from "@/components/AiDoctorDiagnosisPanel";

function diag(): DiagnosisResult {
  return {
    summary: "Stable canopy.",
    likely_issue: "None",
    confidence: 0.6,
    evidence: [],
    missing_information: [],
    possible_causes: [],
    immediate_action: "Hold steady.",
    what_not_to_do: [],
    follow_up_24h: [],
    recovery_plan_3d: [],
    risk_level: "low",
    key_observations: [],
    recommended_actions: ["Hold steady."],
  } as unknown as DiagnosisResult;
}
function reportInput(): AiDoctorReportInput {
  return {
    generatedAt: "2026-06-08T12:00:00Z",
    summary: "Stable.",
    perMetric: [],
    recommendations: [],
    checklist: [],
    honesty: "Generated from currently available signals.",
    basis: [],
  } as unknown as AiDoctorReportInput;
}

beforeEach(() => {
  buildPdfSpy.mockClear();
  downloadPdfSpy.mockClear();
  buildCsvSpy.mockClear();
  downloadCsvSpy.mockClear();
});

describe("premium export panel — pending UX + duplicate-click guard", () => {
  it("disables the PDF button while preflight is in flight then calls builder once", async () => {
    let resolveGate: ((v: unknown) => void) | null = null;
    invokeImpl = () =>
      new Promise((r) => {
        resolveGate = (v) => r(v);
      });
    render(<AiDoctorDiagnosisPanel diagnosis={diag()} reportInput={reportInput()} />);
    const btn = screen.getByTestId(
      "ai-doctor-diagnosis-download-report",
    ) as HTMLButtonElement;

    fireEvent.click(btn);
    fireEvent.click(btn); // rapid second click while pending
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      resolveGate!({ data: { ok: true }, error: null });
    });
    await waitFor(() => expect(btn).not.toBeDisabled());

    expect(buildPdfSpy).toHaveBeenCalledTimes(1);
    expect(downloadPdfSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call the CSV builder when preflight denies", async () => {
    invokeImpl = async () => ({
      data: { ok: false, reason: "upgrade_required" },
      error: null,
    });
    render(<AiDoctorDiagnosisPanel diagnosis={diag()} reportInput={reportInput()} />);
    fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-download-csv"));
    await waitFor(() =>
      expect(
        screen.getByTestId("ai-doctor-diagnosis-package-message").textContent,
      ).toMatch(/Pro feature/),
    );
    expect(buildCsvSpy).not.toHaveBeenCalled();
    expect(downloadCsvSpy).not.toHaveBeenCalled();
  });
});
