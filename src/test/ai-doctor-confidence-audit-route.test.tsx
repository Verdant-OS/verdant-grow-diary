/**
 * AI Doctor Confidence Audit — Route Tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AiDoctorConfidenceAudit from "@/pages/AiDoctorConfidenceAudit";
import { AI_DOCTOR_CONFIDENCE_RULE_IDS } from "@/lib/aiDoctorConfidenceAuditViewModel";

describe("AiDoctorConfidenceAudit route page", () => {
  it("renders the page", () => {
    render(<AiDoctorConfidenceAudit />);
    expect(
      screen.getByTestId("ai-doctor-confidence-audit-page"),
    ).toBeInTheDocument();
  });

  it("shows internal/static/no-live/no-write/no-model/no-device badges", () => {
    render(<AiDoctorConfidenceAudit />);
    const expected = [
      "Internal audit",
      "Static reference",
      "No live data queries",
      "No database writes",
      "No model calls",
      "No device control",
    ];
    expected.forEach((label, i) => {
      expect(
        screen.getByTestId(`ai-doctor-confidence-audit-badge-${i}`),
      ).toHaveTextContent(label);
    });
  });

  it("renders the top safety note", () => {
    render(<AiDoctorConfidenceAudit />);
    const note = screen.getByTestId(
      "ai-doctor-confidence-audit-top-note",
    );
    expect(note).toHaveTextContent(/does not run/i);
    expect(note).toHaveTextContent(/confidence/i);
  });

  it("renders all confidence rules", () => {
    render(<AiDoctorConfidenceAudit />);
    for (const id of AI_DOCTOR_CONFIDENCE_RULE_IDS) {
      expect(
        screen.getByTestId(`ai-doctor-confidence-rule-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("renders all required hard caps", () => {
    render(<AiDoctorConfidenceAudit />);
    const ids = [
      "no-trustworthy-sensors-no-events",
      "stale-or-invalid-only",
      "demo-or-csv-only",
      "major-missing-information",
      "poor-visual-quality-weak-context",
    ];
    for (const id of ids) {
      expect(
        screen.getByTestId(`ai-doctor-confidence-hard-cap-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("renders the high-confidence quartet list", () => {
    render(<AiDoctorConfidenceAudit />);
    expect(
      screen.getByTestId("ai-doctor-confidence-high-confidence-list"),
    ).toBeInTheDocument();
  });

  it("renders source quality notes and forbidden behavior", () => {
    render(<AiDoctorConfidenceAudit />);
    expect(
      screen.getByTestId("ai-doctor-confidence-source-quality-list"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("ai-doctor-confidence-forbidden-behavior-list"),
    ).toBeInTheDocument();
  });

  it("renders all safety flags", () => {
    render(<AiDoctorConfidenceAudit />);
    const flags = [
      "weak_context",
      "no_trustworthy_sensor_data",
      "no_recent_grow_events",
      "demo_or_csv_only",
      "stale_or_invalid_readings_present",
      "poor_visual_quality",
      "major_missing_information",
      "avoid_overdiagnosis",
    ];
    for (const flag of flags) {
      expect(
        screen.getByTestId(`ai-doctor-confidence-safety-flag-${flag}`),
      ).toBeInTheDocument();
    }
  });

  it("renders the generated_at footer", () => {
    render(<AiDoctorConfidenceAudit />);
    expect(
      screen.getByTestId("ai-doctor-confidence-audit-generated-at"),
    ).toBeInTheDocument();
  });

  it("does not render any buttons", () => {
    render(<AiDoctorConfidenceAudit />);
    const buttons = document.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  it("does not contain forbidden execution copy", () => {
    render(<AiDoctorConfidenceAudit />);
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
});
