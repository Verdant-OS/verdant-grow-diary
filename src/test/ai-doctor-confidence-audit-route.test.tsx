/**
 * AI Doctor Confidence Audit — Route Tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AiDoctorConfidenceAudit from "@/pages/AiDoctorConfidenceAudit";
import { AI_DOCTOR_CONFIDENCE_RULE_IDS } from "@/lib/aiDoctorConfidenceAuditViewModel";

function selectScenario(id: string) {
  const select = screen.getByTestId(
    "ai-doctor-confidence-scenario-select",
  ) as HTMLSelectElement;
  fireEvent.change(select, { target: { value: id } });
}

const SCENARIO_IDS = [
  "demo-csv-only",
  "stale-invalid-only",
  "major-missing-information",
  "poor-visual-weak-context",
  "no-trustworthy-no-events",
  "conflicting-weak-signals",
];

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

  // -------------------------------------------------------------------------
  // Scenario selector tests
  // -------------------------------------------------------------------------
  it("renders scenario selector with all 6 options", () => {
    render(<AiDoctorConfidenceAudit />);
    expect(
      screen.getByTestId("ai-doctor-confidence-scenario-select"),
    ).toBeInTheDocument();
    for (const id of SCENARIO_IDS) {
      expect(
        screen.getByTestId(`ai-doctor-confidence-scenario-option-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("default scenario is demo-csv-only", () => {
    render(<AiDoctorConfidenceAudit />);
    const select = screen.getByTestId(
      "ai-doctor-confidence-scenario-select",
    ) as HTMLSelectElement;
    expect(select.value).toBe("demo-csv-only");
  });

  it.each(SCENARIO_IDS.map((id) => [id]))(
    "selecting scenario %s updates displayed cap/flags/takeaway",
    (id) => {
      render(<AiDoctorConfidenceAudit />);
      selectScenario(id);
      expect(
        screen.getByTestId("ai-doctor-confidence-scenario-panel"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("ai-doctor-confidence-scenario-label"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("ai-doctor-confidence-scenario-context-type"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("ai-doctor-confidence-scenario-ceiling"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("ai-doctor-confidence-scenario-takeaway"),
      ).toBeInTheDocument();
      // hard caps and safety flags should also be present
      expect(
        screen.getByTestId("ai-doctor-confidence-scenario-safety-flags"),
      ).toBeInTheDocument();
    },
  );

  it("demo-csv-only scenario shows ceiling 40", () => {
    render(<AiDoctorConfidenceAudit />);
    selectScenario("demo-csv-only");
    expect(
      screen.getByTestId("ai-doctor-confidence-scenario-ceiling"),
    ).toHaveTextContent("40");
  });

  it("stale-invalid-only scenario shows ceiling 30", () => {
    render(<AiDoctorConfidenceAudit />);
    selectScenario("stale-invalid-only");
    expect(
      screen.getByTestId("ai-doctor-confidence-scenario-ceiling"),
    ).toHaveTextContent("30");
  });

  it("major-missing-information scenario shows ceiling 45", () => {
    render(<AiDoctorConfidenceAudit />);
    selectScenario("major-missing-information");
    expect(
      screen.getByTestId("ai-doctor-confidence-scenario-ceiling"),
    ).toHaveTextContent("45");
  });

  it("conflicting-weak-signals scenario shows conservative/low ceiling", () => {
    render(<AiDoctorConfidenceAudit />);
    selectScenario("conflicting-weak-signals");
    expect(
      screen.getByTestId("ai-doctor-confidence-scenario-ceiling"),
    ).toHaveTextContent(/Conservative/);
  });

  it("page still shows internal/static/no-live/no-write/no-model/no-device labels after scenario selection", () => {
    render(<AiDoctorConfidenceAudit />);
    selectScenario("no-trustworthy-no-events");
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Internal audit/);
    expect(text).toMatch(/Static reference/);
    expect(text).toMatch(/No live data queries/);
    expect(text).toMatch(/No database writes/);
    expect(text).toMatch(/No model calls/);
    expect(text).toMatch(/No device control/);
  });
});
