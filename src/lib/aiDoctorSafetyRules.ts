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
import { normalizePlantType, type PlantType } from "./plantTypeRules";

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

const TRUSTWORTHY: ReadonlySet<SensorSourceTag> = new Set<SensorSourceTag>(["live", "manual"]);

export const NEVER_DO_BASELINE: readonly string[] = Object.freeze([
  "Do not adjust nutrient strength based on this output.",
  "Do not change irrigation schedule based on this output.",
  "Do not change equipment (lights, fans, heaters, humidifiers, pumps) based on this output.",
  "Do not treat stale, invalid, or demo sensor readings as current truth.",
  "Output must not be used to control devices or schedule unattended changes.",
]);

export const AUTOFLOWER_NEVER_DO: readonly string[] = Object.freeze([
  "Do not heavily defoliate this autoflower.",
  "Do not transplant this autoflower based on this output.",
  "Do not apply high-stress training (topping, FIM, severe LST) on this autoflower.",
  "Do not perform an aggressive flush on this autoflower.",
]);

/**
 * Low-stress baseline for plants whose type is not confirmed. Same
 * prohibitions as AUTOFLOWER_NEVER_DO, worded for an unverified type —
 * an unknown plant might be an autoflower, so high-stress recovery is
 * off the table until the grower records the type
 * (autoflower/photoperiod plan, 2026-07-21).
 */
export const UNKNOWN_TYPE_NEVER_DO: readonly string[] = Object.freeze([
  "Do not heavily defoliate until the plant type (autoflower vs photoperiod) is confirmed.",
  "Do not transplant based on this output until the plant type is confirmed.",
  "Do not apply high-stress training (topping, FIM, severe LST) until the plant type is confirmed.",
  "Do not perform an aggressive flush until the plant type is confirmed.",
]);

/** Heuristic: name/strain contains "auto" → treat as autoflower. */
export function isLikelyAutoflower(context: AiDoctorContext): boolean {
  const blob = `${context.strain ?? ""} ${context.plant_name ?? ""}`.toLowerCase();
  return /\bauto(flower)?s?\b|auto$/.test(blob) || blob.includes("autoflower");
}

/**
 * Declared type from the context payload. The declared field wins when it
 * says autoflower; the name heuristic stays as a safety net on top (a plant
 * declared photoperiod but named "Auto ..." is still treated conservatively).
 */
export function declaredPlantType(context: AiDoctorContext): PlantType {
  return normalizePlantType(context.plant_type ?? null);
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

export function assessContextStrength(context: AiDoctorContext): ContextStrength {
  const trustworthyGroups = context.sensor_groups.filter((g) => TRUSTWORTHY.has(g.source));
  const trustworthySensorReadings = trustworthyGroups.reduce((n, g) => n + g.sample_count, 0);
  const hasTrustworthySensors = trustworthySensorReadings > 0;
  const hasRecentEvents = context.recent_grow_events.length > 0;
  const hasStaleOrInvalid = context.sensor_groups.some(
    (g) => g.source === "stale" || g.source === "invalid",
  );
  const hasAnySensors = context.sensor_groups.length > 0;
  const hasDemoOnly =
    !hasTrustworthySensors && context.sensor_groups.some((g) => g.source === "demo");

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

/**
 * Feed/taper wording that requires root-zone evidence before it may appear in
 * the actionable fields (immediate_action / follow_up_24h /
 * recovery_plan_3_day). Uppercase "EC" is matched case-sensitively so prose
 * words ("second", "recheck") never trip it.
 */
const FEED_CHANGE_PATTERNS: readonly RegExp[] = [
  /\bfeed(ing)?\b/i,
  /\bnutrient/i,
  /\bfertiliz/i,
  /\bEC\b/,
  /\bppm\b/i,
  /\btaper\b/i,
  /\bflush/i,
  /\bwater(ing)? (more|less|schedule|frequency)\b/i,
];

/**
 * Device-control DETECTION patterns, exported for read-only reuse by the AI
 * Doctor output evaluator (`aiDoctorOutputEvaluation`). Detection only — these
 * BLOCK/flag device wording; they are never an execution surface.
 *
 * Deliberately NARROWER than `DEVICE_COMMAND_PATTERNS`. The engine only *strips*
 * text that matches its list, so over-broad bare verbs (`execute`, `trigger`,
 * `activate`, `automate`) are harmless there. In the evaluator the same tokens
 * raise a hard `device_control_instruction` ERROR, which would fail safe advice
 * like "this may trigger nutrient lockout" or "execute the plan". So every
 * pattern here must be bound to an actual device/equipment object or an on/off
 * action. Automatic-execution wording is covered separately by
 * `automatic_action_queue_language`.
 */
const DEVICE_OBJECT =
  "(fan|fans|light|lights|pump|heater|humidifier|dehumidifier|extractor|exhaust|valve)";

export const DEVICE_CONTROL_DETECTION_PATTERNS: readonly RegExp[] = [
  /\bturn (on|off)\b/i,
  /\bpower (on|off)\b/i,
  /\bswitch (on|off)\b/i,
  // Pronoun on/off: "the humidifier is off; turn it on".
  /\bturn\s+(it|them)\s+(on|off)\b/i,
  // Object-BEFORE-on/off forms: "turn the fan off", "switching the lights off".
  new RegExp(
    `\\b(turn|turning|switch|switching|power|powering)\\s+(the\\s+|your\\s+)?${DEVICE_OBJECT}\\s+(on|off)\\b`,
    "i",
  ),
  // Device-BOUND activate/trigger only. The BARE verbs stay out — they caused
  // "this may trigger nutrient lockout" / "execute the plan" false positives —
  // but "Activate the pump" / "Trigger the exhaust fan" are direct commands.
  new RegExp(`\\b(activate|trigger)\\s+(the\\s+|your\\s+)?${DEVICE_OBJECT}\\b`, "i"),
  // Device-bound enable/disable only. "Enable the review workflow" stays clean.
  new RegExp(`\\b(enable|disable)\\s+(the\\s+|your\\s+)?${DEVICE_OBJECT}\\b`, "i"),
  /\b(start|stop) (the )?(pump|fan|light|lights|heater|humidifier|dehumidifier)\b/i,
  /\b(open|close) (the )?valve\b/i,
  /\bauto-?dose\b/i,
  /\brun (the )?(pump|fan|light|heater|dehumidifier|humidifier)\b/i,
  /\bset (the )?(fan|light|lights|humidifier|dehumidifier|heater|temp|temperature|humidity)\b/i,
  /\bset ?point\b/i,
  /\brelay\b/i,
  /\bactuate\b/i,
];

function stripDeviceCommands(items: readonly string[]): string[] {
  return items.filter((s) => !DEVICE_COMMAND_PATTERNS.some((rx) => rx.test(s)));
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
    missing.add("Some recent sensor readings are stale or invalid — fresh confirmation needed.");
    applied.push("flag_stale_or_invalid_telemetry");
  }
  if (strength.hasDemoOnly) {
    missing.add("Only demo sensor data available — not usable for a real diagnosis.");
    applied.push("demo_only_not_usable");
  }
  if (!context.stage) {
    missing.add("Plant stage is not recorded.");
  }
  const plantType = declaredPlantType(context);
  if (plantType === "unknown") {
    missing.add("Plant type (autoflower or photoperiod) is not recorded.");
    applied.push("missing_information_when_plant_type_unknown");
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

  // ---- what_not_to_do baseline + type-aware low-stress extras ----
  // Declared autoflower OR the name heuristic → autoflower prohibitions.
  // Declared unknown (or absent) without the heuristic → the same
  // prohibitions worded for an unverified type. Only a declared photoperiod
  // with no autoflower name signal escapes the low-stress baseline.
  const neverDo: string[] = [...draft.what_not_to_do];
  for (const n of NEVER_DO_BASELINE) {
    if (!neverDo.includes(n)) neverDo.push(n);
  }
  const treatAsAutoflower = plantType === "autoflower" || isLikelyAutoflower(context);
  if (treatAsAutoflower) {
    for (const n of AUTOFLOWER_NEVER_DO) {
      if (!neverDo.includes(n)) neverDo.push(n);
    }
    applied.push("autoflower_block_heavy_stress_recovery");
  } else if (plantType === "unknown") {
    for (const n of UNKNOWN_TYPE_NEVER_DO) {
      if (!neverDo.includes(n)) neverDo.push(n);
    }
    applied.push("unknown_type_low_stress_baseline");
  }

  // ---- strip any device-command-style wording defensively ----
  let safeImmediate = DEVICE_COMMAND_PATTERNS.some((rx) => rx.test(draft.immediate_action))
    ? "Observe and re-check. Do not change inputs based on this output."
    : draft.immediate_action;
  if (safeImmediate !== draft.immediate_action) {
    applied.push("stripped_device_command_from_immediate_action");
  }

  // ---- feed/taper language requires root-zone evidence ----
  // Deterministic gate, not model guidance: with no recent settled root-zone
  // observations (dry-back, runoff, pot weight), any feed/EC/taper/watering-
  // change wording in the actionable fields is replaced with an observation-
  // first instruction, and the gap is surfaced in missing_information. When
  // root-zone history exists it is named in Evidence — so feed language never
  // appears without root-zone evidence alongside it.
  const rootZoneObservations =
    typeof context.recent_root_zone_observation_count === "number" &&
    Number.isFinite(context.recent_root_zone_observation_count)
      ? Math.max(0, context.recent_root_zone_observation_count)
      : 0;
  const evidenceOut: string[] = draft.evidence.slice();
  let followUp = draft.follow_up_24h;
  let recoveryPlan = draft.recovery_plan_3_day;
  if (rootZoneObservations > 0) {
    evidenceOut.push(
      `Root-zone history: ${rootZoneObservations} recent observation(s) (dry-back / runoff / pot weight).`,
    );
  } else {
    const vetoed = FEED_CHANGE_PATTERNS.some(
      (rx) => rx.test(safeImmediate) || rx.test(followUp) || rx.test(recoveryPlan),
    );
    if (vetoed) {
      const fallback =
        "Log root-zone observations (dry-back, pot weight, runoff) before any feed or watering change.";
      if (FEED_CHANGE_PATTERNS.some((rx) => rx.test(safeImmediate))) safeImmediate = fallback;
      if (FEED_CHANGE_PATTERNS.some((rx) => rx.test(followUp))) followUp = fallback;
      if (FEED_CHANGE_PATTERNS.some((rx) => rx.test(recoveryPlan))) recoveryPlan = fallback;
      applied.push("feed_language_requires_root_zone_history");
    }
    missing.add(
      "No root-zone history (dry-back, runoff, pot weight) recorded — feed guidance withheld.",
    );
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
    evidence: Object.freeze(evidenceOut),
    missing_information: Object.freeze(Array.from(missing)),
    possible_causes: Object.freeze(draft.possible_causes.slice()),
    immediate_action: safeImmediate,
    what_not_to_do: Object.freeze(stripDeviceCommands(neverDo)),
    follow_up_24h: followUp,
    recovery_plan_3_day: recoveryPlan,
    risk_level,
    action_queue_suggestion: suggestion,
    applied_safety_rules: Object.freeze(applied),
  });
}

export type { AiDoctorContext };
