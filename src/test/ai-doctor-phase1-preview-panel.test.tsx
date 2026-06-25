/**
 * AI Doctor Phase 1 Read-Only Preview Panel — tests.
 *
 * Verifies presenter-only behavior:
 *   - Read-only / no-model / no-write / no-device labels
 *   - All major sections render
 *   - Confidence + safety warnings come from the view model
 *   - Advisory Action Queue is approval-required, no execute buttons
 *   - No forbidden device/control/certainty copy
 *   - Source-truth warnings preserved for demo/csv and stale/invalid
 *   - Empty arrays render harmless empty states
 *   - Component file does not import Supabase / Edge Function / model clients
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { AiDoctorPhase1PreviewPanel } from "@/components/AiDoctorPhase1PreviewPanel";
import type { AiDoctorPhase1ViewModel } from "@/lib/aiDoctorPhase1ViewModel";

function baseViewModel(): AiDoctorPhase1ViewModel {
  return {
    summaryCard: {
      title: "AI Doctor — Test Plant",
      summary: "Leaves show mild yellowing.",
      likely_issue: "Possible early nitrogen deficiency.",
      risk_level: "medium",
      confidence_label: "Low confidence",
      confidence_score: 28,
      confidence_explanation: "Limited trustworthy data.",
      status_badges: [
        "Risk: medium",
        "Confidence: low",
        "Sample data only",
        "Stale or invalid readings",
      ],
    },
    evidencePanel: {
      evidence_items: ["Yellowing on lower fan leaves"],
      context_items: ["Plant: p1", "Strain: Test"],
      source_quality_items: [
        "Demo readings (sample data, not real-time): 2",
        "Stale readings (not current): 1",
      ],
      limitations: ["No live or manual sensor readings in the last 7 days."],
    },
    missingInfoPanel: {
      has_missing_info: true,
      items: ["pH reading", "EC reading"],
      severity: "low",
    },
    recommendationsPanel: {
      immediate_action: "Collect a fresh manual sensor reading.",
      what_not_to_do: ["Avoid aggressive nutrient changes."],
      twenty_four_hour_follow_up: "Re-check the plant in 24 hours.",
      three_day_recovery_plan: "Stabilize environment over 3 days.",
      monitoring_priorities: ["Capture fresh live or manual sensor readings."],
    },
    actionQueuePanel: {
      should_show: true,
      status: "pending_approval",
      action_type: "advisory",
      label: "Suggested advisory action",
      reason:
        "Consider adjusting feed slightly. Advisory only. Grower approval is required before any change is made.",
      disabled_reason: "More context needed before turning this into an action.",
    },
    safetyPanel: {
      safety_flags: ["avoid_overdiagnosis", "weak_context"],
      overdiagnosis_warning:
        "Context is limited — avoid treating this as a certain diagnosis. Confirm with fresh readings and observations.",
      source_truth_warning:
        "Only demo or imported (CSV) data is available — not real-time sensor data. Some readings are stale or invalid — not current and not reliable.",
      automation_warning:
        "Verdant does not control equipment in this view. Any equipment change is up to the grower.",
    },
    debugMeta: {
      source_counts: {
        live_count: 0,
        manual_count: 0,
        csv_count: 0,
        demo_count: 2,
        stale_count: 1,
        invalid_count: 0,
        has_recent_trustworthy_sensor_data: false,
        has_recent_grow_events: false,
        has_visual_context: false,
      },
      has_live_data: false,
      has_manual_data: false,
      has_demo_or_csv_only: false,
      has_stale_or_invalid: true,
      generated_at: "2026-06-04T12:00:00.000Z",
      raw_confidence_level: "low",
      displayed_confidence_level: "low",
    },
  };
}

function emptyViewModel(): AiDoctorPhase1ViewModel {
  const vm = baseViewModel();
  return {
    ...vm,
    evidencePanel: {
      evidence_items: [],
      context_items: [],
      source_quality_items: [],
      limitations: [],
    },
    missingInfoPanel: { has_missing_info: false, items: [], severity: "none" },
    recommendationsPanel: {
      ...vm.recommendationsPanel,
      what_not_to_do: [],
      monitoring_priorities: [],
    },
    safetyPanel: {
      ...vm.safetyPanel,
      safety_flags: [],
      overdiagnosis_warning: null,
      source_truth_warning: null,
    },
    actionQueuePanel: {
      ...vm.actionQueuePanel,
      should_show: false,
      status: "not_applicable",
      action_type: "none",
      disabled_reason: null,
    },
  };
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

describe("AiDoctorPhase1PreviewPanel", () => {
  it("renders read-only / no-model / no-write / no-device header labels", () => {
    render(<AiDoctorPhase1PreviewPanel viewModel={baseViewModel()} />);
    const header = screen.getByTestId("ai-doctor-phase1-preview-header");
    const text = header.textContent ?? "";
    expect(text).toMatch(/AI Doctor Phase 1 Preview/i);
    expect(text).toMatch(/Read-only/i);
    expect(text).toMatch(/No model calls/i);
    expect(text).toMatch(/No database writes/i);
    expect(text).toMatch(/No device control/i);
  });

  it("renders mode labels for demo / manual / internal", () => {
    const vm = baseViewModel();
    const { rerender } = render(
      <AiDoctorPhase1PreviewPanel viewModel={vm} mode="demo" />,
    );
    expect(screen.getByTestId("ai-doctor-phase1-preview-mode").textContent).toBe(
      "Demo preview",
    );
    rerender(<AiDoctorPhase1PreviewPanel viewModel={vm} mode="manual" />);
    expect(screen.getByTestId("ai-doctor-phase1-preview-mode").textContent).toBe(
      "Manual preview",
    );
    rerender(<AiDoctorPhase1PreviewPanel viewModel={vm} mode="internal" />);
    expect(screen.getByTestId("ai-doctor-phase1-preview-mode").textContent).toBe(
      "Internal preview",
    );
  });

  it("renders all major sections from the view model", () => {
    render(<AiDoctorPhase1PreviewPanel viewModel={baseViewModel()} />);
    expect(screen.getByTestId("ai-doctor-phase1-preview-summary")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-evidence")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-missing-info")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-recommendations")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-action-queue")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-safety")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-phase1-preview-debug")).toBeTruthy();
  });

  it("shows confidence label, score, explanation from view model", () => {
    render(<AiDoctorPhase1PreviewPanel viewModel={baseViewModel()} />);
    const summary = screen.getByTestId("ai-doctor-phase1-preview-summary");
    const text = summary.textContent ?? "";
    expect(text).toContain("Low confidence");
    expect(text).toContain("28");
    expect(text).toContain("Limited trustworthy data.");
  });

  it("renders safety warnings (automation, overdiagnosis, source truth) from VM", () => {
    render(<AiDoctorPhase1PreviewPanel viewModel={baseViewModel()} />);
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

  it("renders advisory Action Queue as approval-required with disabled reason and no execute buttons", () => {
    render(<AiDoctorPhase1PreviewPanel viewModel={baseViewModel()} />);
    const panel = screen.getByTestId("ai-doctor-phase1-preview-action-queue");
    expect(panel.textContent).toMatch(/Suggested advisory action/i);
    expect(panel.textContent).toMatch(/Grower approval is required/i);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-action-disabled-reason").textContent,
    ).toMatch(/More context needed/i);
    // No buttons at all in the action queue panel.
    expect(within(panel).queryAllByRole("button").length).toBe(0);
  });

  it("renders no buttons anywhere in the preview panel", () => {
    render(<AiDoctorPhase1PreviewPanel viewModel={baseViewModel()} />);
    const root = screen.getByTestId("ai-doctor-phase1-preview-panel");
    expect(within(root).queryAllByRole("button").length).toBe(0);
  });

  it("does not render forbidden device-control / overconfidence copy", () => {
    const { container } = render(
      <AiDoctorPhase1PreviewPanel viewModel={baseViewModel()} />,
    );
    const text = (container.textContent ?? "").toLowerCase();
    for (const forbidden of FORBIDDEN_COPY) {
      expect(text.includes(forbidden)).toBe(false);
    }
  });

  it("hides Action Queue panel when should_show is false", () => {
    render(<AiDoctorPhase1PreviewPanel viewModel={emptyViewModel()} />);
    expect(screen.queryByTestId("ai-doctor-phase1-preview-action-queue")).toBeNull();
  });

  it("renders harmless empty states when arrays are empty, keeps source/safety labels", () => {
    render(<AiDoctorPhase1PreviewPanel viewModel={emptyViewModel()} />);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-evidence-items-empty").textContent,
    ).toMatch(/No evidence items supplied/i);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-context-items-empty").textContent,
    ).toMatch(/No context items supplied/i);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-limitations-empty").textContent,
    ).toMatch(/No limitations supplied/i);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-missing-items-empty").textContent,
    ).toMatch(/No missing information listed/i);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-safety-flags-empty").textContent,
    ).toMatch(/No safety flags supplied/i);
    // Automation warning is still rendered (never hidden).
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-automation-warning"),
    ).toBeTruthy();
  });

  it("preserves source-truth warning for demo/csv-only fixture", () => {
    const vm = baseViewModel();
    vm.safetyPanel = {
      ...vm.safetyPanel,
      source_truth_warning:
        "Only demo or imported (CSV) data is available — not real-time sensor data.",
    };
    vm.debugMeta = { ...vm.debugMeta, has_demo_or_csv_only: true, has_stale_or_invalid: false };
    render(<AiDoctorPhase1PreviewPanel viewModel={vm} />);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-source-truth-warning").textContent,
    ).toMatch(/demo or imported/i);
  });

  it("preserves source-truth warning for stale/invalid-only fixture", () => {
    const vm = baseViewModel();
    vm.safetyPanel = {
      ...vm.safetyPanel,
      source_truth_warning:
        "Some readings are stale or invalid — not current and not reliable.",
    };
    vm.debugMeta = { ...vm.debugMeta, has_demo_or_csv_only: false, has_stale_or_invalid: true };
    render(<AiDoctorPhase1PreviewPanel viewModel={vm} />);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-source-truth-warning").textContent,
    ).toMatch(/stale or invalid/i);
  });

  it("renders debug source counts from the view model", () => {
    render(<AiDoctorPhase1PreviewPanel viewModel={baseViewModel()} />);
    const debug = screen.getByTestId("ai-doctor-phase1-preview-debug");
    const text = debug.textContent ?? "";
    expect(text).toMatch(/has_live_data: false/);
    expect(text).toMatch(/has_stale_or_invalid: true/);
    expect(text).toMatch(/demo_count: 2/);
    expect(text).toMatch(/generated_at: 2026-06-04T12:00:00\.000Z/);
  });

  it("uses default title when none provided", () => {
    render(<AiDoctorPhase1PreviewPanel viewModel={baseViewModel()} />);
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-header").textContent,
    ).toMatch(/AI Doctor Phase 1 Preview/);
  });

  it("uses custom title when provided", () => {
    render(
      <AiDoctorPhase1PreviewPanel viewModel={baseViewModel()} title="Internal QA View" />,
    );
    expect(
      screen.getByTestId("ai-doctor-phase1-preview-header").textContent,
    ).toContain("Internal QA View");
  });

  // ----- Static file scan: no forbidden imports / calls -----
  it("component source does not import Supabase, model client, or Edge Function helpers", () => {
    const source = readFileSync(
      resolve(__dirname, "../components/AiDoctorPhase1PreviewPanel.tsx"),
      "utf-8",
    );
    expect(source).not.toMatch(/@\/integrations\/supabase/);
    expect(source).not.toMatch(/from\s+["']@supabase/);
    expect(source).not.toMatch(/functions\.invoke/);
    expect(source).not.toMatch(/generateMultimodalDiagnosisPhase1/);
    expect(source).not.toMatch(/calculateAiDoctorConfidence/);
    expect(source).not.toMatch(/compilePlantContextFromRows/);
    expect(source).not.toMatch(/fetch\s*\(/);
  });
});
