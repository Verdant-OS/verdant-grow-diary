/**
 * AI Doctor Phase 1 Preview Route — tests.
 *
 * Verifies the static internal page renders safely:
 *   - Internal / static / read-only labels
 *   - Preview panel renders with all major sections
 *   - Action Queue is advisory + approval-required + disabled
 *   - No buttons anywhere
 *   - No forbidden device/control/certainty copy
 *   - No live-data claim for demo/csv-only/static sources
 *   - No healthy/stable claim for stale/invalid sources
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AiDoctorPhase1Preview from "@/pages/AiDoctorPhase1Preview";

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/internal/ai-doctor-phase1-preview" element={<AiDoctorPhase1Preview />} />
      </Routes>
    </MemoryRouter>,
  );
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

describe("AiDoctorPhase1Preview page", () => {
  it("renders at /internal/ai-doctor-phase1-preview", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-panel"),
    ).toBeTruthy();
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
    expect(text).toMatch(/does not.*score confidence/i);
    expect(text).toMatch(/does not.*write alerts/i);
    expect(text).toMatch(/does not.*create Action Queue items/i);
  });

  it("renders the preview panel in internal mode", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-mode").textContent,
    ).toBe("Internal preview");
  });

  it("renders summary, evidence, missing info, recommendations, safety, and debug sections", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(screen.getByTestId("ai-doctor-phase1-preview-summary")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-evidence")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-missing-info")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-recommendations")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-action-queue")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-safety")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-debug")).toBeTruthy();
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

  it("renders no buttons anywhere on the page", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(document.querySelectorAll("button").length).toBe(0);
  });

  it("does not render forbidden device-control / overconfidence copy", () => {
    const { container } = renderAtRoute("/internal/ai-doctor-phase1-preview");
    const text = (container.textContent ?? "").toLowerCase();
    for (const forbidden of FORBIDDEN_COPY) {
      expect(text.includes(forbidden)).toBe(false);
    }
  });

  it("does not claim live data when demo/csv-only sources are used", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    const debug = screen.getByTestId("ai-doctor-phase1-preview-debug");
    const text = debug.textContent ?? "";
    expect(text).toMatch(/has_live_data: false/);
    expect(text).toMatch(/has_demo_or_csv_only: true/);
  });

  it("does not claim healthy/stable for stale/invalid source data", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    const debug = screen.getByTestId("ai-doctor-phase1-preview-debug");
    const text = debug.textContent ?? "";
    expect(text).toMatch(/has_stale_or_invalid: true/);
    const summary = screen.getByTestId("ai-doctor-phase1-preview-summary");
    const summaryText = summary.textContent ?? "";
    expect(summaryText.toLowerCase()).not.toMatch(/stale.*healthy|invalid.*healthy/);
  });

  it("preserves safety warnings (automation, overdiagnosis, source truth)", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-automation-warning").textContent,
    ).toMatch(/does not control equipment/i);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-overdiagnosis-warning").textContent,
    ).toMatch(/avoid treating this as a certain diagnosis/i);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-source-truth-warning").textContent,
    ).toMatch(/demo or imported|stale or invalid/i);
  });

  it("shows missing information severity as high with 5 missing items", () => {
    renderAtRoute("/internal/ai-doctor-phase1-preview");
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-missing-severity").textContent,
    ).toBe("high");
  });
});
