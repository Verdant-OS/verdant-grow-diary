/**
 * AI Doctor Phase 1 Preview Fixtures.
 *
 * Static, precomputed AiDoctorPhase1ViewModel cases for the internal
 * /internal/ai-doctor-phase1-preview route.
 *
 * Hard rules:
 *   - Pure data. No Supabase, no model client, no Edge Functions, no fetch.
 *   - Does NOT import the engine, context compiler, or confidence adapter.
 *   - Each case is a complete, deterministic, presenter-ready view model.
 *   - Default case is conservative and low-confidence.
 *   - Weak-context cases include the overdiagnosis warning.
 *   - Demo/CSV/stale/invalid cases include the source-truth warning.
 *
 * These fixtures back the operator-facing case selector. They never
 * represent live diagnoses and must never be confused with real output.
 */
import type { AiDoctorPhase1ViewModel } from "@/lib/aiDoctorPhase1ViewModel";

export type AiDoctorPhase1PreviewSourceMode =
  | "demo"
  | "csv"
  | "stale"
  | "invalid"
  | "mixed"
  | "none";

export interface AiDoctorPhase1PreviewCase {
  id: string;
  label: string;
  description: string;
  sourceMode: AiDoctorPhase1PreviewSourceMode;
  viewModel: AiDoctorPhase1ViewModel;
}

// ---------------------------------------------------------------------------
// Shared safety copy
// ---------------------------------------------------------------------------

const OVERDIAGNOSIS_WARNING =
  "Context is limited — avoid treating this as a certain diagnosis. Confirm with fresh readings and observations.";
const SOURCE_TRUTH_DEMO_CSV =
  "Only demo or imported (CSV) data is available — not real-time sensor data.";
const SOURCE_TRUTH_STALE_INVALID =
  "Some readings are stale or invalid — not current and not reliable.";
const AUTOMATION_WARNING =
  "Verdant does not control equipment in this view. Any equipment change is up to the grower.";

interface BuildArgs {
  title: string;
  summary: string;
  likely_issue: string;
  confidence_score?: number;
  status_badges: string[];
  evidence_items: string[];
  context_items: string[];
  source_quality_items: string[];
  limitations: string[];
  missing_items: string[];
  missing_severity?: "none" | "low" | "medium" | "high";
  immediate_action: string;
  what_not_to_do: string[];
  monitoring_priorities: string[];
  twenty_four?: string;
  three_day?: string;
  advisory_label?: string;
  advisory_reason?: string;
  advisory_disabled?: string | null;
  safety_flags: string[];
  source_truth_warning?: string | null;
  source_counts: {
    live_count: number;
    manual_count: number;
    csv_count: number;
    demo_count: number;
    stale_count: number;
    invalid_count: number;
  };
  has_live_data?: boolean;
  has_manual_data?: boolean;
  has_demo_or_csv_only?: boolean;
  has_stale_or_invalid?: boolean;
  has_recent_grow_events?: boolean;
  has_visual_context?: boolean;
  generated_at: string;
}

function buildViewModel(a: BuildArgs): AiDoctorPhase1ViewModel {
  const counts = a.source_counts;
  const has_recent_trustworthy_sensor_data =
    (counts.live_count + counts.manual_count) > 0;
  return {
    summaryCard: {
      title: a.title,
      summary: a.summary,
      likely_issue: a.likely_issue,
      risk_level: "low",
      confidence_label: "Low confidence",
      confidence_score: a.confidence_score ?? 22,
      confidence_explanation:
        "Static fixture data only. Weak context — confidence intentionally low.",
      status_badges: a.status_badges,
    },
    evidencePanel: {
      evidence_items: a.evidence_items,
      context_items: a.context_items,
      source_quality_items: a.source_quality_items,
      limitations: a.limitations,
    },
    missingInfoPanel: {
      has_missing_info: a.missing_items.length > 0,
      items: a.missing_items,
      severity: a.missing_severity ?? "high",
    },
    recommendationsPanel: {
      immediate_action: a.immediate_action,
      what_not_to_do: a.what_not_to_do,
      twenty_four_hour_follow_up:
        a.twenty_four ??
        "Re-check the plant and environment in 24 hours after collecting fresh data.",
      three_day_recovery_plan:
        a.three_day ??
        "Stabilize environment over 3 days once trustworthy data is available.",
      monitoring_priorities: a.monitoring_priorities,
    },
    actionQueuePanel: {
      should_show: true,
      status: "pending_approval",
      action_type: "advisory",
      label: a.advisory_label ?? "Suggested advisory action",
      reason:
        a.advisory_reason ??
        "Advisory only. Grower approval is required before any change is made.",
      disabled_reason:
        a.advisory_disabled ??
        "More context needed before turning this into an action.",
    },
    safetyPanel: {
      safety_flags: a.safety_flags,
      overdiagnosis_warning: OVERDIAGNOSIS_WARNING,
      source_truth_warning:
        a.source_truth_warning === undefined ? null : a.source_truth_warning,
      automation_warning: AUTOMATION_WARNING,
    },
    debugMeta: {
      source_counts: {
        ...counts,
        has_recent_trustworthy_sensor_data,
        has_recent_grow_events: a.has_recent_grow_events ?? false,
        has_visual_context: a.has_visual_context ?? false,
      },
      has_live_data: a.has_live_data ?? false,
      has_manual_data: a.has_manual_data ?? false,
      has_demo_or_csv_only: a.has_demo_or_csv_only ?? false,
      has_stale_or_invalid: a.has_stale_or_invalid ?? false,
      generated_at: a.generated_at,
      raw_confidence_level: "low",
      displayed_confidence_level: "low",
    },
  };
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export const AI_DOCTOR_PHASE1_PREVIEW_CASES: AiDoctorPhase1PreviewCase[] = [
  {
    id: "blurry-photo-only",
    label: "Blurry photo only",
    description:
      "A single blurry photo with no sensor readings or grow events.",
    sourceMode: "none",
    viewModel: buildViewModel({
      title: "AI Doctor — Blurry photo only",
      summary:
        "Only a blurry photo is available. The image is not clear enough to support a confident diagnosis.",
      likely_issue: "Unclear — image quality is too low",
      status_badges: [
        "Risk: low",
        "Confidence: low",
        "Sample data only",
        "Weak visual context",
      ],
      evidence_items: ["One photo provided (blurry / out of focus)"],
      context_items: ["Plant: demo-plant", "Stage: veg"],
      source_quality_items: ["No live or manual readings", "Photo: low quality"],
      limitations: [
        "Photo is blurry — leaf detail, color, and texture cannot be assessed.",
        "No sensor readings, watering, or feeding history available.",
      ],
      missing_items: [
        "Sharp close-up photo",
        "pH reading",
        "EC reading",
        "Soil moisture reading",
        "Recent watering log",
      ],
      immediate_action:
        "Capture a sharp, well-lit close-up photo before any diagnosis.",
      what_not_to_do: [
        "Do not change feed or watering based on a blurry photo.",
        "Avoid aggressive interventions without clearer data.",
      ],
      monitoring_priorities: [
        "Take in-focus close-up photos of affected leaves.",
        "Add fresh sensor readings or manual measurements.",
      ],
      safety_flags: ["avoid_overdiagnosis", "weak_context", "weak_visual"],
      source_counts: { live_count: 0, manual_count: 0, csv_count: 0, demo_count: 0, stale_count: 0, invalid_count: 0 },
      has_visual_context: true,
      generated_at: "2026-06-04T12:00:00.000Z",
    }),
  },
  {
    id: "yellowing-no-history",
    label: "Yellowing — no pH/EC/watering/feed history",
    description:
      "Yellowing leaves reported without pH, EC, watering, or feeding history.",
    sourceMode: "none",
    viewModel: buildViewModel({
      title: "AI Doctor — Yellowing, no history",
      summary:
        "Yellowing observed, but with no pH, EC, watering, or feeding history the cause cannot be narrowed down.",
      likely_issue: "Possible nutrient or root-zone issue — cause unclear",
      status_badges: [
        "Risk: low",
        "Confidence: low",
        "Sample data only",
        "No feeding history",
      ],
      evidence_items: ["Reported yellowing on lower leaves"],
      context_items: ["Plant: demo-plant", "Stage: veg"],
      source_quality_items: ["No live or manual readings", "No watering or feeding log"],
      limitations: [
        "Yellowing has many possible causes (pH, EC, watering, light, deficiency).",
        "Without pH, EC, watering, or feeding history, no cause can be confirmed.",
      ],
      missing_items: [
        "pH reading",
        "EC reading",
        "Recent watering log",
        "Recent feeding log",
        "Soil moisture reading",
      ],
      immediate_action:
        "Collect a pH and EC reading and log recent watering/feeding before changing anything.",
      what_not_to_do: [
        "Do not adjust nutrients without pH/EC data.",
        "Do not assume a single deficiency from color alone.",
      ],
      monitoring_priorities: [
        "Log next watering with volume and runoff pH/EC.",
        "Log next feeding with strength and pH.",
      ],
      safety_flags: ["avoid_overdiagnosis", "weak_context", "missing_feed_history"],
      source_counts: { live_count: 0, manual_count: 0, csv_count: 0, demo_count: 0, stale_count: 0, invalid_count: 0 },
      generated_at: "2026-06-04T12:01:00.000Z",
    }),
  },
  {
    id: "drooping-no-rootzone",
    label: "Drooping — no watering/root-zone data",
    description:
      "Plant drooping with no watering history or root-zone data.",
    sourceMode: "none",
    viewModel: buildViewModel({
      title: "AI Doctor — Drooping, no root-zone data",
      summary:
        "Drooping reported without any watering history or root-zone data. Cause cannot be confirmed.",
      likely_issue: "Possible under- or over-watering — cause unclear",
      status_badges: [
        "Risk: low",
        "Confidence: low",
        "Sample data only",
        "No watering history",
      ],
      evidence_items: ["Reported drooping leaves"],
      context_items: ["Plant: demo-plant", "Stage: veg"],
      source_quality_items: [
        "No live or manual readings",
        "No soil moisture data",
        "No watering log",
      ],
      limitations: [
        "Drooping can come from too little OR too much water.",
        "Without root-zone moisture or watering history, the cause cannot be told apart.",
      ],
      missing_items: [
        "Soil moisture reading",
        "Recent watering log (volume, time)",
        "Pot weight check",
        "Runoff observation",
      ],
      immediate_action:
        "Check pot weight, soil moisture, and recent watering log before adjusting watering.",
      what_not_to_do: [
        "Do not water immediately without checking moisture.",
        "Do not assume drought based on droop alone.",
      ],
      monitoring_priorities: [
        "Log next watering and note pot weight before/after.",
        "Add a manual soil moisture reading.",
      ],
      safety_flags: ["avoid_overdiagnosis", "weak_context", "missing_root_zone"],
      source_counts: { live_count: 0, manual_count: 0, csv_count: 0, demo_count: 0, stale_count: 0, invalid_count: 0 },
      generated_at: "2026-06-04T12:02:00.000Z",
    }),
  },
  {
    id: "spotting-no-closeups",
    label: "Spotting — no pest inspection/closeups",
    description:
      "Leaf spotting reported without close-up photos or pest inspection.",
    sourceMode: "none",
    viewModel: buildViewModel({
      title: "AI Doctor — Leaf spotting, no closeups",
      summary:
        "Leaf spotting reported, but without close-up photos or a pest inspection the cause cannot be identified.",
      likely_issue: "Possible pest, deficiency, or pathogen — cause unclear",
      status_badges: [
        "Risk: low",
        "Confidence: low",
        "Sample data only",
        "No close-up inspection",
      ],
      evidence_items: ["Reported spotting on leaves"],
      context_items: ["Plant: demo-plant", "Stage: veg"],
      source_quality_items: [
        "No sharp close-up photos",
        "No pest inspection performed",
      ],
      limitations: [
        "Spotting can be pests, pathogens, deficiency, or burn.",
        "Without close-up photos and a pest inspection, no cause can be confirmed.",
      ],
      missing_items: [
        "Macro close-up photos of affected leaves",
        "Underside-of-leaf inspection",
        "Pest count or trap check",
        "Recent feeding log",
      ],
      immediate_action:
        "Take macro close-up photos (top and underside) and inspect for pests before any treatment.",
      what_not_to_do: [
        "Do not spray pesticides or fungicides without identification.",
        "Do not change feed based on spotting alone.",
      ],
      monitoring_priorities: [
        "Capture sharp close-ups of affected leaves (top and underside).",
        "Log pest inspection findings.",
      ],
      safety_flags: ["avoid_overdiagnosis", "weak_context", "missing_visual_detail"],
      has_visual_context: false,
      source_counts: { live_count: 0, manual_count: 0, csv_count: 0, demo_count: 0, stale_count: 0, invalid_count: 0 },
      generated_at: "2026-06-04T12:03:00.000Z",
    }),
  },
  {
    id: "stale-invalid-only",
    label: "Stale / invalid readings only",
    description:
      "Only stale or invalid sensor readings are available — not current and not reliable.",
    sourceMode: "stale",
    viewModel: buildViewModel({
      title: "AI Doctor — Stale / invalid readings only",
      summary:
        "Only stale or invalid sensor readings are available. These cannot be treated as current and cannot show plant health.",
      likely_issue: "Cannot be determined from stale or invalid data",
      status_badges: [
        "Risk: low",
        "Confidence: low",
        "Stale or invalid readings",
        "No trustworthy sensor data",
      ],
      evidence_items: [
        "Stale temperature reading (older than freshness window)",
        "Invalid humidity reading (out of valid range)",
      ],
      context_items: ["Plant: demo-plant", "Stage: veg"],
      source_quality_items: [
        "Stale readings (not current): 3",
        "Invalid readings (rejected): 2",
        "No live or manual readings",
      ],
      limitations: [
        "Stale readings do not represent current conditions.",
        "Invalid readings have been rejected as unreliable.",
        "Without trustworthy current data, plant health cannot be assessed.",
      ],
      missing_items: [
        "Current live or manual sensor reading",
        "Fresh pH/EC reading",
        "Recent photo",
      ],
      immediate_action:
        "Take a fresh manual reading or restore live sensor data before any diagnosis.",
      what_not_to_do: [
        "Do not treat stale data as current.",
        "Do not act on invalid readings.",
      ],
      monitoring_priorities: [
        "Re-check sensors flagged as stale or invalid.",
        "Add a fresh manual reading.",
      ],
      safety_flags: [
        "avoid_overdiagnosis",
        "weak_context",
        "stale_data",
        "invalid_data",
      ],
      source_truth_warning: SOURCE_TRUTH_STALE_INVALID,
      source_counts: { live_count: 0, manual_count: 0, csv_count: 0, demo_count: 0, stale_count: 3, invalid_count: 2 },
      has_stale_or_invalid: true,
      generated_at: "2026-06-04T12:04:00.000Z",
    }),
  },
  {
    id: "demo-csv-only",
    label: "Demo / CSV readings only",
    description:
      "Only demo or CSV-imported readings — not real-time live data.",
    sourceMode: "demo",
    viewModel: buildViewModel({
      title: "AI Doctor — Demo / CSV readings only",
      summary:
        "Only demo or CSV-imported readings are available. These are sample data, not real-time, and cannot be treated as live.",
      likely_issue: "Cannot be determined from sample data alone",
      status_badges: [
        "Risk: low",
        "Confidence: low",
        "Sample data only",
        "Not real-time",
      ],
      evidence_items: [
        "Demo temperature reading: 24 C",
        "CSV-imported humidity reading: 55 %",
      ],
      context_items: ["Plant: demo-plant", "Stage: veg"],
      source_quality_items: [
        "Demo readings (sample data, not real-time): 2",
        "CSV-imported readings (not live): 3",
        "No live or manual readings",
      ],
      limitations: [
        "Demo and CSV readings are sample data, not real-time.",
        "Without live or manual readings, current conditions are unknown.",
      ],
      missing_items: [
        "Live sensor reading",
        "Recent manual reading",
        "Recent photo",
      ],
      immediate_action:
        "Connect a live source or take a manual reading before any diagnosis.",
      what_not_to_do: [
        "Do not treat demo or CSV data as live.",
        "Do not make changes based on sample data alone.",
      ],
      monitoring_priorities: [
        "Add a live or manual reading.",
        "Confirm imported CSV data is labeled correctly.",
      ],
      safety_flags: ["avoid_overdiagnosis", "weak_context", "demo_or_csv_only"],
      source_truth_warning: SOURCE_TRUTH_DEMO_CSV,
      source_counts: { live_count: 0, manual_count: 0, csv_count: 3, demo_count: 2, stale_count: 0, invalid_count: 0 },
      has_demo_or_csv_only: true,
      generated_at: "2026-06-04T12:05:00.000Z",
    }),
  },
  {
    id: "conflicting-weak-signals",
    label: "Conflicting weak signals",
    description:
      "Weak signals that conflict with one another — no clear single cause.",
    sourceMode: "mixed",
    viewModel: buildViewModel({
      title: "AI Doctor — Conflicting weak signals",
      summary:
        "Available signals point in different directions and are individually weak. No single cause can be confirmed.",
      likely_issue: "Multiple possible causes — none confirmed",
      status_badges: [
        "Risk: low",
        "Confidence: low",
        "Conflicting signals",
        "Sample data only",
      ],
      evidence_items: [
        "Slight yellowing on lower leaves (one photo)",
        "Demo soil moisture: borderline dry",
        "CSV-imported humidity: borderline high",
      ],
      context_items: ["Plant: demo-plant", "Stage: veg"],
      source_quality_items: [
        "Demo readings: 1",
        "CSV-imported readings: 1",
        "Stale readings: 1",
        "No live or manual readings",
      ],
      limitations: [
        "Signals conflict (suggesting both dryness and high humidity).",
        "Each signal is individually weak or from non-live sources.",
        "No single explanation fits all observations.",
      ],
      missing_items: [
        "Fresh live or manual sensor reading",
        "Recent watering log",
        "Sharp close-up photo",
        "pH/EC reading",
      ],
      immediate_action:
        "Collect a fresh live or manual reading and a sharp photo before acting on any single signal.",
      what_not_to_do: [
        "Do not act on a single conflicting signal.",
        "Do not change multiple variables at once.",
      ],
      monitoring_priorities: [
        "Add a fresh live or manual reading.",
        "Capture a sharp close-up photo.",
        "Log next watering and feeding.",
      ],
      safety_flags: [
        "avoid_overdiagnosis",
        "weak_context",
        "conflicting_signals",
      ],
      source_truth_warning: `${SOURCE_TRUTH_DEMO_CSV} ${SOURCE_TRUTH_STALE_INVALID}`,
      source_counts: { live_count: 0, manual_count: 0, csv_count: 1, demo_count: 1, stale_count: 1, invalid_count: 0 },
      has_demo_or_csv_only: false,
      has_stale_or_invalid: true,
      has_visual_context: true,
      generated_at: "2026-06-04T12:06:00.000Z",
    }),
  },
];

export const AI_DOCTOR_PHASE1_PREVIEW_DEFAULT_CASE_ID =
  AI_DOCTOR_PHASE1_PREVIEW_CASES[0].id;

export function getAiDoctorPhase1PreviewCase(
  id: string,
): AiDoctorPhase1PreviewCase {
  return (
    AI_DOCTOR_PHASE1_PREVIEW_CASES.find((c) => c.id === id) ??
    AI_DOCTOR_PHASE1_PREVIEW_CASES[0]
  );
}
