/**
 * End-of-Run Grow Report — presenter tests.
 *
 * Renders the read-only presenter from a built view-model and asserts each
 * section, honest empty states, the approval-required safety note, the
 * disabled/coming-soon Pro export, and the absence of fake live/automation
 * claims.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import EndOfRunGrowReportPreview from "@/components/EndOfRunGrowReportPreview";
import {
  buildEndOfRunGrowReportViewModel,
  type GrowReportInput,
} from "@/lib/endOfRunGrowReportViewModel";

const GROW = {
  id: "grow-1",
  name: "Blue Dream Run",
  stage: "flower",
  started_at: "2026-01-01T00:00:00Z",
  is_archived: false,
};

function richInput(): GrowReportInput {
  return {
    grow: GROW,
    tents: [{ id: "tent-a", name: "Tent A", grow_id: "grow-1" }],
    plants: [{ id: "p-1", name: "Alpha", strain: "BD", stage: "flower", tent_id: "tent-a" }],
    events: [
      { id: "e1", event_type: "watering", occurred_at: "2026-01-02T00:00:00Z", plant_id: "p-1" },
      { id: "e2", event_type: "photo", occurred_at: "2026-01-03T00:00:00Z", plant_id: "p-1" },
    ],
    sensorReadings: [{ id: "s1", source: "demo", ts: "2026-01-02T01:00:00Z", tent_id: "tent-a" }],
    alerts: [{ id: "a1", status: "open", severity: "high", metric: "temp", plant_id: "p-1" }],
    actions: [{ id: "act1", status: "pending_approval", plant_id: "p-1" }],
    aiDoctorSessions: [{ id: "d1", plant_id: "p-1" }],
  };
}

function renderRich() {
  const vm = buildEndOfRunGrowReportViewModel(richInput());
  render(<EndOfRunGrowReportPreview report={vm} />);
  return vm;
}

describe("EndOfRunGrowReportPreview — sections", () => {
  it("renders the header with status and read-only note", () => {
    renderRich();
    expect(screen.getByTestId("end-of-run-report-header")).toBeTruthy();
    expect(screen.getByText("Blue Dream Run")).toBeTruthy();
    expect(screen.getByText("Preview")).toBeTruthy();
    expect(screen.getByText("Read-only")).toBeTruthy();
    expect(screen.getByText("Based on available logged data")).toBeTruthy();
    expect(screen.getByText(/does not infer from missing data/i)).toBeTruthy();
  });

  it("renders run summary, plant highlights, sensor truth, alerts, action queue, lessons, and pro teaser", () => {
    renderRich();
    for (const testId of [
      "end-of-run-report-run-summary",
      "end-of-run-report-plants",
      "end-of-run-report-sensor-truth",
      "end-of-run-report-alerts",
      "end-of-run-report-action-queue",
      "end-of-run-report-lessons",
      "end-of-run-report-pro-teaser",
    ]) {
      expect(screen.getByTestId(testId)).toBeTruthy();
    }
  });

  it("renders the Action Queue approval-required safety note", () => {
    renderRich();
    const note = screen.getByTestId("action-queue-safety-note");
    expect(note.textContent).toMatch(/grower-approved/i);
    expect(note.textContent).toMatch(/does not include device commands/i);
  });

  it("renders the Pro teaser with a disabled, coming-soon export (no fake export)", () => {
    renderRich();
    const cta = screen.getByTestId("end-of-run-report-export-cta") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/coming soon/i);
  });

  it("labels degraded sensor data honestly and never as live", () => {
    renderRich();
    const truth = screen.getByTestId("end-of-run-report-sensor-truth");
    // demo-only data → degraded warning present, no "live" verdict
    expect(screen.getByTestId("sensor-degraded-warning")).toBeTruthy();
    expect(truth.textContent?.toLowerCase()).not.toContain("healthy");
  });
});

describe("EndOfRunGrowReportPreview — honest empty states", () => {
  it("renders an honest empty state and no automation/device-control claims", () => {
    const vm = buildEndOfRunGrowReportViewModel({ grow: GROW });
    render(<EndOfRunGrowReportPreview report={vm} />);
    expect(screen.getByTestId("end-of-run-report-empty")).toBeTruthy();
    // Alerts empty copy says "logged", not "no issues".
    expect(screen.getByText(/No alerts logged for this grow/i)).toBeTruthy();
    const root = screen.getByTestId("end-of-run-report-preview");
    const text = (root.textContent ?? "").toLowerCase();
    expect(text).not.toContain("healthy");
    expect(text).not.toContain("automatically");
    expect(text).not.toContain("no issues");
  });
});
