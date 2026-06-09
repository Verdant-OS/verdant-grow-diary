/**
 * Sensor Truth Audit View Model.
 *
 * Pure, deterministic reference presenter for Verdant's sensor source labels,
 * suspicious data rules, and no-fake-live safety expectations.
 *
 * Hard rules:
 *   - Pure data. No Supabase, no fetch, no model calls, no Edge Functions.
 *   - No `Date.now()`. Timestamp comes from injected `now` or a stable default.
 *   - Stable ordering. Arrays are produced in a fixed order.
 *   - Freeze output if project style supports it.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SensorTruthSourceLabel =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

export interface SensorTruthSourceRule {
  label: SensorTruthSourceLabel;
  meaning: string;
  allowed_use: string;
  confidence_impact: string;
  ui_label_requirement: string;
  safety_notes: string;
}

export interface SensorTruthSuspiciousCheck {
  id: string;
  label: string;
  description: string;
  why_it_matters: string;
  expected_handling: string;
}

export interface SensorTruthAuditViewModel {
  title: string;
  subtitle: string;
  badges: string[];
  source_rules: SensorTruthSourceRule[];
  suspicious_checks: SensorTruthSuspiciousCheck[];
  core_warnings: string[];
  blocked_live_data_note: string;
  validation_notes: string[];
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

const CORE_WARNINGS: readonly string[] = [
  "Demo data must never be shown as live.",
  "CSV/imported data must never be shown as live.",
  "Stale readings must never be described as current.",
  "Invalid readings must never be described as healthy.",
  "Bad or unknown telemetry is worse than no telemetry.",
  "AI Doctor confidence must not increase from demo, stale, or invalid data.",
  "Alerts must not be created from invalid telemetry without clear limitation labels.",
  "Action Queue items must not be created automatically from suspicious readings.",
  "No device control should be triggered from unverified telemetry.",
];

const VALIDATION_NOTES: readonly string[] = [
  "Sensor truth rules are enforced by UI labeling, not schema constraints alone.",
  "Every reading should carry source, captured_at, confidence, and raw_payload when available.",
  "Live validation against the physical tent/controller display is required before marking source=live.",
];

const BLOCKED_LIVE_DATA_NOTE =
  "Real EcoWitt/MQTT live-data validation is blocked until actual tent readings are available and can be compared against the controller/app display. Do not use ghost/default/demo numbers to prove the live loop.";

interface SourceRuleSeed {
  label: SensorTruthSourceLabel;
  meaning: string;
  allowed_use: string;
  confidence_impact: string;
  ui_label_requirement: string;
  safety_notes: string;
}

const SOURCE_RULE_SEEDS: readonly SourceRuleSeed[] = [
  {
    label: "live",
    meaning: "Real connected sensor data with trustworthy timestamp and source.",
    allowed_use: "Full context for AI Doctor, alerts, and grower decisions.",
    confidence_impact: "Increases confidence when combined with recent history.",
    ui_label_requirement: "Must show 'Live' with captured_at and source name.",
    safety_notes: "Only label live when the reading was verified against the physical sensor or controller display.",
  },
  {
    label: "manual",
    meaning: "Grower-entered reading; useful but not automated.",
    allowed_use: "Historical context and gap-filling between automated readings.",
    confidence_impact: "Neutral; depends on grower accuracy and timing.",
    ui_label_requirement: "Must show 'Manual' with entry timestamp.",
    safety_notes: "Do not treat manual as live automation. Manual entries can be wrong or mistimed.",
  },
  {
    label: "csv",
    meaning: "Imported or historical data from a CSV or batch import.",
    allowed_use: "Historical context, post-grow analysis, and trend backfill.",
    confidence_impact: "Low for current decisions; useful for long-term patterns only.",
    ui_label_requirement: "Must show 'CSV' or 'Imported' with original timestamp.",
    safety_notes: "Never treat imported data as live. CSV rows may be stale, duplicated, or misaligned with current conditions.",
  },
  {
    label: "demo",
    meaning: "Sample or synthetic data for onboarding, preview, or testing.",
    allowed_use: "UI demonstration, onboarding, and test environments only.",
    confidence_impact: "Zero. Demo data must not affect AI Doctor confidence or alert thresholds.",
    ui_label_requirement: "Must show 'Demo' prominently on every related card and chart.",
    safety_notes: "Demo data must never be shown as live. Demo must not trigger alerts or Action Queue items.",
  },
  {
    label: "stale",
    meaning: "Old reading that has exceeded freshness thresholds.",
    allowed_use: "Historical context only. Do not use for present-state decisions.",
    confidence_impact: "Decreases confidence. Stale data is a limitation, not current truth.",
    ui_label_requirement: "Must show 'Stale' with the original captured_at and an age warning.",
    safety_notes: "Never describe stale as current. A reading from yesterday is not today's environment.",
  },
  {
    label: "invalid",
    meaning: "Malformed, suspicious, or out-of-range reading.",
    allowed_use: "Flagged for review. May inform sensor maintenance or placement issues.",
    confidence_impact: "Zero or negative. Invalid data reduces trust in the sensor stream.",
    ui_label_requirement: "Must show 'Invalid' with a reason or fallback warning.",
    safety_notes: "Never describe invalid as healthy. Invalid telemetry is worse than no telemetry.",
  },
];

interface SuspiciousCheckSeed {
  id: string;
  label: string;
  description: string;
  why_it_matters: string;
  expected_handling: string;
}

const SUSPICIOUS_CHECK_SEEDS: readonly SuspiciousCheckSeed[] = [
  {
    id: "celsius-as-fahrenheit",
    label: "Celsius shown as Fahrenheit",
    description: "A value that looks like Celsius (e.g., 25) is labeled or interpreted as Fahrenheit, producing an implausible temperature.",
    why_it_matters: "Temperature errors cascade into VPD, humidity targets, and AI Doctor context. A 25 C room labeled as 25 F looks like a freezer.",
    expected_handling: "Flag the reading as invalid. Require source verification or manual correction before using in alerts or AI context.",
  },
  {
    id: "us-cm-as-ms-cm",
    label: "µS/cm shown as mS/cm",
    description: "Electrical conductivity is off by a factor of 1000 due to unit confusion between microsiemens and millisiemens per centimeter.",
    why_it_matters: "EC errors mislead feeding decisions. 1200 µS/cm is moderate; 1200 mS/cm is impossibly high and would suggest lethal salinity.",
    expected_handling: "Flag the reading as invalid. Normalize to µS/cm with source documentation before use.",
  },
  {
    id: "humidity-stuck-at-0-or-100",
    label: "Humidity stuck at 0 or 100",
    description: "Relative humidity reads exactly 0% or 100% for an extended period, which is physically unlikely in a typical grow environment.",
    why_it_matters: "Stuck sensors produce false alerts and bad VPD calculations. 0% suggests a dead sensor; 100% suggests condensation or sensor failure.",
    expected_handling: "Flag as invalid if the value persists across multiple reads. Prompt sensor check or recalibration.",
  },
  {
    id: "soil-moisture-stuck-at-0-or-100",
    label: "Soil moisture stuck at 0 or 100",
    description: "Soil moisture reads exactly 0% or 100% for an extended period, suggesting a disconnected or saturated sensor.",
    why_it_matters: "Watering decisions depend on soil moisture. A stuck sensor can cause overwatering or underwatering if trusted blindly.",
    expected_handling: "Flag as invalid if the value persists. Recommend physical inspection of the probe and pot.",
  },
  {
    id: "ph-outside-realistic-range",
    label: "pH outside realistic range",
    description: "pH reads below 3.0 or above 10.0, which is outside the plausible range for typical grow reservoirs or soil.",
    why_it_matters: "Extreme pH values break nutrient uptake models and can trigger unsafe automated dosing recommendations.",
    expected_handling: "Flag as invalid. Do not suggest nutrient changes from a single extreme pH reading. Recalibrate the probe.",
  },
  {
    id: "old-readings-as-current",
    label: "Old readings shown as current",
    description: "A reading with an old captured_at is rendered or treated as the current environment state.",
    why_it_matters: "Old data misrepresents the current grow conditions. Decisions based on yesterday's temperature are not safe.",
    expected_handling: "Label as stale. Do not use for real-time alerts or immediate action recommendations.",
  },
];

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

function normalizeGeneratedAt(now?: string | Date): string {
  if (now === undefined || now === null) return DEFAULT_GENERATED_AT;
  if (now instanceof Date) {
    if (Number.isNaN(now.getTime())) return DEFAULT_GENERATED_AT;
    return now.toISOString();
  }
  if (typeof now === "string" && now.length > 0) {
    const parsed = new Date(now);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return DEFAULT_GENERATED_AT;
}

function buildSourceRule(seed: SourceRuleSeed): SensorTruthSourceRule {
  return Object.freeze({
    label: seed.label,
    meaning: seed.meaning,
    allowed_use: seed.allowed_use,
    confidence_impact: seed.confidence_impact,
    ui_label_requirement: seed.ui_label_requirement,
    safety_notes: seed.safety_notes,
  }) as SensorTruthSourceRule;
}

function buildSuspiciousCheck(seed: SuspiciousCheckSeed): SensorTruthSuspiciousCheck {
  return Object.freeze({
    id: seed.id,
    label: seed.label,
    description: seed.description,
    why_it_matters: seed.why_it_matters,
    expected_handling: seed.expected_handling,
  }) as SensorTruthSuspiciousCheck;
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Pure deterministic builder. Same `now` → same output.
 */
export function buildSensorTruthAuditViewModel(
  now?: string | Date,
): SensorTruthAuditViewModel {
  const source_rules = SOURCE_RULE_SEEDS.map(buildSourceRule);
  const suspicious_checks = SUSPICIOUS_CHECK_SEEDS.map(buildSuspiciousCheck);

  const vm: SensorTruthAuditViewModel = {
    title: "Sensor Truth Audit",
    subtitle:
      "Internal audit of sensor source labels, suspicious data rules, and no-fake-live safety expectations before live EcoWitt/MQTT validation.",
    badges: Object.freeze([...BADGES]) as unknown as string[],
    source_rules: Object.freeze(source_rules) as unknown as SensorTruthSourceRule[],
    suspicious_checks: Object.freeze(suspicious_checks) as unknown as SensorTruthSuspiciousCheck[],
    core_warnings: Object.freeze([...CORE_WARNINGS]) as unknown as string[],
    blocked_live_data_note: BLOCKED_LIVE_DATA_NOTE,
    validation_notes: Object.freeze([...VALIDATION_NOTES]) as unknown as string[],
    generated_at: normalizeGeneratedAt(now),
  };

  return Object.freeze(vm) as SensorTruthAuditViewModel;
}

/** Canonical source label order — exported for tests and consumers. */
export const SENSOR_TRUTH_SOURCE_LABEL_ORDER: readonly SensorTruthSourceLabel[] =
  SOURCE_RULE_SEEDS.map((s) => s.label);

/** Canonical suspicious check IDs — exported for tests and consumers. */
export const SENSOR_TRUTH_SUSPICIOUS_CHECK_IDS: readonly string[] =
  SUSPICIOUS_CHECK_SEEDS.map((s) => s.id);
