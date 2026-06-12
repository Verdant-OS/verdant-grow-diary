/**
 * AI Doctor Safety Rules (Phase 1).
 *
 * Pure, deterministic guardrails applied on top of any draft AI Doctor
 * result. These rules exist so a future model wiring cannot bypass our
 * cautious-by-default product stance.
 *
 * Rules:
 *   - Reject diagnosis confidence above "medium" if only one weak signal exists.
 *   - If no recent sensor data exists, include missing_information.
 *   - If stale/invalid telemetry exists, flag it as a limitation.
 *   - For autoflowers, block heavy-stress recovery advice
 *     (heavy defoliation, transplant, high-stress training, aggressive flushing).
 *   - Never suggest device control, executable commands, or automation.
 *   - Never recommend aggressive nutrient/irrigation/equipment changes
 *     from environment-only evidence.
 *
 * No I/O. No Supabase. No model calls. No Action Queue writes.
 */

import type {
  PlantContextPayload as AiDoctorContext,
  SensorSourceTag,
} from "./aiDoctorContextCompiler";

export type AiDoctorRiskLevel = "low" | "medium" | "high";
export type AiDoctorConfidenceBand = "low" | "medium" | "high";

export interface AiDoctorActionQueueSuggestion {
  /** Always advisory in Phase 1 — never executable. */
  action_type: "advisory";
  /** Approval-required. Action Queue stays approval-gated. */
  status: "pending_approval";
  reason: string;
  risk_level: AiDoctorRiskLevel;
}

/** Public result shape for `generateAiDoctorResult`. */
export interface AiDoctorResult {
  summary: string;
  likely_issue: string;
  /** 0..1 calibrated confidence; safety rules cap this. */
  confidence: number;
  confidence_band: AiDoctorConfidenceBand;
  evidence: readonly string[];
  missing_information: readonly string[];
  possible_causes: readonly string[];
  immediate_action: string;
  what_not_to_do: readonly string[];
  follow_up_24h: string;
  recovery_plan_3_day: string;
  risk_level: AiDoctorRiskLevel;
  action_queue_suggestion: AiDoctorActionQueueSuggestion | null;
  /** Names of safety rules that fired, useful for audit + tests. */
  applied_safety_rules: readonly string[];
}

const TRUSTWORTHY: ReadonlySet<SensorSourceTag> = new Set<SensorSourceTag>([
  "live",
  "manual",
]);

export const NEVER_DO_BASELINE: readonly string[] = Object.freeze([
  "Do not adjust nutrient strength based on this output.",
  "Do not change irrigation schedule based on this output.",
  "Do not change equipment (lights, fans, heaters, humidifiers, pumps) based on this output.",
  "Do not treat stale, invalid, or demo sensor readings as current truth.",
  "Do not execute any device commands or trigger automation from this output.",
]);

export const AUTOFLOWER_NEVER_DO: readonly string[] = Object.freeze([
  "Do not heavily defoliate this autoflower.",
  "Do not transplant this autoflower based on this output.",
  "Do not apply high-stress training (topping, FIM, severe LST) on this autoflower.",
  "Do not perform an aggressive flush on this autoflower.",
]);

/** Heuristic: name/strain contains "auto" → treat as autoflower. */
export function isLikelyAutoflower(context: AiDoctorContext): boolean {
  const blob = `${context.strain ?? ""} ${context.plant_name ?? ""}`.toLowerCase();
  return /\bauto(flower)?s?\b|auto$/.test(blob) || blob.includes("autoflower");
}

export interface ContextStrength {
  trustworthySensorReadings: number;
  hasTrustworthySensors: boolean;
  hasRecentEvents: boolean;
  hasStaleOrInvalid: boolean;
  hasDemoOnly: boolean;
  hasAnySensors: boolean;
  /** Count of independent evidence signals (sensors + events + deviations). */
  evidenceSignals: number;
}

export function assessContextStrength(
  context: AiDoctorContext,
): ContextStrength {
  const trustworthyGroups = context.sensor_groups.filter((g) =>
    TRUSTWORTHY.has(g.source),
  );
  const trustworthySensorReadings = trustworthyGroups.reduce(
    (n, g) => n + g.sample_count,
    0,
  );
  const hasTrustworthySensors = trustworthySensorReadings > 0;
  const hasRecentEvents = context.recent_grow_events.length > 0;
  const hasStaleOrInvalid = context.sensor_groups.some(
    (g) => g.source === "stale" || g.source === "invalid",
  );
  const hasAnySensors = context.sensor_groups.length > 0;
  const hasDemoOnly =
    !hasTrustworthySensors &&
    context.sensor_groups.some((g) => g.source === "demo");

  let signals = 0;
  if (hasTrustworthySensors) signals += 1;
  if (hasRecentEvents) signals += 1;
  if (context.notable_deviations.length > 0) signals += 1;

  return {
    trustworthySensorReadings,
    hasTrustworthySensors,
    hasRecentEvents,
    hasStaleOrInvalid,
    hasDemoOnly,
    hasAnySensors,
    evidenceSignals: signals,
  };
}

export function bandForConfidence(c: number): AiDoctorConfidenceBand {
  if (c >= 0.7) return "high";
  if (c >= 0.4) return "medium";
  return "low";
}

/** Draft (pre-safety) shape used internally by the engine. */
export interface AiDoctorDraft {
  summary: string;
  likely_issue: string;
  confidence: number;
  evidence: readonly string[];
  missing_information: readonly string[];
  possible_causes: readonly string[];
  immediate_action: string;
  what_not_to_do: readonly string[];
  follow_up_24h: string;
  recovery_plan_3_day: string;
  risk_level: AiDoctorRiskLevel;
  action_queue_suggestion: AiDoctorActionQueueSuggestion | null;
}

const DEVICE_COMMAND_PATTERNS: readonly RegExp[] = [
  /\bturn (on|off)\b/i,
  /\bpower (on|off)\b/i,
  /\bactivate\b/i,
  /\btrigger\b/i,
  /\bautomat(e|ion)\b/i,
  /\bexecute\b/i,
  /\brun (the )?(pump|fan|light|heater|dehumidifier|humidifier)\b/i,
];

function stripDeviceCommands(items: readonly string[]): string[] {
  return items.filter(
    (s) => !DEVICE_COMMAND_PATTERNS.some((rx) => rx.test(s)),
  );
}

/**
 * Apply Phase 1 safety rules to a draft result and return the final
 * `AiDoctorResult`. Pure and deterministic.
 */
export function applyAiDoctorSafetyRules(
  draft: AiDoctorDraft,
  context: AiDoctorContext,
): AiDoctorResult {
  const strength = assessContextStrength(context);
  const applied: string[] = [];

  // ---- evidence / missing info enrichment ----
  const missing = new Set<string>(draft.missing_information);
  if (!strength.hasTrustworthySensors) {
    missing.add("No live or manual sensor readings in the last 7 days.");
    applied.push("missing_information_when_no_recent_sensor_data");
  }
  if (strength.hasStaleOrInvalid) {
    missing.add(
      "Some recent sensor readings are stale or invalid — fresh confirmation needed.",
    );
    applied.push("flag_stale_or_invalid_telemetry");
  }
  if (strength.hasDemoOnly) {
    missing.add(
      "Only demo sensor data available — not usable for a real diagnosis.",
    );
    applied.push("demo_only_not_usable");
  }
  if (!context.stage) {
    missing.add("Plant stage is not recorded.");
  }

  // ---- confidence cap: weak evidence ⇒ never above medium ----
  let confidence = Number.isFinite(draft.confidence)
    ? Math.max(0, Math.min(1, draft.confidence))
    : 0;
  if (strength.evidenceSignals <= 1) {
    if (confidence > 0.39) {
      confidence = 0.39;
      applied.push("cap_confidence_on_single_weak_signal");
    }
  }
  if (strength.hasStaleOrInvalid && confidence > 0.5) {
    confidence = 0.5;
    applied.push("cap_confidence_when_stale_or_invalid");
  }
  if (!strength.hasTrustworthySensors && confidence > 0.3) {
    confidence = 0.3;
    applied.push("cap_confidence_without_trustworthy_sensors");
  }

  // ---- what_not_to_do baseline + autoflower extras ----
  const neverDo: string[] = [...draft.what_not_to_do];
  for (const n of NEVER_DO_BASELINE) {
    if (!neverDo.includes(n)) neverDo.push(n);
  }
  if (isLikelyAutoflower(context)) {
    for (const n of AUTOFLOWER_NEVER_DO) {
      if (!neverDo.includes(n)) neverDo.push(n);
    }
    applied.push("autoflower_block_heavy_stress_recovery");
  }

  // ---- strip any device-command-style wording defensively ----
  const safeImmediate = DEVICE_COMMAND_PATTERNS.some((rx) =>
    rx.test(draft.immediate_action),
  )
    ? "Observe and re-check. Do not change inputs based on this output."
    : draft.immediate_action;
  if (safeImmediate !== draft.immediate_action) {
    applied.push("stripped_device_command_from_immediate_action");
  }

  // ---- action queue: never executable, always pending approval ----
  let suggestion = draft.action_queue_suggestion;
  if (suggestion) {
    suggestion = {
      action_type: "advisory",
      status: "pending_approval",
      reason: suggestion.reason,
      risk_level: suggestion.risk_level,
    };
  }
  if (strength.hasStaleOrInvalid && !suggestion) {
    suggestion = {
      action_type: "advisory",
      status: "pending_approval",
      reason:
        "Some recent sensor readings are stale or invalid. Suggest a manual recheck before any further changes.",
      risk_level: "medium",
    };
    applied.push("suggest_recheck_when_stale_or_invalid");
  }

  const risk_level: AiDoctorRiskLevel = strength.hasStaleOrInvalid
    ? draft.risk_level === "high"
      ? "high"
      : "medium"
    : draft.risk_level;

  return Object.freeze({
    summary: draft.summary,
    likely_issue: draft.likely_issue,
    confidence,
    confidence_band: bandForConfidence(confidence),
    evidence: Object.freeze(draft.evidence.slice()),
    missing_information: Object.freeze(Array.from(missing)),
    possible_causes: Object.freeze(draft.possible_causes.slice()),
    immediate_action: safeImmediate,
    what_not_to_do: Object.freeze(stripDeviceCommands(neverDo)),
    follow_up_24h: draft.follow_up_24h,
    recovery_plan_3_day: draft.recovery_plan_3_day,
    risk_level,
    action_queue_suggestion: suggestion,
    applied_safety_rules: Object.freeze(applied),
  });
}

export type { AiDoctorContext };
