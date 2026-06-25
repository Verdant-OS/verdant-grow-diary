import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  buildAiDoctorEvidencePanelVM,
  type BuildEvidenceVMInput,
} from "@/lib/aiDoctorEvidenceViewModel";
import { AiDoctorEvidencePanel } from "@/components/AiDoctorEvidencePanel";
import type { AiDoctorSensorContext } from "@/lib/aiDoctorSensorContextRules";

const ACCEPTED_NOTE = [
  "EcoWitt Environment Check",
  "Source: local EcoWitt validation (test/local data, not live device control).",
  "Captured at: 2026-06-08T12:00:00.000Z",
  "Validation status: accepted",
  "Accepted metrics: 3 · Rejected metrics: 0",
  "",
  "Per-metric results:",
  "  • temp_f: accepted (value=72.4)",
  "  • humidity_pct: accepted (value=55)",
  "  • vpd_kpa: accepted (value=1.1) — derived",
].join("\n");

const REJECTED_NOTE = [
  "EcoWitt Environment Check",
  "Source: local EcoWitt validation (test/local data, not live device control).",
  "Captured at: 2026-06-08T12:00:00.000Z",
  "Validation status: rejected",
  "Accepted metrics: 1 · Rejected metrics: 1",
  "",
  "Per-metric results:",
  "  • temp_f: accepted (value=72.4)",
  "  • humidity_pct: rejected (value=120) — out of range",
  "  • soil_moisture_pct: not_checked (value=—)",
].join("\n");

function liveSensor(): AiDoctorSensorContext {
  return {
    sourceState: "live",
    sourceLabel: "Live",
    capturedAt: "2026-06-08T12:00:00.000Z",
    recordedAt: "2026-06-08T12:00:00.000Z",
    isStale: false,
    isInvalid: false,
    usableMetrics: ["temperature_c"],
    missingMetrics: [],
    invalidMetrics: [],
    confidenceImpact: "none",
    contextSummary: "Live sensor reading with 1 usable metric(s).",
    safetyNotes: [],
  };
}

function renderVM(input: BuildEvidenceVMInput) {
  const vm = buildAiDoctorEvidencePanelVM(input);
  render(<AiDoctorEvidencePanel vm={vm} />);
  return vm;
}

describe("AiDoctorEvidencePanel", () => {
  it("renders Environment Check evidence with Test/Local validation badge and captured_at", () => {
    renderVM({
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00.000Z", noteBody: ACCEPTED_NOTE },
      ],
      environmentCheckTimelineHref: "/timeline#ecowitt-environment-check-2026",
    });
    const envGroup = screen.getByTestId("evidence-group-envCheck");
    expect(within(envGroup).getByText("EcoWitt Environment Check")).toBeInTheDocument();
    expect(within(envGroup).getAllByText("Test/Local validation").length).toBeGreaterThan(0);
    expect(within(envGroup).queryByText("Live")).toBeNull();
    expect(within(envGroup).getByText("2026-06-08T12:00:00.000Z")).toBeInTheDocument();
    expect(within(envGroup).getByRole("link", { name: /view ecowitt environment check in timeline/i })).toHaveAttribute(
      "href",
      "/timeline#ecowitt-environment-check-2026",
    );
  });

  it("renders metric values, statuses, and labels derived VPD as Derived context", () => {
    renderVM({
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00.000Z", noteBody: ACCEPTED_NOTE },
      ],
    });
    const vpd = screen.getByTestId("evidence-metric-vpd_kpa");
    expect(within(vpd).getByText("Derived context")).toBeInTheDocument();
    expect(within(vpd).queryByText("Live")).toBeNull();
    const humidity = screen.getByTestId("evidence-metric-humidity_pct");
    expect(within(humidity).getByText("Accepted")).toBeInTheDocument();
    expect(within(humidity).getByText(/value:\s*55/)).toBeInTheDocument();
  });

  it("renders warnings + not-healthy state for rejected/not_checked metrics", () => {
    renderVM({
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00.000Z", noteBody: REJECTED_NOTE },
      ],
    });
    const humidity = screen.getByTestId("evidence-metric-humidity_pct");
    expect(within(humidity).getByText("Rejected")).toBeInTheDocument();
    expect(within(humidity).getByText("not healthy")).toBeInTheDocument();
    const soil = screen.getByTestId("evidence-metric-soil_moisture_pct");
    expect(within(soil).getByText("Not checked")).toBeInTheDocument();
    expect(within(soil).getByText("not healthy")).toBeInTheDocument();
    // Conservative copy
    expect(screen.getByTestId("evidence-conservative-copy").textContent?.toLowerCase()).toContain(
      "conservative",
    );
  });

  it("renders missing-context items when live sensor is absent", () => {
    renderVM({
      sensorContext: null,
      environmentCheckEvents: [],
    });
    expect(screen.getByTestId("evidence-missing-no-live-sensor")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-missing-no-environment-check")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-empty-envCheck")).toBeInTheDocument();
    expect(screen.getByTestId("evidence-conservative-copy").textContent).toMatch(
      /more data is needed/i,
    );
  });

  it("renders env-check-only conservative copy when no live/manual/csv sensors", () => {
    renderVM({
      sensorContext: null,
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00.000Z", noteBody: ACCEPTED_NOTE },
      ],
    });
    expect(
      screen.getByTestId("evidence-conservative-copy").textContent,
    ).toMatch(/useful context, but it is not live telemetry/i);
  });

  it("renders live sensor evidence with Live badge", () => {
    renderVM({ sensorContext: liveSensor(), environmentCheckEvents: [] });
    const live = screen.getByTestId("evidence-group-live");
    expect(within(live).getByText("Live")).toBeInTheDocument();
  });

  it("returns null when VM is missing (preserves existing AI Doctor behavior)", () => {
    const { container } = render(<AiDoctorEvidencePanel vm={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("does not expose tokens, user_id, service_role, bridge_token, or auth headers", async () => {
    renderVM({
      sensorContext: liveSensor(),
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00.000Z", noteBody: ACCEPTED_NOTE },
      ],
      environmentCheckTimelineHref: "/timeline",
      diaryLogEvidence: [
        {
          id: "diary-1",
          title: "Watering",
          capturedAt: "2026-06-08T11:00:00.000Z",
          summary: "Watered 500ml",
        },
      ],
    });
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/service_role|bridge_token|authorization|bearer\s|jwt|api_key|user_id/i);
  });

  it("static safety scan: no writes / functions.invoke / action_queue / device-control", async () => {
    const fs = await import("node:fs/promises");
    const files = [
      "src/lib/aiDoctorEvidenceViewModel.ts",
      "src/components/AiDoctorEvidencePanel.tsx",
    ];
    for (const f of files) {
      const src = await fs.readFile(f, "utf8");
      expect(src).not.toMatch(/sensor_readings/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/turn_on|turn_off|device_control|toggleDevice|setOutletState/i);
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
  });
});
