/**
 * AI Doctor Confidence Audit View Model.
 *
 * Pure, deterministic reference presenter for how demo, CSV, stale, invalid,
 * weak, and trustworthy context affect AI Doctor confidence scoring.
 *
 * Hard rules:
 *   - Pure data. No Supabase, no fetch, no model calls, no Edge Functions.
 *   - No `Date.now()`. Timestamp comes from injected `now` or a stable default.
 *   - Stable ordering. Arrays are produced in a fixed order.
 *   - Frozen output for immutability.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AiDoctorConfidenceAuditRule {
  id: string;
  label: string;
  data_condition: string;
  confidence_effect: string;
  hard_cap: number | null;
  required_warning: string | null;
  why_it_matters: string;
  expected_ui_behavior: string;
}

export interface AiDoctorConfidenceHardCap {
  id: string;
  label: string;
  max_score: number;
  condition: string;
  reason: string;
}

export interface AiDoctorConfidenceAuditViewModel {
  title: string;
  subtitle: string;
  badges: readonly string[];
  rules: readonly AiDoctorConfidenceAuditRule[];
  hard_caps: readonly AiDoctorConfidenceHardCap[];
  high_confidence_requirements: readonly string[];
  source_quality_notes: readonly string[];
  safety_flags: readonly string[];
  forbidden_behavior: readonly string[];
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_GENERATED_AT = "2026-06-09T00:00:00.000Z";

const BADGES: readonly string[] = [
  "Internal audit",
  "Static reference",
  "No live data queries",
  "No database writes",
  "No model calls",
  "No device control",
];

export const AI_DOCTOR_CONFIDENCE_RULE_IDS: readonly string[] = [
  "live-or-manual-recent-sensor-data",
  "recent-grow-events",
  "useful-visual-context",
  "limited-missing-information",
  "no-trustworthy-sensor-data",
  "no-recent-grow-events",
  "demo-only-or-csv-only-context",
  "stale-only-or-invalid-only-context",
  "stale-or-invalid-alongside-other-data",
  "major-missing-information",
  "poor-visual-quality-with-weak-context",
  "conflicting-weak-signals",
];

const RULES: readonly AiDoctorConfidenceAuditRule[] = [
  {
    id: "live-or-manual-recent-sensor-data",
    label: "Recent live or manual sensor readings",
    data_condition:
      "Trustworthy sensor data labeled live or manual, captured recently for the relevant tent or plant.",
    confidence_effect: "Supports higher confidence when paired with other signals.",
    hard_cap: null,
    required_warning: null,
    why_it_matters:
      "Recent trustworthy environment data anchors any diagnosis to real conditions.",
    expected_ui_behavior:
      "Show source labels (live or manual) and capture timestamps next to readings.",
  },
  {
    id: "recent-grow-events",
    label: "Recent grow events present",
    data_condition:
      "Recent diary entries, watering, feeding, or stage notes in the relevant time window.",
    confidence_effect: "Supports higher confidence about cause and timing.",
    hard_cap: null,
    required_warning: null,
    why_it_matters:
      "Grow history explains what changed recently and rules out spurious causes.",
    expected_ui_behavior:
      "Reference the specific recent events in the evidence section.",
  },
  {
    id: "useful-visual-context",
    label: "Useful visual context available",
    data_condition:
      "Clear, in-focus photo of the affected area, ideally with closeups.",
    confidence_effect: "Supports higher confidence about visible symptoms.",
    hard_cap: null,
    required_warning: null,
    why_it_matters:
      "A clear photo materially improves visual triage compared to blurry or distant shots.",
    expected_ui_behavior:
      "Reference which photo or closeups informed the visual assessment.",
  },
  {
    id: "limited-missing-information",
    label: "Limited missing information",
    data_condition:
      "Most relevant context fields are present: stage, medium, pot size, recent watering or feeding.",
    confidence_effect: "Supports higher confidence by reducing guesswork.",
    hard_cap: null,
    required_warning: null,
    why_it_matters:
      "Fewer unknowns means fewer alternative explanations the diagnosis must hedge against.",
    expected_ui_behavior:
      "List remaining unknowns explicitly in the missing-information section.",
  },
  {
    id: "no-trustworthy-sensor-data",
    label: "No trustworthy sensor data",
    data_condition:
      "No recent live or manual readings for the relevant tent or plant.",
    confidence_effect:
      "Confidence must be lowered. Combined with no recent grow events, a hard cap applies.",
    hard_cap: 35,
    required_warning:
      "No trustworthy sensor data — environmental conditions are unverified.",
    why_it_matters:
      "Without environment data, the diagnosis cannot anchor to real conditions.",
    expected_ui_behavior:
      "Show a clear limitation banner and lower the rendered confidence band.",
  },
  {
    id: "no-recent-grow-events",
    label: "No recent grow events",
    data_condition:
      "No recent diary, watering, feeding, or stage notes in the relevant window.",
    confidence_effect: "Confidence must be lowered.",
    hard_cap: null,
    required_warning:
      "No recent grow events — recent care history is unknown.",
    why_it_matters:
      "Without recent events, the diagnosis cannot anchor cause and timing.",
    expected_ui_behavior:
      "Show a missing-history limitation and ask the grower for a recent log.",
  },
  {
    id: "demo-only-or-csv-only-context",
    label: "Demo-only or CSV-only context",
    data_condition:
      "The only available readings are demo fixtures or historical CSV imports.",
    confidence_effect:
      "Confidence must not be raised by these sources. A hard cap applies.",
    hard_cap: 40,
    required_warning:
      "Demo or CSV-only data — not live evidence of current conditions.",
    why_it_matters:
      "Demo data is illustrative. CSV is historical import context, never a live signal.",
    expected_ui_behavior:
      "Show explicit demo or CSV labels and treat as background context only.",
  },
  {
    id: "stale-only-or-invalid-only-context",
    label: "Stale-only or invalid-only context",
    data_condition:
      "The only available readings are stale (out of date) or invalid (malformed or out of range).",
    confidence_effect: "Confidence must be lowered. A hard cap applies.",
    hard_cap: 30,
    required_warning:
      "Only stale or invalid readings available — current conditions are unknown.",
    why_it_matters:
      "Bad or unknown telemetry is worse than no telemetry. It must never read as healthy.",
    expected_ui_behavior:
      "Show stale or invalid badges. Do not render a healthy summary.",
  },
  {
    id: "stale-or-invalid-alongside-other-data",
    label: "Stale or invalid readings alongside other data",
    data_condition:
      "Some readings are stale or invalid even though other trustworthy signals exist.",
    confidence_effect:
      "Confidence must be lowered for the affected dimensions and limitations called out.",
    hard_cap: null,
    required_warning:
      "Some readings are stale or invalid — exclude them from the assessment.",
    why_it_matters:
      "Mixing trustworthy and untrustworthy readings without labels misleads the grower.",
    expected_ui_behavior:
      "Tag stale or invalid readings inline. Exclude them from the evidence cited.",
  },
  {
    id: "major-missing-information",
    label: "Major missing information",
    data_condition:
      "Critical context is missing: stage, medium, pot size, recent watering, or recent feeding.",
    confidence_effect: "Confidence must be lowered. A hard cap applies.",
    hard_cap: 45,
    required_warning:
      "Major missing information — diagnosis is partial until context is added.",
    why_it_matters:
      "Without critical context, alternative causes cannot be ruled out.",
    expected_ui_behavior:
      "List the missing fields and ask the grower to add them.",
  },
  {
    id: "poor-visual-quality-with-weak-context",
    label: "Poor visual quality with weak context",
    data_condition:
      "The only photo is blurry, dark, distant, or otherwise low quality, and other context is weak.",
    confidence_effect: "Confidence must be lowered. A hard cap applies.",
    hard_cap: 35,
    required_warning:
      "Photo quality is poor — visual assessment is limited.",
    why_it_matters:
      "A blurry or unclear photo can suggest symptoms that are not actually present.",
    expected_ui_behavior:
      "Ask the grower for a clearer closeup and avoid overdiagnosis.",
  },
  {
    id: "conflicting-weak-signals",
    label: "Conflicting weak signals",
    data_condition:
      "Available signals point in different directions and none are strong on their own.",
    confidence_effect:
      "Confidence must be lowered. The summary must enumerate the conflicting possibilities.",
    hard_cap: null,
    required_warning:
      "Signals are weak and conflicting — multiple possible causes remain.",
    why_it_matters:
      "Picking one cause from conflicting weak signals creates false certainty.",
    expected_ui_behavior:
      "Show possible causes side by side. Avoid overdiagnosis.",
  },
];

const HARD_CAPS: readonly AiDoctorConfidenceHardCap[] = [
  {
    id: "no-trustworthy-sensors-no-events",
    label: "No trustworthy sensors and no recent events",
    max_score: 35,
    condition:
      "There is no recent trustworthy sensor data and no recent grow events.",
    reason:
      "Both anchor surfaces are missing. The diagnosis cannot be highly confident.",
  },
  {
    id: "stale-or-invalid-only",
    label: "Stale or invalid readings only",
    max_score: 30,
    condition:
      "The only available readings are stale or invalid.",
    reason:
      "Bad or unknown telemetry must never raise confidence.",
  },
  {
    id: "demo-or-csv-only",
    label: "Demo or CSV-only data",
    max_score: 40,
    condition:
      "The only available context is demo fixtures or historical CSV imports.",
    reason:
      "Demo is illustrative. CSV is historical import context, never a live signal.",
  },
  {
    id: "major-missing-information",
    label: "Major missing information",
    max_score: 45,
    condition:
      "Critical context such as stage, medium, pot size, or recent watering is missing.",
    reason:
      "Without critical context, the diagnosis cannot rule out alternative causes.",
  },
  {
    id: "poor-visual-quality-weak-context",
    label: "Poor visual quality plus weak context",
    max_score: 35,
    condition:
      "The only photo is low quality and supporting context is weak.",
    reason:
      "A blurry photo with weak context is a high-risk surface for overdiagnosis.",
  },
];

const HIGH_CONFIDENCE_REQUIREMENTS: readonly string[] = [
  "Recent live or manual trustworthy sensor data for the relevant tent or plant.",
  "Recent grow events such as watering, feeding, or stage notes.",
  "Useful visual context, ideally a clear closeup of the affected area.",
  "Limited missing information across stage, medium, pot size, and recent care.",
];

const SOURCE_QUALITY_NOTES: readonly string[] = [
  "Demo data must never raise confidence.",
  "CSV data is historical import context, not live confidence support.",
  "Stale readings must lower confidence or create explicit limitations.",
  "Invalid readings must lower confidence or create explicit limitations.",
  "High confidence is blocked unless the trustworthy quartet is present.",
  "Bad or unknown telemetry is worse than no telemetry and must never read as healthy.",
];

const SAFETY_FLAGS: readonly string[] = [
  "weak_context",
  "no_trustworthy_sensor_data",
  "no_recent_grow_events",
  "demo_or_csv_only",
  "stale_or_invalid_readings_present",
  "poor_visual_quality",
  "major_missing_information",
  "avoid_overdiagnosis",
];

const FORBIDDEN_BEHAVIOR: readonly string[] = [
  "Diagnosing with false certainty from a single photo.",
  "Treating demo or CSV context as live evidence.",
  "Reporting stale or invalid readings as healthy.",
  "Raising confidence when the trustworthy quartet is incomplete.",
  "Recommending aggressive nutrient, irrigation, or equipment changes from weak evidence.",
  "Auto-creating Action Queue items without grower approval.",
  "Triggering device control from AI Doctor output.",
];

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function normalizeNow(now?: string | Date): string {
  if (!now) return DEFAULT_GENERATED_AT;
  if (now instanceof Date) {
    const t = now.getTime();
    if (Number.isNaN(t)) return DEFAULT_GENERATED_AT;
    return now.toISOString();
  }
  if (typeof now === "string" && now.length > 0) return now;
  return DEFAULT_GENERATED_AT;
}

export function buildAiDoctorConfidenceAuditViewModel(
  now?: string | Date,
): AiDoctorConfidenceAuditViewModel {
  const vm: AiDoctorConfidenceAuditViewModel = {
    title: "AI Doctor Confidence Audit",
    subtitle:
      "Static reference for how source quality and missing context shape AI Doctor confidence.",
    badges: Object.freeze([...BADGES]),
    rules: Object.freeze(RULES.map((r) => Object.freeze({ ...r }))),
    hard_caps: Object.freeze(HARD_CAPS.map((c) => Object.freeze({ ...c }))),
    high_confidence_requirements: Object.freeze([
      ...HIGH_CONFIDENCE_REQUIREMENTS,
    ]),
    source_quality_notes: Object.freeze([...SOURCE_QUALITY_NOTES]),
    safety_flags: Object.freeze([...SAFETY_FLAGS]),
    forbidden_behavior: Object.freeze([...FORBIDDEN_BEHAVIOR]),
    generated_at: normalizeNow(now),
  };
  return Object.freeze(vm);
}
