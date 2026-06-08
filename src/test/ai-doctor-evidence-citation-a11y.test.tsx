/**
 * Tests — AI Doctor evidence citation accessibility, CSV export,
 * navigation helper, and PDF per-metric status table.
 *
 * Pure presenter/view-model tests. No Supabase, no fetch.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AiDoctorDiagnosisPanel from "@/components/AiDoctorDiagnosisPanel";
import { AiDoctorEvidencePanel } from "@/components/AiDoctorEvidencePanel";
import type { DiagnosisResult } from "@/lib/aiDoctorEngine";
import type { CitationContext } from "@/lib/aiDoctorEvidenceCitationRules";
import {
  buildCitationDetail,
  resolveEvidenceCitation,
} from "@/lib/aiDoctorEvidenceCitationRules";
import {
  navigateToEvidenceTarget,
  AI_DOCTOR_EVIDENCE_PANEL_ROOT_ID,
} from "@/lib/aiDoctorEvidenceNavigationRules";
import {
  buildAiDoctorEvidenceCsv,
  csvEscape,
} from "@/lib/aiDoctorEvidenceCsvExportRules";
import {
  buildAiDoctorReportText,
  buildPerMetricStatusTable,
  type AiDoctorReportInput,
} from "@/lib/aiDoctorReportRules";

afterEach(() => cleanup());

// --- fixtures ---------------------------------------------------------------

function baseDiagnosis(): DiagnosisResult {
  return {
    summary: "Stub diagnosis.",
    key_observations: ["leaf droop"],
    contributing_factors: ["sensor context partial"],
    model_confidence_level: "Medium",
    automated_confidence: {
      score: 55,
      level: "Medium",
      explanation: "Mixed.",
      conflicts_detected: [],
    },
    recommended_actions: [
      "Re-check humidity in 24h.",
      "Capture a soil moisture reading.",
    ],
    what_not_to_do: [],
    monitoring_priorities: [],
    questions_for_grower: [],
  };
}

function baseCtx(): CitationContext {
  return {
    availableMetrics: [
      {
        key: "humidity_pct",
        statusLabel: "Accepted",
        derived: false,
        value: 55,
      },
      {
        key: "vpd_kpa",
        statusLabel: "Accepted",
        derived: true,
        value: 1.1,
      },
    ],
    missingMetrics: ["soil_moisture_pct"],
    hasRecentDiary: false,
    hasRecentPhotos: false,
    envCheckCapturedAt: "2026-06-08T10:00:00Z",
  };
}

function baseReportInput(): Omit<AiDoctorReportInput, "recommendations"> {
  return {
    generatedAt: "2026-06-08T12:00:00Z",
    summary: "Report summary.",
    alignment: null,
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
        { key: "temp_f", statusLabel: "Rejected", value: 120, derived: false },
        { key: "co2_ppm", statusLabel: "Not checked", value: null, derived: false },
      ],
    },
    checklist: [
      { key: "soil_moisture_pct", label: "Capture soil moisture", state: "needed" },
    ],
  };
}

// --- citation a11y / modal --------------------------------------------------

describe("Diagnosis panel — inline citation a11y + modal", () => {
  it("renders inline citation as a focusable button with aria-label and visible focus class", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis()}
        citationContext={baseCtx()}
      />,
    );
    const btn = screen.getByTestId(
      "ai-doctor-diagnosis-recommended-actions-citation-0",
    ) as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("aria-label")).toBeTruthy();
    expect(btn.className).toMatch(/focus-visible:ring/);
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("opens the citation modal on click and renders source-honest fields", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis()}
        citationContext={baseCtx()}
      />,
    );
    const btn = screen.getByTestId(
      "ai-doctor-diagnosis-recommended-actions-citation-0",
    );
    fireEvent.click(btn);
    const modal = screen.getByTestId("ai-doctor-diagnosis-citation-modal");
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("true");
    const source = screen.getByTestId("ai-doctor-diagnosis-citation-modal-source");
    expect(source.textContent).not.toMatch(/live/i);
    expect(source.textContent).toContain("Test/Local validation");
  });

  it("labels missing-metric citation modal as missing", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis()}
        citationContext={baseCtx()}
      />,
    );
    fireEvent.click(
      screen.getByTestId("ai-doctor-diagnosis-recommended-actions-citation-1"),
    );
    const kind = screen.getByTestId(
      "ai-doctor-diagnosis-citation-modal-kind",
    );
    expect(kind.textContent?.toLowerCase()).toContain("missing");
  });

  it("Escape closes the modal", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis()}
        citationContext={baseCtx()}
      />,
    );
    fireEvent.click(
      screen.getByTestId("ai-doctor-diagnosis-recommended-actions-citation-0"),
    );
    expect(
      screen.queryByTestId("ai-doctor-diagnosis-citation-modal"),
    ).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByTestId("ai-doctor-diagnosis-citation-modal"),
    ).toBeNull();
  });

  it("Close button closes modal and returns focus to triggering citation", async () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis()}
        citationContext={baseCtx()}
      />,
    );
    const trigger = screen.getByTestId(
      "ai-doctor-diagnosis-recommended-actions-citation-0",
    );
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByTestId("ai-doctor-diagnosis-citation-modal-close"),
    );
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(document.activeElement).toBe(trigger);
  });
});

// --- evidence basis toggle a11y --------------------------------------------

describe("Diagnosis panel — Evidence basis toggle a11y", () => {
  it("trigger is a real button with aria-expanded and aria-controls", () => {
    render(
      <AiDoctorDiagnosisPanel
        diagnosis={baseDiagnosis()}
        evidenceAlignment={{
          posture: "moderate_context",
          postureLabel: "Moderate evidence",
          postureCopy: "Moderate context available.",
          basisCopy: ["b1"],
          guardrailWarning: null,
          moreDataReminder: null,
        }}
      />,
    );
    const toggle = screen.getByTestId(
      "ai-doctor-diagnosis-evidence-toggle",
    ) as HTMLButtonElement;
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("aria-expanded")).toBeTruthy();
    expect(toggle.getAttribute("aria-controls")).toBeTruthy();
    expect(toggle.className).toMatch(/focus-visible:ring/);
  });
});

// --- navigation helper ------------------------------------------------------

describe("navigateToEvidenceTarget", () => {
  it("scrolls + focuses the exact target when present", () => {
    document.body.innerHTML = `<div id="evidence-envcheck-humidity-pct">x</div>`;
    const el = document.getElementById(
      "evidence-envcheck-humidity-pct",
    )! as HTMLElement;
    const spy = vi.fn();
    (el as any).scrollIntoView = spy;
    const r = navigateToEvidenceTarget("evidence-envcheck-humidity-pct");
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("exact");
    expect(spy).toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("evidence-envcheck-humidity-pct");
  });

  it("falls back to the panel root when exact id missing", () => {
    document.body.innerHTML = `<div id="${AI_DOCTOR_EVIDENCE_PANEL_ROOT_ID}">x</div>`;
    const r = navigateToEvidenceTarget("evidence-envcheck-missing-x");
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("fallback");
  });

  it("returns none when nothing is present", () => {
    document.body.innerHTML = ``;
    const r = navigateToEvidenceTarget("evidence-envcheck-x");
    expect(r.ok).toBe(false);
    expect(r.mode).toBe("none");
  });
});

// --- Evidence panel anchors -------------------------------------------------

describe("AiDoctorEvidencePanel — stable anchors", () => {
  it("renders id=ai-doctor-evidence-panel on the panel root", () => {
    const vm: any = {
      conservativeRecommendationCopy: null,
      latestEnvironmentCheck: {
        title: "Latest",
        sourceLabel: "Test/Local validation",
        selectedStatusLabel: "Accepted",
        isFallback: false,
        capturedAt: "2026-06-08T10:00:00Z",
        eventTitle: "evt",
        metricRows: [
          {
            key: "humidity_pct",
            label: "Humidity",
            statusLabel: "Accepted",
            contextLabel: "Local",
            displayValue: "55",
            notHealthy: false,
            reason: null,
          },
        ],
        cautionCopy: null,
        timelineHref: null,
      },
      moreDataNeeded: { show: false, title: "", items: [], cautionCopy: null },
      groups: [{ key: "missing", title: "Missing", items: [], isEmpty: true, emptyCopy: "none" }],
      missing: [{ code: "soil_moisture_pct", label: "Soil moisture" }],
    };
    render(<AiDoctorEvidencePanel vm={vm} />);
    expect(document.getElementById("ai-doctor-evidence-panel")).toBeTruthy();
    expect(
      document.getElementById("evidence-envcheck-humidity-pct"),
    ).toBeTruthy();
    expect(
      document.getElementById("evidence-missing-soil-moisture-pct"),
    ).toBeTruthy();
  });
});

// --- CSV export -------------------------------------------------------------

describe("buildAiDoctorEvidenceCsv", () => {
  it("escapes commas, quotes, and newlines correctly", () => {
    expect(csvEscape(`a,b`)).toBe(`"a,b"`);
    expect(csvEscape(`a"b`)).toBe(`"a""b"`);
    expect(csvEscape(`a\nb`)).toBe(`"a\nb"`);
    expect(csvEscape("plain")).toBe("plain");
  });

  it("redacts tokens, JWTs, service_role, user_id, and UUIDs", () => {
    const csv = buildAiDoctorEvidenceCsv({
      ...baseReportInput(),
      summary:
        "leak service_role and user_id eyJabcdef.ghijklm.nopqrst plus 00000000-0000-0000-0000-000000000000",
      recommendations: [],
    });
    expect(csv.contents).not.toMatch(/service_role/i);
    expect(csv.contents).not.toMatch(/user_id/i);
    expect(csv.contents).not.toMatch(/eyJ[A-Za-z0-9_\-]{6,}\./);
    expect(csv.contents).not.toMatch(
      /00000000-0000-0000-0000-000000000000/,
    );
    expect(csv.contents).toContain("[redacted]");
  });

  it("includes diagnosis, posture, recommendations, checklist, and per-metric rows", () => {
    const input: AiDoctorReportInput = {
      ...baseReportInput(),
      alignment: {
        posture: "moderate_context",
        postureLabel: "Moderate evidence",
        postureCopy: "OK.",
        basisCopy: ["humidity_pct accepted"],
        guardrailWarning: null,
        moreDataReminder: "Capture soil moisture.",
      },
      recommendations: [
        {
          text: "Re-check humidity.",
          citation: resolveEvidenceCitation("Re-check humidity.", baseCtx()),
        },
      ],
    };
    const csv = buildAiDoctorEvidenceCsv(input);
    expect(csv.contents).toContain("Diagnosis summary");
    expect(csv.contents).toContain("Recommendation posture");
    expect(csv.contents).toContain("Re-check humidity.");
    expect(csv.contents).toContain("Capture soil moisture");
    expect(csv.contents).toContain("humidity_pct");
    expect(csv.contents).toMatch(/env_metric/);
  });
});

// --- PDF per-metric table ---------------------------------------------------

describe("buildPerMetricStatusTable + report text", () => {
  it("contains all tracked metrics in stable order", () => {
    const rows = buildPerMetricStatusTable({
      ...baseReportInput(),
      recommendations: [],
    });
    expect(rows.map((r) => r.metric)).toEqual([
      "temp_f",
      "humidity_pct",
      "vpd_kpa",
      "co2_ppm",
      "soil_moisture_pct",
    ]);
  });

  it("marks derived VPD as Derived VPD context", () => {
    const rows = buildPerMetricStatusTable({
      ...baseReportInput(),
      recommendations: [],
    });
    const vpd = rows.find((r) => r.metric === "vpd_kpa")!;
    expect(vpd.status).toBe("Derived VPD context");
    expect(vpd.citationType).toBe("env_metric_derived");
  });

  it("rejected / not_checked / missing do not look healthy", () => {
    const rows = buildPerMetricStatusTable({
      ...baseReportInput(),
      recommendations: [],
    });
    const temp = rows.find((r) => r.metric === "temp_f")!;
    expect(temp.status).toBe("Rejected");
    expect(temp.note).toContain("not healthy");
    const co2 = rows.find((r) => r.metric === "co2_ppm")!;
    expect(co2.status).toBe("Not checked");
    const sm = rows.find((r) => r.metric === "soil_moisture_pct")!;
    expect(sm.status).toBe("Missing");
  });

  it("text report includes the compact per-metric section", () => {
    const txt = buildAiDoctorReportText({
      ...baseReportInput(),
      recommendations: [],
    });
    expect(txt).toContain("Per-metric status (compact):");
    expect(txt).toContain("temp_f");
    expect(txt).toContain("Derived VPD context");
  });

  it("is deterministic for the same input", () => {
    const inp: AiDoctorReportInput = {
      ...baseReportInput(),
      recommendations: [],
    };
    expect(buildAiDoctorReportText(inp)).toBe(buildAiDoctorReportText(inp));
  });
});

// --- buildCitationDetail ----------------------------------------------------

describe("buildCitationDetail", () => {
  it("labels derived VPD modal content as Derived VPD context", () => {
    const ctx = baseCtx();
    const c = resolveEvidenceCitation("Adjust VPD.", ctx);
    const d = buildCitationDetail(c, ctx);
    expect(d.kindLabel.toLowerCase()).toContain("derived");
  });

  it("never labels local Env Check evidence as Live", () => {
    const ctx = baseCtx();
    const c = resolveEvidenceCitation("Re-check humidity.", ctx);
    const d = buildCitationDetail(c, ctx);
    expect(d.sourceLabel).toBe("Test/Local validation");
    expect(d.sourceLabel.toLowerCase()).not.toContain("live");
  });

  it("missing metric is not healthy and reads as missing", () => {
    const ctx = baseCtx();
    const c = resolveEvidenceCitation("Capture soil moisture.", ctx);
    const d = buildCitationDetail(c, ctx);
    expect(d.citation.healthy).toBe(false);
    expect(d.kindLabel.toLowerCase()).toContain("missing");
  });
});

// --- static safety scan -----------------------------------------------------

describe("AI Doctor evidence ux — static safety", () => {
  const FILES = [
    "src/components/AiDoctorDiagnosisPanel.tsx",
    "src/lib/aiDoctorEvidenceCsvExportRules.ts",
    "src/lib/aiDoctorEvidenceNavigationRules.ts",
    "src/lib/aiDoctorEvidenceCitationRules.ts",
    "src/lib/aiDoctorReportRules.ts",
  ].map((p) => readFileSync(resolve(process.cwd(), p), "utf8"));

  it("contains no fetch, functions.invoke, or Supabase imports", () => {
    for (const src of FILES) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    }
  });

  it("contains no privileged writes", () => {
    for (const src of FILES) {
      for (const t of [
        ".insert(",
        ".update(",
        ".delete(",
        ".upsert(",
        "sensor_readings",
        "action_queue",
        "grow_events",
        "service_role",
      ]) {
        expect(src).not.toContain(t);
      }
    }
  });

  it("contains no device-control strings", () => {
    for (const src of FILES) {
      for (const t of [
        "execute_device",
        "setpoint_write",
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
