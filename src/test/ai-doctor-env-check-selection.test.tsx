import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  parseEnvironmentCheckNote,
  classifyEnvironmentCheckQuality,
  selectBestEnvironmentCheckEvent,
  buildEnvironmentCheckChecklist,
  REQUIRED_ENVIRONMENT_METRICS,
} from "@/lib/aiDoctorEnvironmentCheckRules";
import { buildAiDoctorEvidencePanelVM } from "@/lib/aiDoctorEvidenceViewModel";
import { AiDoctorEvidencePanel } from "@/components/AiDoctorEvidencePanel";

const FULL_ACCEPTED_NOTE = (capturedAt: string) =>
  [
    "EcoWitt Environment Check",
    "Source: local EcoWitt validation (test/local data, not live device control).",
    `Captured at: ${capturedAt}`,
    "Validation status: accepted",
    "Accepted metrics: 5 · Rejected metrics: 0",
    "",
    "Per-metric results:",
    "  • temp_f: accepted (value=72.4)",
    "  • humidity_pct: accepted (value=55)",
    "  • vpd_kpa: accepted (value=1.1) — derived",
    "  • co2_ppm: accepted (value=820)",
    "  • soil_moisture_pct: accepted (value=42)",
  ].join("\n");

const MIXED_NOTE = (capturedAt: string) =>
  [
    "EcoWitt Environment Check",
    "Source: local EcoWitt validation (test/local data, not live device control).",
    `Captured at: ${capturedAt}`,
    "Validation status: rejected",
    "Accepted metrics: 1 · Rejected metrics: 2",
    "",
    "Per-metric results:",
    "  • temp_f: accepted (value=72.4)",
    "  • humidity_pct: rejected (value=120) — out of range",
    "  • soil_moisture_pct: not_checked (value=—)",
    // Duplicate temp_f — should be ignored deterministically.
    "  • temp_f: rejected (value=999) — duplicate",
    // Unsupported label.
    "  • mystery_metric: accepted (value=1)",
  ].join("\n");

describe("aiDoctorEnvironmentCheckRules — parser hardening", () => {
  it("does not throw on malformed / empty / null note bodies", () => {
    expect(() => parseEnvironmentCheckNote("")).not.toThrow();
    // @ts-expect-error – intentionally passing nullish
    expect(() => parseEnvironmentCheckNote(null)).not.toThrow();
    expect(() => parseEnvironmentCheckNote("\u0000\n• broken")).not.toThrow();
  });

  it("ignores duplicate metric labels deterministically (first wins)", () => {
    const parsed = parseEnvironmentCheckNote(MIXED_NOTE("2026-06-08T12:00:00Z"));
    const tempRows = parsed.metrics.filter((m) => m.key === "temp_f");
    expect(tempRows).toHaveLength(1);
    expect(tempRows[0].status).toBe("accepted");
  });

  it("marks unexpected labels as not supported", () => {
    const parsed = parseEnvironmentCheckNote(MIXED_NOTE("2026-06-08T12:00:00Z"));
    const mystery = parsed.metrics.find((m) => m.key === "mystery_metric");
    expect(mystery?.supported).toBe(false);
  });

  it("preserves per-metric status on mixed accepted/rejected/not_checked notes", () => {
    const parsed = parseEnvironmentCheckNote(MIXED_NOTE("2026-06-08T12:00:00Z"));
    expect(parsed.metrics.find((m) => m.key === "humidity_pct")?.status).toBe("rejected");
    expect(parsed.metrics.find((m) => m.key === "soil_moisture_pct")?.status).toBe("not_checked");
    expect(parsed.metrics.find((m) => m.key === "temp_f")?.status).toBe("accepted");
  });

  it("treats notes missing the source marker as not Environment Checks", () => {
    const q = classifyEnvironmentCheckQuality({
      occurredAt: "2026-06-08T12:00:00Z",
      noteBody: "EcoWitt Environment Check\nPer-metric results:\n  • temp_f: accepted (value=72)",
    });
    expect(q.selectedStatus).toBe("missing");
  });

  it("ignores rows with status but no value (regex requires value=...)", () => {
    const parsed = parseEnvironmentCheckNote(
      "EcoWitt Environment Check\nSource: local EcoWitt validation\nPer-metric results:\n  • temp_f: accepted\n",
    );
    expect(parsed.metrics).toHaveLength(0);
  });

  it("flags derived VPD as derived (context only)", () => {
    const parsed = parseEnvironmentCheckNote(FULL_ACCEPTED_NOTE("2026-06-08T12:00:00Z"));
    expect(parsed.metrics.find((m) => m.key === "vpd_kpa")?.derived).toBe(true);
  });

  it("treats unrelated EcoWitt-mentioning notes as non-Environment-Checks", () => {
    const q = classifyEnvironmentCheckQuality({
      occurredAt: "2026-06-08T12:00:00Z",
      noteBody: "Saw EcoWitt sensor reading today",
    });
    expect(q.selectedStatus).toBe("missing");
  });
});

describe("selectBestEnvironmentCheckEvent", () => {
  it("prefers latest accepted over newer rejected/weak event", () => {
    const sel = selectBestEnvironmentCheckEvent([
      { occurredAt: "2026-06-08T15:00:00Z", noteBody: MIXED_NOTE("2026-06-08T15:00:00Z") },
      { occurredAt: "2026-06-08T12:00:00Z", noteBody: FULL_ACCEPTED_NOTE("2026-06-08T12:00:00Z") },
      { occurredAt: "2026-06-08T08:00:00Z", noteBody: FULL_ACCEPTED_NOTE("2026-06-08T08:00:00Z") },
    ]);
    expect(sel.selected?.occurredAt).toBe("2026-06-08T12:00:00Z");
    expect(sel.isFallback).toBe(false);
    expect(sel.selectedStatus).toBe("accepted");
  });

  it("falls back to newest weak event when no accepted exists", () => {
    const sel = selectBestEnvironmentCheckEvent([
      { occurredAt: "2026-06-08T15:00:00Z", noteBody: MIXED_NOTE("2026-06-08T15:00:00Z") },
      { occurredAt: "2026-06-08T13:00:00Z", noteBody: MIXED_NOTE("2026-06-08T13:00:00Z") },
    ]);
    expect(sel.selected?.occurredAt).toBe("2026-06-08T15:00:00Z");
    expect(sel.isFallback).toBe(true);
    expect(["mixed", "rejected", "weak"]).toContain(sel.selectedStatus);
  });

  it("tie-breaker is deterministic (same accepted status, same time)", () => {
    const sel = selectBestEnvironmentCheckEvent([
      { occurredAt: "2026-06-08T12:00:00Z", noteBody: FULL_ACCEPTED_NOTE("2026-06-08T12:00:00Z") },
      { occurredAt: "2026-06-08T12:00:00Z", noteBody: FULL_ACCEPTED_NOTE("2026-06-08T12:00:00Z") },
    ]);
    expect(sel.selected).not.toBeNull();
  });

  it("never throws on malformed event list", () => {
    expect(() => selectBestEnvironmentCheckEvent(null)).not.toThrow();
    expect(() =>
      selectBestEnvironmentCheckEvent([
        // @ts-expect-error – intentionally malformed entry
        null,
        { occurredAt: null, noteBody: undefined },
      ]),
    ).not.toThrow();
  });
});

describe("buildEnvironmentCheckChecklist", () => {
  it("marks accepted required metrics complete and others needed", () => {
    const c = buildEnvironmentCheckChecklist({
      event: {
        occurredAt: "2026-06-08T12:00:00Z",
        noteBody: MIXED_NOTE("2026-06-08T12:00:00Z"),
      },
      hasLiveSensorContext: false,
    });
    const byKey = Object.fromEntries(c.items.map((i) => [i.key, i]));
    expect(byKey.temp_f.state).toBe("complete");
    expect(byKey.humidity_pct.state).toBe("needed");
    expect(byKey.soil_moisture_pct.state).toBe("needed");
    expect(byKey.co2_ppm.state).toBe("needed");
    expect(byKey.vpd_kpa.state).toBe("needed");
    expect(c.cautionCopy.toLowerCase()).toContain("live telemetry is still missing");
  });

  it("shows env-check-only caution when all required metrics accepted but no live sensor", () => {
    const c = buildEnvironmentCheckChecklist({
      event: {
        occurredAt: "2026-06-08T12:00:00Z",
        noteBody: FULL_ACCEPTED_NOTE("2026-06-08T12:00:00Z"),
      },
      hasLiveSensorContext: false,
    });
    expect(c.hasNeeded).toBe(false);
    expect(c.cautionCopy.toLowerCase()).toContain("environment check is useful context");
  });

  it("covers all required metrics", () => {
    const c = buildEnvironmentCheckChecklist({ event: null, hasLiveSensorContext: false });
    expect(c.items.map((i) => i.key).sort()).toEqual(
      [...REQUIRED_ENVIRONMENT_METRICS].sort(),
    );
    expect(c.items.every((i) => i.state === "needed")).toBe(true);
  });
});

describe("Evidence panel — Latest EcoWitt Environment Check + checklist", () => {
  it("renders section title, Test/Local validation, captured_at, per-metric rows, and Derived context for VPD", () => {
    const vm = buildAiDoctorEvidencePanelVM({
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00Z", noteBody: FULL_ACCEPTED_NOTE("2026-06-08T12:00:00Z") },
      ],
      environmentCheckTimelineHref: "/timeline#ecowitt",
    });
    render(<AiDoctorEvidencePanel vm={vm} />);
    const section = screen.getByTestId("latest-environment-check-section");
    expect(within(section).getByText("Latest EcoWitt Environment Check")).toBeInTheDocument();
    expect(within(section).getByText("Test/Local validation")).toBeInTheDocument();
    expect(within(section).queryByText("Live")).toBeNull();
    expect(within(section).getByText("2026-06-08T12:00:00Z")).toBeInTheDocument();
    // All 5 required rows visible
    for (const key of REQUIRED_ENVIRONMENT_METRICS) {
      expect(screen.getByTestId(`latest-env-check-row-${key}`)).toBeInTheDocument();
    }
    const vpdRow = screen.getByTestId("latest-env-check-row-vpd_kpa");
    expect(within(vpdRow).getByText("Derived context")).toBeInTheDocument();
    expect(
      within(section).getByRole("link", { name: /view latest ecowitt environment check in timeline/i }),
    ).toHaveAttribute("href", "/timeline#ecowitt");
  });

  it("shows rejected/not_checked rows and never hides them", () => {
    const vm = buildAiDoctorEvidencePanelVM({
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00Z", noteBody: MIXED_NOTE("2026-06-08T12:00:00Z") },
      ],
    });
    render(<AiDoctorEvidencePanel vm={vm} />);
    const humidity = screen.getByTestId("latest-env-check-row-humidity_pct");
    expect(within(humidity).getByText("Rejected")).toBeInTheDocument();
    expect(within(humidity).getByText("not healthy")).toBeInTheDocument();
    const soil = screen.getByTestId("latest-env-check-row-soil_moisture_pct");
    expect(within(soil).getByText("Not checked")).toBeInTheDocument();
  });

  it("renders missing-context state when no events exist", () => {
    const vm = buildAiDoctorEvidencePanelVM({ environmentCheckEvents: [] });
    render(<AiDoctorEvidencePanel vm={vm} />);
    const section = screen.getByTestId("latest-environment-check-section");
    expect(within(section).getByTestId("latest-env-check-status")).toHaveTextContent("Missing");
    expect(screen.getByTestId("more-data-needed-section")).toBeInTheDocument();
  });

  it("checklist marks accepted complete and missing/rejected/not_checked as needed", () => {
    const vm = buildAiDoctorEvidencePanelVM({
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00Z", noteBody: MIXED_NOTE("2026-06-08T12:00:00Z") },
      ],
    });
    render(<AiDoctorEvidencePanel vm={vm} />);
    expect(within(screen.getByTestId("more-data-item-temp_f")).getByText("Complete")).toBeInTheDocument();
    expect(within(screen.getByTestId("more-data-item-humidity_pct")).getByText("Needed")).toBeInTheDocument();
    expect(within(screen.getByTestId("more-data-item-vpd_kpa")).getByText("Needed")).toBeInTheDocument();
  });

  it("does not expose tokens, user_id, service_role, bridge_token, or auth headers", () => {
    const vm = buildAiDoctorEvidencePanelVM({
      environmentCheckEvents: [
        { occurredAt: "2026-06-08T12:00:00Z", noteBody: FULL_ACCEPTED_NOTE("2026-06-08T12:00:00Z") },
      ],
    });
    render(<AiDoctorEvidencePanel vm={vm} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/service_role|bridge_token|authorization|bearer\s|jwt|api_key|user_id/i);
  });

  it("static safety scan: no writes / functions.invoke / action_queue / device-control", async () => {
    const fs = await import("node:fs/promises");
    const files = [
      "src/lib/aiDoctorEnvironmentCheckRules.ts",
      "src/lib/aiDoctorContextCompiler.ts",
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
