/**
 * Sensor Truth Audit — Route Tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorTruthAudit from "@/pages/SensorTruthAudit";

describe("SensorTruthAudit route page", () => {
  it("renders the page", () => {
    render(<SensorTruthAudit />);
    expect(
      screen.getByTestId("sensor-truth-audit-page"),
    ).toBeInTheDocument();
  });

  it("shows internal/static/no-live/no-write/no-model/no-device labels", () => {
    render(<SensorTruthAudit />);
    expect(
      screen.getByTestId("sensor-truth-audit-badge-0"),
    ).toHaveTextContent("Internal audit");
    expect(
      screen.getByTestId("sensor-truth-audit-badge-1"),
    ).toHaveTextContent("Static reference");
    expect(
      screen.getByTestId("sensor-truth-audit-badge-2"),
    ).toHaveTextContent("No live data queries");
    expect(
      screen.getByTestId("sensor-truth-audit-badge-3"),
    ).toHaveTextContent("No database writes");
    expect(
      screen.getByTestId("sensor-truth-audit-badge-4"),
    ).toHaveTextContent("No model calls");
    expect(
      screen.getByTestId("sensor-truth-audit-badge-5"),
    ).toHaveTextContent("No device control");
  });

  it("renders all six source labels", () => {
    render(<SensorTruthAudit />);
    const labels = ["live", "manual", "csv", "demo", "stale", "invalid"];
    for (const label of labels) {
      expect(
        screen.getByTestId(`sensor-truth-source-rule-${label}`),
      ).toBeInTheDocument();
    }
  });

  it("renders all suspicious checks", () => {
    render(<SensorTruthAudit />);
    const ids = [
      "celsius-as-fahrenheit",
      "us-cm-as-ms-cm",
      "humidity-stuck-at-0-or-100",
      "soil-moisture-stuck-at-0-or-100",
      "ph-outside-realistic-range",
      "old-readings-as-current",
    ];
    for (const id of ids) {
      expect(
        screen.getByTestId(`sensor-truth-suspicious-check-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("renders core warnings", () => {
    render(<SensorTruthAudit />);
    expect(
      screen.getByTestId("sensor-truth-audit-core-warnings-list"),
    ).toBeInTheDocument();
  });

  it("renders blocked live-data note", () => {
    render(<SensorTruthAudit />);
    expect(
      screen.getByTestId("sensor-truth-audit-blocked-note"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("sensor-truth-audit-blocked-note-text"),
    ).toHaveTextContent(/EcoWitt/i);
  });

  it("renders validation notes", () => {
    render(<SensorTruthAudit />);
    expect(
      screen.getByTestId("sensor-truth-audit-validation-notes-list"),
    ).toBeInTheDocument();
  });

  it("renders generated timestamp", () => {
    render(<SensorTruthAudit />);
    expect(
      screen.getByTestId("sensor-truth-audit-generated-at"),
    ).toBeInTheDocument();
  });

  it("has no buttons", () => {
    render(<SensorTruthAudit />);
    expect(screen.queryAllByRole("button").length).toBe(0);
  });

  it("forbidden copy is absent", () => {
    render(<SensorTruthAudit />);
    const text = document.body.textContent || "";
    const forbidden = [
      "Execute",
      "Run command",
      "Send command",
      "Control device",
      "Turn on",
      "Turn off",
      "Set fan",
      "Set light",
      "Dose",
      "Flush immediately",
      "Guaranteed",
      "Definitely",
      "Certainly",
    ];
    for (const phrase of forbidden) {
      expect(text).not.toMatch(new RegExp(phrase, "i"));
    }
  });

  it("has no fake-live claims in core warnings", () => {
    render(<SensorTruthAudit />);
    const warnings = screen
      .getByTestId("sensor-truth-audit-core-warnings-list")
      .textContent?.toLowerCase() || "";
    expect(warnings).not.toContain("fake live");
    expect(warnings).toContain("demo data must never be shown as live");
  });
});
