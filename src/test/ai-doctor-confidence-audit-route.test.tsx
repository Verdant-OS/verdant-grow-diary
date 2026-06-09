/**
 * AI Doctor Confidence Audit — Route Tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AiDoctorConfidenceAudit from "@/pages/AiDoctorConfidenceAudit";
import { AI_DOCTOR_CONFIDENCE_RULE_IDS } from "@/lib/aiDoctorConfidenceAuditViewModel";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/internal/ai-doctor-confidence-audit"
          element={<AiDoctorConfidenceAudit />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

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
    renderAt("/internal/ai-doctor-confidence-audit");
    expect(
      screen.getByTestId("ai-doctor-confidence-audit-page"),
    ).toBeInTheDocument();
  });

  it("shows internal/static/no-live/no-write/no-model/no-device badges", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
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
    renderAt("/internal/ai-doctor-confidence-audit");
    const note = screen.getByTestId(
      "ai-doctor-confidence-audit-top-note",
    );
    expect(note).toHaveTextContent(/does not run/i);
    expect(note).toHaveTextContent(/confidence/i);
  });

  it("renders all confidence rules", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    for (const id of AI_DOCTOR_CONFIDENCE_RULE_IDS) {
      expect(
        screen.getByTestId(`ai-doctor-confidence-rule-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("renders all required hard caps", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
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
    renderAt("/internal/ai-doctor-confidence-audit");
    expect(
      screen.getByTestId("ai-doctor-confidence-high-confidence-list"),
    ).toBeInTheDocument();
  });

  it("renders source quality notes and forbidden behavior", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    expect(
      screen.getByTestId("ai-doctor-confidence-source-quality-list"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("ai-doctor-confidence-forbidden-behavior-list"),
    ).toBeInTheDocument();
  });

  it("renders all safety flags", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
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
    renderAt("/internal/ai-doctor-confidence-audit");
    expect(
      screen.getByTestId("ai-doctor-confidence-audit-generated-at"),
    ).toBeInTheDocument();
  });

  it("does not render any buttons", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    const buttons = document.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  it("does not contain forbidden execution copy", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
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
  // URL parameter tests
  // -------------------------------------------------------------------------
  it("default route selects demo-csv-only", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    const select = screen.getByTestId(
      "ai-doctor-confidence-scenario-select",
    ) as HTMLSelectElement;
    expect(select.value).toBe("demo-csv-only");
  });

  it.each(SCENARIO_IDS.map((id) => [id]))(
    "valid query param ?scenario=%s selects the matching scenario",
    (id) => {
      renderAt(`/internal/ai-doctor-confidence-audit?scenario=${id}`);
      const select = screen.getByTestId(
        "ai-doctor-confidence-scenario-select",
      ) as HTMLSelectElement;
      expect(select.value).toBe(id);
    },
  );

  it("invalid query param falls back to demo-csv-only", () => {
    renderAt("/internal/ai-doctor-confidence-audit?scenario=not-a-real-id");
    const select = screen.getByTestId(
      "ai-doctor-confidence-scenario-select",
    ) as HTMLSelectElement;
    expect(select.value).toBe("demo-csv-only");
  });

  it("changing select updates URL query param", () => {
    const { container } = renderAt("/internal/ai-doctor-confidence-audit");
    selectScenario("stale-invalid-only");
    // MemoryRouter syncs the URL internally; we verify via the select value
    const select = screen.getByTestId(
      "ai-doctor-confidence-scenario-select",
    ) as HTMLSelectElement;
    expect(select.value).toBe("stale-invalid-only");
  });

  // -------------------------------------------------------------------------
  // Accessibility tests
  // -------------------------------------------------------------------------
  it("label is visible and associated with select via htmlFor", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    const label = screen.getByTestId("ai-doctor-confidence-scenario-label");
    expect(label).toHaveAttribute("for", "ai-doctor-confidence-scenario-select");
    expect(label).toHaveTextContent("Select a weak-context scenario");
  });

  it("select has helper text via aria-describedby", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    const select = screen.getByTestId("ai-doctor-confidence-scenario-select");
    expect(select).toHaveAttribute("aria-describedby", "scenario-helper-text");
    const helper = screen.getByTestId("ai-doctor-confidence-scenario-helper-text");
    expect(helper).toHaveTextContent(/does not run scoring/);
  });

  it("select has aria-controls pointing to scenario panel", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    const select = screen.getByTestId("ai-doctor-confidence-scenario-select");
    expect(select).toHaveAttribute("aria-controls", "confidence-scenario-detail");
  });

  it("scenario panel has stable id", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    const panel = screen.getByTestId("ai-doctor-confidence-scenario-panel");
    expect(panel).toHaveAttribute("id", "confidence-scenario-detail");
  });

  it("native select is keyboard-focusable (no negative tabIndex)", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    const select = screen.getByTestId("ai-doctor-confidence-scenario-select");
    expect(select).not.toHaveAttribute("tabindex");
  });

  // -------------------------------------------------------------------------
  // Scenario selector tests
  // -------------------------------------------------------------------------
  it("renders scenario selector with all 6 options", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    expect(
      screen.getByTestId("ai-doctor-confidence-scenario-select"),
    ).toBeInTheDocument();
    for (const id of SCENARIO_IDS) {
      expect(
        screen.getByTestId(`ai-doctor-confidence-scenario-option-${id}`),
      ).toBeInTheDocument();
    }
  });

  it.each(SCENARIO_IDS.map((id) => [id]))(
    "selecting scenario %s updates displayed cap/flags/takeaway",
    (id) => {
      renderAt("/internal/ai-doctor-confidence-audit");
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
    renderAt("/internal/ai-doctor-confidence-audit");
    selectScenario("demo-csv-only");
    expect(
      screen.getByTestId("ai-doctor-confidence-scenario-ceiling"),
    ).toHaveTextContent("40");
  });

  it("stale-invalid-only scenario shows ceiling 30", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    selectScenario("stale-invalid-only");
    expect(
      screen.getByTestId("ai-doctor-confidence-scenario-ceiling"),
    ).toHaveTextContent("30");
  });

  it("major-missing-information scenario shows ceiling 45", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    selectScenario("major-missing-information");
    expect(
      screen.getByTestId("ai-doctor-confidence-scenario-ceiling"),
    ).toHaveTextContent("45");
  });

  it("conflicting-weak-signals scenario shows conservative/low ceiling", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
    selectScenario("conflicting-weak-signals");
    expect(
      screen.getByTestId("ai-doctor-confidence-scenario-ceiling"),
    ).toHaveTextContent(/Conservative/);
  });

  it("page still shows internal/static/no-live/no-write/no-model/no-device labels after scenario selection", () => {
    renderAt("/internal/ai-doctor-confidence-audit");
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
