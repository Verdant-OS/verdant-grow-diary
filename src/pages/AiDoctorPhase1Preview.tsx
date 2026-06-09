/**
 * AI Doctor Phase 1 Preview — internal static page.
 *
 * Mounts the read-only AiDoctorPhase1PreviewPanel using a static local fixture.
 * Does NOT call Supabase, models, Edge Functions, or any external APIs.
 * Does NOT write to alerts, Action Queue, or any database table.
 * Does NOT trigger automation or device control.
 *
 * This page is for operator/developer inspection only.
 */
import * as React from "react";
import {
  AiDoctorPhase1PreviewPanel,
  type AiDoctorPhase1PreviewMode,
} from "@/components/AiDoctorPhase1PreviewPanel";
import type { AiDoctorPhase1ViewModel } from "@/lib/aiDoctorPhase1ViewModel";

// ---------------------------------------------------------------------------
// Static local fixture — built inline, NOT via engine/compiler/confidence
// ---------------------------------------------------------------------------

const STATIC_FIXTURE: AiDoctorPhase1ViewModel = {
  summaryCard: {
    title: "AI Doctor — Phase 1 Preview",
    summary:
      "This is a static preview demonstrating the Phase 1 view model contract. No diagnosis was run to produce this output.",
    likely_issue: "N/A (static preview)",
    risk_level: "low",
    confidence_label: "Low confidence",
    confidence_score: 25,
    confidence_explanation:
      "Static fixture data only. No live or manual sensor readings, no recent grow events, and no visual context.",
    status_badges: [
      "Risk: low",
      "Confidence: low",
      "Sample data only",
      "Stale or invalid readings",
      "No trustworthy sensor data",
    ],
  },
  evidencePanel: {
    evidence_items: [
      "Demo temperature reading: 24 C",
      "Demo humidity reading: 55 %",
    ],
    context_items: [
      "Plant: demo-plant-1",
      "Strain: Demo Strain",
      "Stage: veg",
      "Recent grow events (14d): 0",
    ],
    source_quality_items: [
      "Demo readings (sample data, not real-time): 2",
      "Stale readings (not current): 1",
      "Invalid readings (rejected): 1",
    ],
    limitations: [
      "No live or manual sensor readings in the last 7 days.",
      "No grow events logged in the last 14 days.",
      "Only demo or imported (CSV) data is available — not real-time.",
      "Some readings are stale or invalid — not current and not reliable.",
      "Multiple key pieces of context are missing.",
    ],
  },
  missingInfoPanel: {
    has_missing_info: true,
    items: [
      "pH reading",
      "EC reading",
      "Soil moisture reading",
      "Recent photo",
      "Feeding history (last 14 days)",
    ],
    severity: "high",
  },
  recommendationsPanel: {
    immediate_action:
      "This is a static preview. In a real review, the AI Doctor would suggest collecting fresh readings and observations first.",
    what_not_to_do: [
      "Do not make changes based on this static preview alone.",
      "Avoid aggressive nutrient changes without fresh data.",
    ],
    twenty_four_hour_follow_up:
      "If this were a real diagnosis, re-check the plant and environment after 24 hours.",
    three_day_recovery_plan:
      "Stabilize environment over 3 days once trustworthy data is available.",
    monitoring_priorities: [
      "Capture fresh live or manual sensor readings.",
      "Log recent watering, feeding, or environment changes.",
      "Re-check sensors flagged as stale or invalid.",
      "Fill in missing information before re-running diagnosis.",
    ],
  },
  actionQueuePanel: {
    should_show: true,
    status: "pending_approval",
    action_type: "advisory",
    label: "Suggested advisory action",
    reason:
      "Consider collecting fresh readings. Advisory only. Grower approval is required before any change is made.",
    disabled_reason:
      "More context needed before turning this into an action.",
  },
  safetyPanel: {
    safety_flags: ["avoid_overdiagnosis", "weak_context", "static_preview"],
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
      invalid_count: 1,
      has_recent_trustworthy_sensor_data: false,
      has_recent_grow_events: false,
      has_visual_context: false,
    },
    has_live_data: false,
    has_manual_data: false,
    has_demo_or_csv_only: true,
    has_stale_or_invalid: true,
    generated_at: "2026-06-04T12:00:00.000Z",
    raw_confidence_level: "low",
    displayed_confidence_level: "low",
  },
};

export default function AiDoctorPhase1Preview(): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl p-4 space-y-6">
      <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
        <h1 className="text-lg font-semibold">Internal preview</h1>
        <p className="text-sm text-muted-foreground">
          Static demo data · No model calls · No database writes · No device
          control
        </p>
        <p className="text-xs text-muted-foreground">
          This preview renders a precomputed Phase 1 view model. It does not
          run diagnosis, score confidence, write alerts, or create Action Queue
          items.
        </p>
      </div>

      <AiDoctorPhase1PreviewPanel
        viewModel={STATIC_FIXTURE}
        title="AI Doctor Phase 1 — Static Preview"
        mode="internal"
      />
    </div>
  );
}
