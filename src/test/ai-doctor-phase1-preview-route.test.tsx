/**
 * AI Doctor Phase 1 Preview Route — tests.
 *
 * Verifies the static internal page renders safely with a case selector:
 *   - Selector lists all 7 precomputed cases
 *   - Default case is conservative (low confidence, weak context)
 *   - Selecting each case renders the matching title/summary
 *   - Read-only / static / no-model / no-write / no-device labels persist
 *   - Weak-context cases show overdiagnosis warning
 *   - Demo/CSV case does not claim live data
 *   - Stale/invalid case does not claim healthy/stable data
 *   - No buttons anywhere; selector is a native <select>
 *   - No forbidden device/control/certainty copy
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AiDoctorPhase1Preview from "@/pages/AiDoctorPhase1Preview";
import { AI_DOCTOR_PHASE1_PREVIEW_CASES } from "@/lib/aiDoctorPhase1PreviewFixtures";

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/internal/ai-doctor-phase1-preview" element={<AiDoctorPhase1Preview />} />
      </Routes>
    </MemoryRouter>,
  );
}

function selectCase(id: string) {
  const select = screen.getByTestId(
    "ai-doctor-phase1-preview-case-select",
  ) as HTMLSelectElement;
  fireEvent.change(select, { target: { value: id } });
}

const FORBIDDEN_COPY = [
  "approve",
  "execute",
  "run command",
  "send command",
  "control device",
  "turn on",
  "turn off",
  "set fan",
  "set light",
  "dose",
  "flush immediately",
  "guaranteed",
  "definitely",
  "certainly",
];

describe("AiDoctorPhase1Preview page — base render", () => {
  it("renders at /internal/ai-doctor-phase1-preview", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(screen.getByTestId("ai-doctor-phase1-preview-panel")).toBeTruthy();
  });

  it("shows internal / static / read-only / no-model / no-write / no-device-control labels", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Internal preview/i);
    expect(text).toMatch(/Static demo data/i);
    expect(text).toMatch(/No model calls/i);
    expect(text).toMatch(/No database writes/i);
    expect(text).toMatch(/No device control/i);
    expect(text).toMatch(/Read-only/i);
  });

  it("shows the explanatory note about precomputed view model", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/precomputed Phase 1 view model/i);
    expect(text).toMatch(/does not run diagnosis/i);
    expect(text).toMatch(/does not score confidence/i);
    expect(text).toMatch(/does not write alerts/i);
    expect(text).toMatch(/does not create Action Queue items/i);
  });

  it("renders the preview panel in internal mode", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-mode").textContent,
    ).toBe("Internal preview");
  });

  it("renders all major sections for the default case", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(screen.getByTestId("ai-doctor-phase1-preview-summary")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-evidence")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-missing-info")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-recommendations")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-action-queue")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-safety")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-debug")).toBeTruthy();
  });

  it("renders the confidence audit link card", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(
      screen.getByTestId("ai-doctor-confidence-audit-link-card"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("ai-doctor-confidence-audit-link-title"),
    ).toHaveTextContent("View matching confidence audit");
    expect(
      screen.getByTestId("ai-doctor-confidence-audit-link-description"),
    ).toHaveTextContent(/hard caps/);
    const link = screen.getByTestId("ai-doctor-confidence-audit-link");
    // Default case maps to its matching scenario id
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/internal/ai-doctor-confidence-audit?scenario="),
    );
  });

  it("confidence audit link shows internal/static/read-only badges", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    const card = screen.getByTestId("ai-doctor-confidence-audit-link-card");
    const text = card.textContent ?? "";
    expect(text).toMatch(/Internal/);
    expect(text).toMatch(/Static reference/);
    expect(text).toMatch(/Read-only/);
  });

  it("Action Queue panel says approval is required and has a disabled reason", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    const panel = screen.getByTestId("ai-doctor-phase1-preview-action-queue");
    expect(panel.textContent).toMatch(/Suggested advisory action/i);
    expect(panel.textContent).toMatch(/Grower approval is required/i);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-action-disabled-reason").textContent,
    ).toMatch(/More context needed/i);
  });

  it("renders no buttons anywhere on the page (selector is a <select>)", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(document.querySelectorAll("button").length).toBe(0);
    expect(document.querySelectorAll("select").length).toBe(1);
  });

  it("default case is conservative and low-confidence", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    const debug = screen.getByTestId("ai-doctor-phase1-preview-debug");
    expect(debug.textContent ?? "").toMatch(/displayed_confidence_level: low/);
    expect(debug.textContent ?? "").toMatch(/has_live_data: false/);
  });

  it("preserves safety warnings (automation, overdiagnosis) on default case", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-automation-warning").textContent,
    ).toMatch(/does not control equipment/i);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-overdiagnosis-warning").textContent,
    ).toMatch(/avoid treating this as a certain diagnosis/i);
  });
});

describe("AiDoctorPhase1Preview page — case selector", () => {
  it("renders all seven precomputed cases as options", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(AI_DOCTOR_PHASE1_PREVIEW_CASES.length).toBe(7);
    for (const c of AI_DOCTOR_PHASE1_PREVIEW_CASES) {
      expect(
        screen.getByTestId(`ai-doctor-phase1-preview-case-option-${c.id}`),
      ).toBeTruthy();
    }
  });

  it.each(AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => [c.id, c.viewModel.summaryCard.title] as const))(
    "selecting case %s renders the matching title",
    (id, expectedTitle) => {
      renderAtRoute("/internal/ai-doctor-phase1-preview");
      selectCase(id);
      const summary = screen.getByTestId("ai-doctor-phase1-preview-summary");
      expect(summary.textContent ?? "").toContain(expectedTitle);
    },
  );

  it.each(AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => [c.id, c.viewModel.summaryCard.summary] as const))(
    "selecting case %s renders the matching summary",
    (id, expectedSummary) => {
      renderAtRoute("/internal/ai-doctor-phase1-preview");
      selectCase(id);
      const summary = screen.getByTestId("ai-doctor-phase1-preview-summary");
      expect(summary.textContent ?? "").toContain(expectedSummary);
    },
  );

  it.each(AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => [c.id] as const))(
    "case %s shows read-only / no-model / no-write / no-device labels",
    (id) => {
      renderAtRoute("/internal/ai-doctor-phase1-preview");
      selectCase(id);
      const text = document.body.textContent ?? "";
      expect(text).toMatch(/Read-only/i);
      expect(text).toMatch(/No model calls/i);
      expect(text).toMatch(/No database writes/i);
      expect(text).toMatch(/No device control/i);
    },
  );

  it.each(AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => [c.id] as const))(
    "case %s shows the overdiagnosis warning (weak context)",
    (id) => {
      renderAtRoute("/internal/ai-doctor-phase1-preview");
      selectCase(id);
      expect(
        screen.getByTestId("ai-doctor-phase1-preview-overdiagnosis-warning").textContent,
      ).toMatch(/avoid treating this as a certain diagnosis/i);
    },
  );

  it("demo/csv-only case does not claim live data", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    selectCase("demo-csv-only");
    const debug = screen.getByTestId("ai-doctor-phase1-preview-debug");
    const text = debug.textContent ?? "";
    expect(text).toMatch(/has_live_data: false/);
    expect(text).toMatch(/has_demo_or_csv_only: true/);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-source-truth-warning").textContent,
    ).toMatch(/demo or imported/i);
    const summary = screen.getByTestId("ai-doctor-phase1-preview-summary");
    // Must not positively claim live data (e.g. "live data", "live sensor", "real-time data")
    const summaryLower = (summary.textContent ?? "").toLowerCase();
    expect(summaryLower).not.toMatch(/\blive data\b/);
    expect(summaryLower).not.toMatch(/\blive sensor\b/);
    expect(summaryLower).not.toMatch(/\breal-time data\b/);
  });

  it("stale/invalid case does not claim healthy/stable data", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    selectCase("stale-invalid-only");
    const debug = screen.getByTestId("ai-doctor-phase1-preview-debug");
    expect(debug.textContent ?? "").toMatch(/has_stale_or_invalid: true/);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-source-truth-warning").textContent,
    ).toMatch(/stale or invalid/i);
    const summary = screen.getByTestId("ai-doctor-phase1-preview-summary");
    const text = (summary.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/healthy/);
    expect(text).not.toMatch(/stable/);
  });

  it.each(AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => [c.id] as const))(
    "case %s does not render forbidden device-control / overconfidence copy",
    (id) => {
      const { container } = renderAtRoute("/internal/ai-doctor-phase1-preview");
      selectCase(id);
      const text = (container.textContent ?? "").toLowerCase();
      for (const forbidden of FORBIDDEN_COPY) {
        expect(text.includes(forbidden)).toBe(false);
      }
    },
  );

  it.each(AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => [c.id] as const))(
    "case %s renders no approve/execute/create buttons",
    (id) => {
      renderAtRoute("/internal/ai-doctor-phase1-preview");
      selectCase(id);
      expect(document.querySelectorAll("button").length).toBe(0);
    },
  );
});
