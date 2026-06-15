/**
 * aiDoctorActionSuggestionPreviewRules — pure helper that previews whether
 * the current AI Doctor context could later support a safe, approval-required
 * Action Queue suggestion.
 *
 * This is PREVIEW ONLY. It never:
 *  - creates Action Queue rows
 *  - calls Supabase
 *  - calls any model/edge function
 *  - emits executable device commands
 *  - promotes imported CSV history to "live"
 *  - classifies invalid/unknown telemetry as healthy
 *
 * Output is deterministic for a given input. Suggested copy is conservative
 * and never recommends nutrient, irrigation, or equipment changes from weak
 * evidence.
 */
import type { ManualSensorSnapshotQuality } from "@/lib/manualSensorSnapshotQualityRules";

export type ActionSuggestionPreviewStatus =
  | "eligible"
  | "needs_current_reading"
  | "missing_context"
  | "blocked_invalid_data"
  | "blocked_device_command_risk";

export type ActionSuggestionMissingField =
  | "plant"
  | "tent"
  | "stage"
  | "current_sensor_snapshot";

export type ActionSuggestionInvalidField =
  | "temperature"
  | "humidity"
  | "vpd"
  | "soil_ec"
  | "soil_moisture"
  | "co2"
  | "unknown";

export interface ActionSuggestionPreviewInput {
  /** Plant + tent + stage context all known. */
  hasPlantContext: boolean;
  /** At least one current (recent) manual or live sensor reading. */
  hasCurrentManualOrLiveReading: boolean;
  /** CSV / imported historical context is available as background. */
  hasImportedHistory: boolean;
  /** Critical telemetry is flagged invalid, unknown, blocked, or stale. */
  hasInvalidOrUnknownCriticalTelemetry: boolean;
  /**
   * Optional per-field plant-context detail. Each value is `true` when the
   * field is PRESENT. When omitted, missing fields are derived from
   * `hasPlantContext`.
   */
  plantContextDetail?: { plant?: boolean; tent?: boolean; stage?: boolean };
  /**
   * Optional explicit list of telemetry metrics flagged invalid/unknown.
   * Unknown labels are bucketed as "unknown".
   */
  invalidTelemetryMetrics?: readonly string[];
  /**
   * Candidate suggestion strings derived from context. Scanned for
   * device-command-shaped language. Anything matching blocks eligibility.
   */
  candidateSuggestionTexts?: readonly string[];
}

export interface ActionSuggestionPreview {
  eligible: boolean;
  status: ActionSuggestionPreviewStatus;
  summary: string;
  reasons: readonly string[];
  safetyNotes: readonly string[];
  /** Deterministic, sorted list of missing context fields. */
  missingFields: readonly ActionSuggestionMissingField[];
  /** Deterministic, sorted list of invalid/unknown telemetry fields. */
  invalidFields: readonly ActionSuggestionInvalidField[];
  suggestedActionPreview?: string;
  approvalRequired: true;
  deviceControl: false;
  contextOnly: true;
}

const DEVICE_COMMAND_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bturn[_\s-]?on\b/i,
  /\bturn[_\s-]?off\b/i,
  /\bactuat/i,
  /\bdose\b/i,
  /\bpump[_\s-]?(on|off|start|stop)\b/i,
  /\bfan[_\s-]?(on|off|set)\b/i,
  /\blight[_\s-]?(on|off|set)\b/i,
  /\bset[_\s-]?(temp|humidity|rh|light|fan|pump|setpoint)\b/i,
  /\bexec(ute)?[_\s-]?(command|device)\b/i,
  /\bmqtt[_\s-]?publish\b/i,
  /\birrigation[_\s-]?control\b/i,
]);

const SAFETY_NOTES: readonly string[] = Object.freeze([
  "Approval required — grower must approve any action before it runs.",
  "No device control — Verdant will not run equipment commands.",
  "Preview only — no Action Queue item is created.",
]);

const SUMMARY_BY_STATUS: Record<ActionSuggestionPreviewStatus, string> = {
  eligible:
    "Context is sufficient for a cautious, approval-required suggestion.",
  needs_current_reading:
    "Imported history is useful background, but a current manual or live reading is needed before a suggestion can be previewed.",
  missing_context:
    "Plant, tent, or stage context is missing. Add the missing context before previewing a suggestion.",
  blocked_invalid_data:
    "Invalid or unknown critical telemetry is present. No suggestion can be previewed until readings are reviewed.",
  blocked_device_command_risk:
    "Candidate text contains device-command-shaped language. Suggestion blocked for safety.",
};

const CONSERVATIVE_PREVIEW_COPY =
  "Review environment and add a current sensor snapshot before changing anything. " +
  "Monitor for 24 hours if confidence is low.";

const MISSING_FIELD_ORDER: readonly ActionSuggestionMissingField[] = [
  "plant",
  "tent",
  "stage",
  "current_sensor_snapshot",
];

const INVALID_FIELD_ORDER: readonly ActionSuggestionInvalidField[] = [
  "temperature",
  "humidity",
  "vpd",
  "soil_ec",
  "soil_moisture",
  "co2",
  "unknown",
];

export const ACTION_SUGGESTION_MISSING_FIELD_LABELS: Record<
  ActionSuggestionMissingField,
  string
> = Object.freeze({
  plant: "Plant",
  tent: "Tent",
  stage: "Growth stage",
  current_sensor_snapshot: "Current manual/live sensor snapshot",
});

export const ACTION_SUGGESTION_INVALID_FIELD_LABELS: Record<
  ActionSuggestionInvalidField,
  string
> = Object.freeze({
  temperature: "Temperature",
  humidity: "Humidity",
  vpd: "VPD",
  soil_ec: "Soil EC",
  soil_moisture: "Soil moisture",
  co2: "CO2",
  unknown: "Unknown / unverified telemetry",
});

const INVALID_METRIC_ALIASES: Record<string, ActionSuggestionInvalidField> = {
  temperature: "temperature",
  temperature_c: "temperature",
  temperature_f: "temperature",
  temp: "temperature",
  humidity: "humidity",
  humidity_pct: "humidity",
  rh: "humidity",
  rh_pct: "humidity",
  vpd: "vpd",
  vpd_kpa: "vpd",
  soil_ec: "soil_ec",
  ec: "soil_ec",
  soil_moisture: "soil_moisture",
  moisture: "soil_moisture",
  swc: "soil_moisture",
  co2: "co2",
  co2_ppm: "co2",
};

function containsDeviceCommand(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) return false;
  return DEVICE_COMMAND_PATTERNS.some((p) => p.test(text));
}

function freeze<T>(value: T): T {
  return Object.freeze(value) as T;
}

function sortByOrder<T extends string>(
  values: Iterable<T>,
  order: readonly T[],
): T[] {
  const set = new Set(values);
  return order.filter((v) => set.has(v));
}

function bucketInvalidMetric(raw: string): ActionSuggestionInvalidField {
  const key = String(raw ?? "").trim().toLowerCase();
  return INVALID_METRIC_ALIASES[key] ?? "unknown";
}

function deriveMissingFields(
  input: ActionSuggestionPreviewInput,
): ActionSuggestionMissingField[] {
  const missing = new Set<ActionSuggestionMissingField>();
  const detail = input.plantContextDetail;
  if (detail) {
    if (detail.plant === false) missing.add("plant");
    if (detail.tent === false) missing.add("tent");
    if (detail.stage === false) missing.add("stage");
  } else if (!input.hasPlantContext) {
    missing.add("plant");
    missing.add("tent");
    missing.add("stage");
  }
  if (!input.hasCurrentManualOrLiveReading) {
    missing.add("current_sensor_snapshot");
  }
  return sortByOrder(missing, MISSING_FIELD_ORDER);
}

function deriveInvalidFields(
  input: ActionSuggestionPreviewInput,
): ActionSuggestionInvalidField[] {
  const metrics = input.invalidTelemetryMetrics;
  if (Array.isArray(metrics) && metrics.length > 0) {
    const bucketed = metrics.map(bucketInvalidMetric);
    return sortByOrder(bucketed, INVALID_FIELD_ORDER);
  }
  if (input.hasInvalidOrUnknownCriticalTelemetry) {
    return ["unknown"];
  }
  return [];
}

/**
 * Produce a preview of whether a context could later yield a safe,
 * approval-required Action Queue suggestion. Pure + deterministic.
 */
export function previewActionSuggestion(
  input: ActionSuggestionPreviewInput,
): ActionSuggestionPreview {
  const candidates = (input?.candidateSuggestionTexts ?? []).filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  const deviceRisk = candidates.some(containsDeviceCommand);
  const invalidFields = deriveInvalidFields(input);
  const missingFields = deriveMissingFields(input);

  let status: ActionSuggestionPreviewStatus;
  const reasons: string[] = [];

  if (deviceRisk) {
    status = "blocked_device_command_risk";
    reasons.push(
      "One or more candidate strings contain device-command-shaped language.", // AI-DOCTOR-PREVIEW-SAFETY: ALLOW
    );
  } else if (invalidFields.length > 0) {
    status = "blocked_invalid_data";
    reasons.push(
      "Critical telemetry is flagged invalid, unknown, or unverified.",
    );
  } else if (!input.hasPlantContext || missingFields.some((f) => f !== "current_sensor_snapshot")) {
    status = "missing_context";
    reasons.push("Plant, tent, or stage context is not available.");
  } else if (!input.hasCurrentManualOrLiveReading) {
    status = "needs_current_reading";
    if (input.hasImportedHistory) {
      reasons.push(
        "Only imported CSV history is available; current manual or live reading is required.",
      );
    } else {
      reasons.push(
        "No current manual or live sensor reading is available.",
      );
    }
  } else {
    status = "eligible";
    reasons.push(
      "Plant context present and at least one current manual or live reading is available.",
    );
    if (input.hasImportedHistory) {
      reasons.push("Imported history is included as background only.");
    }
  }

  const eligible = status === "eligible";
  const preview: ActionSuggestionPreview = {
    eligible,
    status,
    summary: SUMMARY_BY_STATUS[status],
    reasons: freeze([...reasons]),
    safetyNotes: SAFETY_NOTES,
    missingFields: freeze(missingFields),
    invalidFields: freeze(invalidFields),
    approvalRequired: true,
    deviceControl: false,
    contextOnly: true,
  };
  if (eligible) {
    preview.suggestedActionPreview = CONSERVATIVE_PREVIEW_COPY;
  }
  return freeze(preview);
}

export const ACTION_SUGGESTION_PREVIEW_LABEL = "Action Queue suggestion preview";

export const ACTION_SUGGESTION_PREVIEW_STATUS_LABELS: Record<
  ActionSuggestionPreviewStatus,
  string
> = Object.freeze({
  eligible: "Eligible (preview only)",
  needs_current_reading: "Needs current reading",
  missing_context: "Missing context",
  blocked_invalid_data: "Blocked — invalid data",
  blocked_device_command_risk: "Blocked — device-command risk",
});

/**
 * UI-level safety filter. Returns true if a rendered string contains
 * approved/queued/executable/device-command language that must never reach
 * the preview card, regardless of helper output. The presenter uses this
 * to drop unsafe strings as a defence-in-depth guard.
 */
const UI_FORBIDDEN_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bapproved\b/i,
  /\b(queued|added to (the )?queue)\b/i,
  /\b(was|is|has been|have been) executed\b/i,
  /\bexecute\b/i,
  /\bsend\b/i,
  /\bturn[_\s-]?on\b/i,
  /\bturn[_\s-]?off\b/i,
  /\bpump\b/i,
  /\bdose\b/i,
  /\bset[_\s-]?temp\b/i,
  /\bset[_\s-]?(humidity|rh)\b/i,
  /\bmqtt[_\s-]?publish\b/i,
]);

export function isUnsafePreviewText(text: unknown): boolean {
  if (typeof text !== "string" || text.length === 0) return false;
  return UI_FORBIDDEN_PATTERNS.some((p) => p.test(text));
}

/**
 * Lightweight readiness-view shape used to derive a preview input. Kept
 * structural so this module stays decoupled from the readiness view-model.
 */
export interface ActionSuggestionPreviewReadinessLike {
  plantIdentity: {
    plantId: string | null;
    stage: string | null;
    tentId?: string | null;
  };
  sourceBadges: ReadonlyArray<{
    source: string;
    sampleCount: number;
    isTrustworthy: boolean;
  }>;
  limitations: ReadonlyArray<{ code: string }>;
}

/**
 * Derive a preview input from a readiness view. Pure + null-safe.
 */
export function deriveActionSuggestionPreviewInput(
  view: ActionSuggestionPreviewReadinessLike,
): ActionSuggestionPreviewInput {
  const badges = view?.sourceBadges ?? [];
  const limitations = view?.limitations ?? [];
  const plantPresent = Boolean(view?.plantIdentity?.plantId);
  const stagePresent = Boolean(view?.plantIdentity?.stage);
  const tentPresent =
    view?.plantIdentity?.tentId === undefined
      ? plantPresent
      : Boolean(view?.plantIdentity?.tentId);
  const hasPlantContext = plantPresent && stagePresent && tentPresent;
  const hasCurrentManualOrLiveReading = badges.some(
    (b) =>
      (b.source === "live" || b.source === "manual") && b.sampleCount > 0,
  );
  const hasImportedHistory = badges.some(
    (b) => (b.source === "csv" || b.source === "import") && b.sampleCount > 0,
  );
  const hasInvalidOrUnknownCriticalTelemetry = limitations.some(
    (l) => l.code === "stale_or_invalid",
  );
  return {
    hasPlantContext,
    hasCurrentManualOrLiveReading,
    hasImportedHistory,
    hasInvalidOrUnknownCriticalTelemetry,
    plantContextDetail: {
      plant: plantPresent,
      tent: tentPresent,
      stage: stagePresent,
    },
  };
}

export const __testing = {
  DEVICE_COMMAND_PATTERNS,
  UI_FORBIDDEN_PATTERNS,
  containsDeviceCommand,
  SAFETY_NOTES,
  bucketInvalidMetric,
};
