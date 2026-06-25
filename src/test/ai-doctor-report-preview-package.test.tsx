/**
 * Tests — AI Doctor preview, package, CSV column order, search,
 * citation modal breadcrumb. Pure presenter/rule tests.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AiDoctorDiagnosisPanel from "@/components/AiDoctorDiagnosisPanel";
import type { DiagnosisResult } from "@/lib/aiDoctorEngine";
import type { CitationContext } from "@/lib/aiDoctorEvidenceCitationRules";
import {
  buildAiDoctorEvidenceCsv,
  AI_DOCTOR_EVIDENCE_CSV_COLUMNS,
} from "@/lib/aiDoctorEvidenceCsvExportRules";
import type { AiDoctorReportInput } from "@/lib/aiDoctorReportRules";
import {
  filterEvidenceSearchItems,
  type EvidenceSearchItem,
} from "@/lib/aiDoctorEvidenceSearchRules";
import {
  buildPackageFilenames,
  packageDateStamp,
  downloadAiDoctorReportPackage,
} from "@/lib/aiDoctorReportPackageRules";

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
    checklist: [
      { key: "soil_moisture_pct", label: "Capture soil moisture", state: "needed" },
    ],
  };
}

// --- CSV column order -------------------------------------------------------

describe("CSV column order", () => {
  it("first row matches AI_DOCTOR_EVIDENCE_CSV_COLUMNS exactly", () => {
    const csv = buildAiDoctorEvidenceCsv({
      ...reportInput(),
      recommendations: [],
    });
    expect(csv.contents.split("\n")[0]).toBe(
      AI_DOCTOR_EVIDENCE_CSV_COLUMNS.join(","),
    );
    expect(AI_DOCTOR_EVIDENCE_CSV_COLUMNS.indexOf("citation_type")).toBeLessThan(
      AI_DOCTOR_EVIDENCE_CSV_COLUMNS.indexOf("source_honesty_note"),
    );
  });

  it("env_metric rows appear in fixed metric order", () => {
    const csv = buildAiDoctorEvidenceCsv({
      ...reportInput(),
      recommendations: [],
    });
    const order = ["temp_f", "humidity_pct", "vpd_kpa", "co2_ppm", "soil_moisture_pct"];
    const positions = order.map((k) =>
      csv.contents.indexOf(`env_metric,${k},`),
    );
    for (let i = 0; i < positions.length - 1; i++) {
      expect(positions[i]).toBeGreaterThan(-1);
      expect(positions[i]).toBeLessThan(positions[i + 1]);
    }
  });

  it("marks derived VPD as Derived VPD context and never as Live", () => {
    const csv = buildAiDoctorEvidenceCsv({
      ...reportInput(),
      recommendations: [],
    });
    expect(csv.contents).toContain("Derived VPD context");
    expect(csv.contents).not.toMatch(/\bLive\b/);
  });
});

// --- search rule ------------------------------------------------------------

describe("filterEvidenceSearchItems", () => {
  const items: EvidenceSearchItem[] = [
    { id: "envcheck-humidity_pct", label: "Env Check: humidity_pct", metricKey: "humidity_pct", status: "Accepted", sourceLabel: "Test/Local validation", reason: null, citationKind: "env_metric" },
    { id: "missing-soil_moisture_pct", label: "Missing: soil_moisture_pct", metricKey: "soil_moisture_pct", status: "Missing", sourceLabel: "Not captured", reason: null, citationKind: "missing_metric" },
    { id: "envcheck-vpd_kpa", label: "Derived VPD context", metricKey: "vpd_kpa", status: "Accepted", sourceLabel: "Test/Local validation", reason: "derived", citationKind: "env_metric_derived" },
  ];
  it("matches metric key", () => {
    expect(filterEvidenceSearchItems(items, "humidity").length).toBe(1);
  });
  it("matches status", () => {
    expect(filterEvidenceSearchItems(items, "missing").length).toBe(1);
  });
  it("matches source label", () => {
    expect(filterEvidenceSearchItems(items, "Not captured").length).toBe(1);
  });
  it("empty query returns all", () => {
    expect(filterEvidenceSearchItems(items, "").length).toBe(items.length);
  });
});

// --- package helper ---------------------------------------------------------

describe("aiDoctorReportPackageRules", () => {
  it("packageDateStamp extracts YYYY-MM-DD", () => {
    expect(packageDateStamp("2026-06-08T12:00:00Z")).toBe("2026-06-08");
    expect(packageDateStamp("")).toBe("report");
  });

  it("buildPackageFilenames produces deterministic names", () => {
    const n = buildPackageFilenames("2026-06-08T12:00:00Z");
    expect(n.pdf).toBe("ai-doctor-report-2026-06-08.pdf");
    expect(n.csv).toBe("ai-doctor-evidence-2026-06-08.csv");
    expect(n.zip).toBe("ai-doctor-package-2026-06-08.zip");
  });

  it("falls back to sequential when no zip ctor and downloads pdf+csv", async () => {
    const downloadPdf = vi.fn();
    const downloadCsv = vi.fn();
    const r = await downloadAiDoctorReportPackage(
      { ...reportInput(), recommendations: [] },
      { downloadPdf, downloadCsv },
    );
    expect(r.mode).toBe("sequential");
    expect(downloadPdf).toHaveBeenCalledTimes(1);
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    expect(r.message).toMatch(/Downloaded AI Doctor PDF and Evidence CSV/);
  });

  it("uses provided zip ctor when available", async () => {
    const fileSpy = vi.fn();
    const gen = vi.fn(async () => new Uint8Array([1, 2, 3]));
    class FakeZip {
      file = fileSpy;
      generateAsync = gen;
    }
    const downloadBlob = vi.fn();
    const r = await downloadAiDoctorReportPackage(
      { ...reportInput(), recommendations: [] },
      { zipCtor: FakeZip as any, downloadBlob },
    );
    expect(r.mode).toBe("zip");
    expect(fileSpy).toHaveBeenCalledTimes(2);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(r.zipFilename).toBe("ai-doctor-package-2026-06-08.zip");
  });
});

// --- panel: preview + breadcrumb + package + search -------------------------

describe("AiDoctorDiagnosisPanel — preview / package / breadcrumb / search", () => {
  it("renders Preview report and Download package buttons when reportInput exists", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={diag()}
        citationContext={ctx()}
        reportInput={reportInput()}
      />,
    );
    expect(
      screen.getByTestId("ai-doctor-diagnosis-preview-report"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-diagnosis-download-package"),
    ).toBeTruthy();
  });

  it("Preview report renders summary, basis, recommendations, metric table, checklist", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={diag()}
        citationContext={ctx()}
        reportInput={reportInput()}
      />,
    );
    fireEvent.click(screen.getByTestId("ai-doctor-diagnosis-preview-report"));
    expect(screen.getByTestId("ai-doctor-diagnosis-preview-summary")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-diagnosis-preview-basis")).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-diagnosis-preview-recommendations"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-diagnosis-preview-metric-table"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-diagnosis-preview-checklist"),
    ).toBeTruthy();
    const honesty = screen.getByTestId("ai-doctor-diagnosis-preview-honesty");
    expect(honesty.textContent).not.toMatch(/\bLive\b/);
  });

  it("citation modal renders breadcrumb with posture + recommendation index", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={diag()}
        citationContext={ctx()}
        evidenceAlignment={{
          posture: "moderate_context",
          postureLabel: "Moderate evidence",
          postureCopy: "OK.",
          basisCopy: [],
          guardrailWarning: null,
          moreDataReminder: null,
          preferredVerbs: [],
        } as any}
      />,
    );
    fireEvent.click(
      screen.getByTestId(
        "ai-doctor-diagnosis-recommended-actions-citation-0",
      ),
    );
    const crumb = screen.getByTestId(
      "ai-doctor-diagnosis-citation-modal-breadcrumb",
    );
    expect(crumb.textContent).toContain("AI Doctor");
    expect(crumb.textContent).toContain("Moderate evidence");
    expect(crumb.textContent).toContain("Recommendation 1");
  });

  it("Back to recommendation closes modal and restores focus", async () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={diag()}
        citationContext={ctx()}
      />,
    );
    const trigger = screen.getByTestId(
      "ai-doctor-diagnosis-recommended-actions-citation-0",
    );
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByTestId("ai-doctor-diagnosis-citation-modal-back"),
    );
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(
      screen.queryByTestId("ai-doctor-diagnosis-citation-modal"),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("citation modal search filters items and shows empty state", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={diag()}
        citationContext={ctx()}
      />,
    );
    fireEvent.click(
      screen.getByTestId(
        "ai-doctor-diagnosis-recommended-actions-citation-0",
      ),
    );
    const input = screen.getByTestId(
      "ai-doctor-diagnosis-citation-modal-search",
    ) as HTMLInputElement;
    expect(input.getAttribute("aria-label")).toBe("Search Evidence Used items");
    fireEvent.change(input, { target: { value: "soil" } });
    expect(
      screen.getByTestId(
        "ai-doctor-diagnosis-citation-modal-search-item-missing-soil_moisture_pct",
      ),
    ).toBeTruthy();
    fireEvent.change(input, { target: { value: "zzznomatch" } });
    expect(
      screen.getByTestId("ai-doctor-diagnosis-citation-modal-search-empty"),
    ).toBeTruthy();
  });

  it("selecting a search result updates the modal detail", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={diag()}
        citationContext={ctx()}
      />,
    );
    fireEvent.click(
      screen.getByTestId(
        "ai-doctor-diagnosis-recommended-actions-citation-0",
      ),
    );
    fireEvent.click(
      screen.getByTestId(
        "ai-doctor-diagnosis-citation-modal-search-item-missing-soil_moisture_pct",
      ),
    );
    const kind = screen.getByTestId(
      "ai-doctor-diagnosis-citation-modal-kind",
    );
    expect(kind.textContent?.toLowerCase()).toContain("missing");
  });
});

// --- static safety scan -----------------------------------------------------

describe("AI Doctor report package + search — static safety", () => {
  const FILES = [
    "src/lib/aiDoctorEvidenceSearchRules.ts",
    "src/lib/aiDoctorReportPackageRules.ts",
    "src/lib/aiDoctorEvidenceCsvExportRules.ts",
    "src/components/AiDoctorDiagnosisPanel.tsx",
  ].map((p) => readFileSync(resolve(process.cwd(), p), "utf8"));

  it("contains no fetch / functions.invoke / Supabase imports", () => {
    for (const src of FILES) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    }
  });

  it("contains no privileged writes or device-control strings", () => {
    for (const src of FILES) {
      for (const t of [
        ".insert(",
        ".update(",
        ".delete(",
        ".upsert(",
        "sensor_readings",
        "action_queue",
        "grow_events",
        "execute_device",
        "irrigation_control",
        "light_control",
        "fan_control",
        "auto_apply",
      ]) {
        expect(src).not.toContain(t);
      }
    }
  });
});
