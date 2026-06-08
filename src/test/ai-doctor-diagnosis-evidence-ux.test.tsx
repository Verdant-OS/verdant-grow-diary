import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AiDoctorDiagnosisPanel from "@/components/AiDoctorDiagnosisPanel";
import {
  buildDiagnosisEvidenceAlignmentVM,
  type DiagnosisEvidenceAlignmentInput,
} from "@/lib/aiDoctorDiagnosisEvidenceAlignmentRules";
import {
  resolveEvidenceCitation,
  citeRecommendations,
  type CitationContext,
} from "@/lib/aiDoctorEvidenceCitationRules";
import {
  buildAiDoctorReportText,
  buildAiDoctorReportPdfBytes,
  redactReportLine,
  type AiDoctorReportInput,
} from "@/lib/aiDoctorReportRules";
import type { DiagnosisResult } from "@/lib/aiDoctorEngine";

function alignmentInput(
  o: Partial<DiagnosisEvidenceAlignmentInput> = {},
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
    ...o,
  };
}

const baseDiagnosis: DiagnosisResult = {
  summary: "Mild humidity stress suspected.",
  key_observations: [],
  contributing_factors: [],
  recommended_actions: [
    "Review humidity trend before changing equipment.",
    "Capture updated soil moisture before changing irrigation.",
    "Monitor plant posture for 24 hours.",
    "Wait and re-check.",
  ],
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

const baseCtx: CitationContext = {
  availableMetrics: [
    { key: "humidity_pct", statusLabel: "Accepted", derived: false },
    { key: "vpd_kpa", statusLabel: "Accepted", derived: true },
    { key: "temp_f", statusLabel: "Rejected", derived: false },
  ],
  missingMetrics: ["soil_moisture_pct", "co2_ppm"],
  hasRecentDiary: false,
  hasRecentPhotos: false,
};

describe("aiDoctorEvidenceCitationRules", () => {
  it("maps a humidity recommendation to the accepted Env Check metric", () => {
    const c = resolveEvidenceCitation(
      "Review humidity trend before changing equipment.",
      baseCtx,
    );
    expect(c.kind).toBe("env_metric");
    expect(c.healthy).toBe(true);
    expect(c.label).toMatch(/humidity_pct/);
    expect(c.label).not.toMatch(/live/i);
  });

  it("maps a soil moisture recommendation to a missing-context citation", () => {
    const c = resolveEvidenceCitation(
      "Capture updated soil moisture before changing irrigation.",
      baseCtx,
    );
    expect(c.kind).toBe("missing_metric");
    expect(c.label).toBe("Missing: soil_moisture_pct");
    expect(c.healthy).toBe(false);
  });

  it("maps a diary/photo recommendation to diary_photo_missing when none exist", () => {
    const c = resolveEvidenceCitation(
      "Monitor plant posture for 24 hours.",
      baseCtx,
    );
    expect(c.kind).toBe("diary_photo_missing");
    expect(c.label).toBe("Diary/Photos missing");
  });

  it("falls back to Needs more evidence for unrelated text", () => {
    const c = resolveEvidenceCitation("Wait and re-check.", baseCtx);
    expect(c.kind).toBe("none");
    expect(c.label).toBe("Needs more evidence");
  });

  it("derived VPD citation says Derived VPD context", () => {
    const c = resolveEvidenceCitation("Review VPD trend.", baseCtx);
    expect(c.kind).toBe("env_metric_derived");
    expect(c.label).toBe("Derived VPD context");
    expect(c.healthy).toBe(false);
  });

  it("rejected/not_checked metric is cited as weak, not healthy", () => {
    const c = resolveEvidenceCitation("Check the temperature.", baseCtx);
    expect(c.kind).toBe("env_metric_weak");
    expect(c.healthy).toBe(false);
    expect(c.label).toMatch(/weak/i);
  });

  it("never labels local Env Check evidence as Live in any citation", () => {
    const recs = [
      "Review humidity.",
      "Check the temperature.",
      "Review VPD trend.",
    ];
    const out = citeRecommendations(recs, baseCtx);
    for (const r of out) {
      expect(r.citation.label).not.toMatch(/\blive\b/i);
      expect(r.citation.ariaLabel).not.toMatch(/\blive telemetry\b(?! \(not)/i);
    }
  });

  it("handles non-string input safely", () => {
    // @ts-expect-error testing runtime safety
    const c = resolveEvidenceCitation(undefined, baseCtx);
    expect(c.kind).toBe("none");
  });
});

describe("AiDoctorDiagnosisPanel — accessibility + collapsible Evidence basis", () => {
  it("posture label exposes readable aria-label", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(
      alignmentInput({
        hasLiveSensor: true,
        liveSensorUsable: true,
        envCheckPresent: true,
        envCheckAcceptedCount: 3,
        hasRecentDiary: true,
      }),
    );
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    const label = screen.getByTestId("ai-doctor-diagnosis-posture-label");
    expect(label).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Strong context"),
    );
    expect(label).toHaveTextContent("Strong context");
  });

  it("Evidence basis trigger exposes aria-expanded and toggles", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(
      alignmentInput({
        envCheckPresent: true,
        envCheckRejectedCount: 1,
      }),
    );
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    const toggle = screen.getByTestId("ai-doctor-diagnosis-evidence-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "true"); // weak_context default open
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("defaults open for weak_context", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(
      alignmentInput({
        envCheckPresent: true,
        envCheckRejectedCount: 1,
      }),
    );
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-evidence-toggle"),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("defaults open for insufficient_context", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(alignmentInput());
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-evidence-toggle"),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("defaults collapsed for moderate_context", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(
      alignmentInput({
        hasLiveSensor: true,
        liveSensorUsable: true,
      }),
    );
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-evidence-toggle"),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("defaults collapsed for strong_context", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(
      alignmentInput({
        hasLiveSensor: true,
        liveSensorUsable: true,
        envCheckPresent: true,
        envCheckAcceptedCount: 3,
        hasRecentDiary: true,
      }),
    );
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-evidence-toggle"),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("evidence-alignment section uses a semantic region with an accessible heading", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(alignmentInput());
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    const region = screen.getByTestId(
      "ai-doctor-diagnosis-evidence-alignment",
    );
    expect(region).toHaveAttribute("role", "region");
    const headingId = region.getAttribute("aria-labelledby");
    expect(headingId).toBeTruthy();
    const heading = document.getElementById(headingId!);
    expect(heading).toHaveTextContent(/Evidence basis/i);
  });

  it("toggle has visible focus state utility classes", () => {
    const alignment = buildDiagnosisEvidenceAlignmentVM(alignmentInput());
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        evidenceAlignment={alignment}
      />,
    );
    const toggle = screen.getByTestId("ai-doctor-diagnosis-evidence-toggle");
    expect(toggle.className).toMatch(/focus-visible:ring/);
  });
});

describe("AiDoctorDiagnosisPanel — inline recommendation citations", () => {
  it("renders citation badge mapped to Env Check metric", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        citationContext={baseCtx}
      />,
    );
    const citation = screen.getByTestId(
      "ai-doctor-diagnosis-recommended-actions-citation-0",
    );
    expect(citation).toHaveTextContent(/humidity_pct/);
    expect(citation).toHaveAttribute("data-citation-kind", "env_metric");
    expect(citation).toHaveAttribute("data-citation-healthy", "true");
  });

  it("renders missing-context citation for soil moisture", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        citationContext={baseCtx}
      />,
    );
    const citation = screen.getByTestId(
      "ai-doctor-diagnosis-recommended-actions-citation-1",
    );
    expect(citation).toHaveTextContent(/Missing: soil_moisture_pct/);
    expect(citation).toHaveAttribute("data-citation-healthy", "false");
  });

  it("renders 'Needs more evidence' when no evidence supports the recommendation", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        citationContext={baseCtx}
      />,
    );
    const citation = screen.getByTestId(
      "ai-doctor-diagnosis-recommended-actions-citation-3",
    );
    expect(citation).toHaveTextContent(/Needs more evidence/);
  });

  it("never says 'Live' in local Env Check citations", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        citationContext={baseCtx}
      />,
    );
    const c0 = screen.getByTestId(
      "ai-doctor-diagnosis-recommended-actions-citation-0",
    );
    expect(c0.textContent ?? "").not.toMatch(/\blive\b/i);
  });

  it("citation anchor href points at the Evidence used target id", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        citationContext={baseCtx}
      />,
    );
    const c1 = screen.getByTestId(
      "ai-doctor-diagnosis-recommended-actions-citation-1",
    );
    expect(c1.getAttribute("href")).toBe("#evidence-missing-soil-moisture-pct");
  });
});

describe("aiDoctorReportRules — text report", () => {
  function inputFor(): AiDoctorReportInput {
    const alignment = buildDiagnosisEvidenceAlignmentVM(
      alignmentInput({
        envCheckPresent: true,
        envCheckRejectedCount: 1,
        envCheckHasDerivedVpd: true,
        moreDataNeededCount: 2,
      }),
    );
    return {
      generatedAt: "2026-06-08T12:00:00.000Z",
      summary: "Mild humidity stress suspected.",
      alignment,
      evidenceSummary: {
        liveSensorUsable: false,
        envCheckPresent: true,
        hasRecentDiary: false,
        hasRecentPhotos: false,
      },
      environmentCheck: {
        show: true,
        capturedAt: "2026-06-08T11:00:00.000Z",
        statusLabel: "Mixed",
        metricRows: [
          {
            key: "humidity_pct",
            statusLabel: "Accepted",
            value: 55,
            derived: false,
          },
          {
            key: "vpd_kpa",
            statusLabel: "Accepted",
            value: 1.1,
            derived: true,
          },
        ],
      },
      checklist: [
        { key: "soil_moisture_pct", label: "Soil moisture", state: "needed" },
        { key: "co2_ppm", label: "CO2", state: "needed" },
        { key: "humidity_pct", label: "Humidity", state: "complete" },
      ],
      recommendations: citeRecommendations(
        baseDiagnosis.recommended_actions,
        baseCtx,
      ),
    };
  }

  it("includes diagnosis summary, evidence basis, checklist, and recommendations with citations", () => {
    const t = buildAiDoctorReportText(inputFor());
    expect(t).toMatch(/AI Doctor Report/);
    expect(t).toMatch(/Generated: 2026-06-08T12:00:00.000Z/);
    expect(t).toMatch(/Diagnosis summary:/);
    expect(t).toMatch(/Mild humidity stress suspected/);
    expect(t).toMatch(/Evidence basis:/);
    expect(t).toMatch(/Recommendation posture: /);
    expect(t).toMatch(/Evidence used \(summary\):/);
    expect(t).toMatch(/Latest EcoWitt Environment Check/);
    expect(t).toMatch(/More data needed/);
    expect(t).toMatch(/\[ \] Soil moisture/);
    expect(t).toMatch(/\[x\] Humidity/);
    expect(t).toMatch(/Recommendations:/);
    expect(t).toMatch(/\[Env Check: humidity_pct\]/);
    expect(t).toMatch(/\[Missing: soil_moisture_pct\]/);
    expect(t).toMatch(/\[Needs more evidence\]/);
    expect(t).toMatch(
      /Local Environment Check evidence is not live telemetry/,
    );
    expect(t).toMatch(/Derived VPD is context only/);
  });

  it("does not label local Env Check as Live anywhere", () => {
    const t = buildAiDoctorReportText(inputFor());
    expect(t).not.toMatch(/Environment Check.*Live/);
  });

  it("redactReportLine strips tokens, JWTs, UUIDs, and user_id markers", () => {
    const dirty =
      "user_id: 11111111-2222-3333-4444-555555555555 bearer eyJabcdef.eyJxyz12345.signaturepart123 service_role=abc";
    const cleaned = redactReportLine(dirty);
    expect(cleaned).not.toMatch(/user_id/i);
    expect(cleaned).not.toMatch(/bearer/i);
    expect(cleaned).not.toMatch(/service_role/i);
    expect(cleaned).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
    expect(cleaned).not.toMatch(/eyJ[a-z0-9_-]+\.eyJ/i);
  });

  it("PDF bytes start with %PDF-1.4 and contain %%EOF", () => {
    const bytes = buildAiDoctorReportPdfBytes(inputFor());
    const head = String.fromCharCode(...bytes.slice(0, 8));
    expect(head).toMatch(/^%PDF-1\.4/);
    const tail = String.fromCharCode(...bytes.slice(-8));
    expect(tail).toMatch(/%%EOF/);
  });

  it("PDF is deterministic given the same input", () => {
    const a = buildAiDoctorReportPdfBytes(inputFor());
    const b = buildAiDoctorReportPdfBytes(inputFor());
    expect(a.length).toBe(b.length);
    expect(Array.from(a).slice(0, 100)).toEqual(Array.from(b).slice(0, 100));
  });
});

describe("AiDoctorDiagnosisPanel — download report action", () => {
  let clickSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    clickSpy = vi.fn();
    // jsdom URL.createObjectURL polyfill
    (URL as any).createObjectURL = vi.fn(() => "blob:mock");
    (URL as any).revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = clickSpy as unknown as () => void;
  });

  function reportInput(): Omit<AiDoctorReportInput, "recommendations"> {
    return {
      generatedAt: "2026-06-08T12:00:00.000Z",
      summary: "Summary.",
      alignment: null,
      evidenceSummary: {
        liveSensorUsable: false,
        envCheckPresent: false,
        hasRecentDiary: false,
        hasRecentPhotos: false,
      },
      environmentCheck: {
        show: false,
        capturedAt: null,
        statusLabel: "Unknown",
        metricRows: [],
      },
      checklist: [],
    };
  }

  it("does not render the download button without reportInput", () => {
    render(<AiDoctorDiagnosisPanel diagnosis={baseDiagnosis} />);
    expect(
      screen.queryByTestId("ai-doctor-diagnosis-download-report"),
    ).toBeNull();
  });

  it("renders the download button when a diagnosis + reportInput exist", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        reportInput={reportInput()}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-download-report"),
    ).toBeInTheDocument();
  });

  it("clicking the download button triggers a client-side download", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis}
        reportInput={reportInput()}
      />,
    );
    fireEvent.click(
      screen.getByTestId("ai-doctor-diagnosis-download-report"),
    );
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect((URL as any).createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe("static safety scan — citation + report files", () => {
  it("no writes / fetch / functions.invoke / device-control strings", async () => {
    const fs = await import("node:fs/promises");
    const files = [
      "src/lib/aiDoctorEvidenceCitationRules.ts",
      "src/lib/aiDoctorReportRules.ts",
    ];
    for (const f of files) {
      const src = await fs.readFile(f, "utf8");
      expect(src).not.toMatch(/sensor_readings/);
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/grow_events/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(
        /turn_on|turn_off|device_control|toggleDevice|setOutletState|autopilot/i,
      );
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
  });
});
