/**
 * Plant Event Review — deterministic reference skill for Verdant Skill Runtime v1.
 *
 * The skill reviews one caller-supplied, already-normalized plant event for
 * evidence completeness. It never receives or emits raw note text, photo URLs,
 * diary details, sensor payloads, diagnoses, treatment instructions, writes,
 * Action Queue shapes, device commands, or model/network requests.
 */

import {
  applicableVerdantSkill,
  invalidVerdantSkillApplicability,
  notApplicableVerdantSkill,
  parseVerdantSkillExecutionAt,
} from "@/lib/verdantSkillApplicabilityRules";
import {
  createVerdantSkillManifest,
  VERDANT_SKILL_MANIFEST_SCHEMA_VERSION,
  VERDANT_SKILL_V1_CAPABILITIES,
  VERDANT_SKILL_V1_POLICY_TAGS,
  type VerdantSkillDefinition,
  type VerdantSkillOutcomeValidation,
} from "@/lib/verdantSkillManifest";

export const PLANT_EVENT_REVIEW_SKILL_ID = "plant-event-review" as const;
export const PLANT_EVENT_REVIEW_SKILL_VERSION = "1.0.0" as const;
export const PLANT_EVENT_REVIEW_FIXTURE_SET = "plant-event-review-golden-cases.v1" as const;

const INPUT_KEYS = Object.freeze(["event", "sensorEvidence"] as const);
const EVENT_KEYS = Object.freeze([
  "id",
  "growId",
  "tentId",
  "plantId",
  "occurredAt",
  "eventType",
  "stage",
  "notePresent",
  "photoPresent",
  "validForAiContext",
  "normalizationWarnings",
] as const);
const SENSOR_EVIDENCE_KEYS = Object.freeze(["scope", "snapshot", "explicitRef"] as const);
const SENSOR_SCOPE_KEYS = Object.freeze(["tentId", "plantId"] as const);
const SENSOR_SNAPSHOT_KEYS = Object.freeze([
  "source",
  "sourceDetail",
  "capturedAt",
  "confidence",
  "invalid",
  "metrics",
] as const);
const SENSOR_METRIC_KEYS = Object.freeze(["key", "value", "unit", "kind"] as const);
const SENSOR_REF_KEYS = Object.freeze(["id", "captured_at", "source", "metric"] as const);

const OUTPUT_KEYS = Object.freeze([
  "status",
  "category",
  "confidence",
  "summary",
  "findings",
  "evidenceRefs",
  "missingInformation",
  "nextDataToLog",
  "actionQueueSuggestion",
] as const);
const FINDING_KEYS = Object.freeze(["findingId", "severity"] as const);
const EVIDENCE_REF_KEYS = Object.freeze(["id", "type", "occurred_at", "source"] as const);

const MAX_NORMALIZATION_WARNINGS = 12;
const MAX_SENSOR_EVIDENCE = 4;
const MAX_SENSOR_METRICS = 8;
const MAX_FINDINGS = 20;
const MAX_EVIDENCE_REFS = 4;
const MAX_MISSING_INFORMATION = 12;
const MAX_NEXT_DATA_TO_LOG = 12;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CODE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const WARNING_CODE_PATTERN = /^[a-z][a-z0-9:_-]{0,79}$/;
const SAFE_SOURCE_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;

export type PlantEventReviewSensorMetricKey = "temp" | "rh" | "vpd" | "soil" | "ec" | "ph";
export type PlantEventReviewSensorMetricKind = "environment" | "soil" | "other";
export type TimelineFilterCategory =
  | "photos"
  | "watering"
  | "feeding"
  | "symptoms"
  | "training"
  | "measurement"
  | "transplant"
  | "harvest"
  | "reminder"
  | "notes";

export interface PlantEventReviewEvidenceRef {
  readonly id: string;
  readonly type: "sensor_snapshot";
  readonly occurred_at: string;
  readonly source: "live" | "manual";
}

const SENSOR_METRIC_KEY_VALUES: readonly PlantEventReviewSensorMetricKey[] = Object.freeze([
  "temp",
  "rh",
  "vpd",
  "soil",
  "ec",
  "ph",
]);
const SENSOR_METRIC_KIND_VALUES: readonly PlantEventReviewSensorMetricKind[] = Object.freeze([
  "environment",
  "soil",
  "other",
]);
// Kept local to the closed v1 runtime, while matching Verdant's existing
// plausibility bands: temp -20..60 °C, pH 3..9, EC 0..50 mS/cm,
// VPD 0..10 kPa, and percentage endpoints treated as stuck.
const SENSOR_METRIC_CONTRACTS = Object.freeze({
  temp: Object.freeze({
    unit: "°C",
    minimum: -20,
    maximum: 60,
    minimumExclusive: false,
    maximumExclusive: false,
  }),
  rh: Object.freeze({
    unit: "%",
    minimum: 0,
    maximum: 100,
    minimumExclusive: true,
    maximumExclusive: true,
  }),
  vpd: Object.freeze({
    unit: "kPa",
    minimum: 0,
    maximum: 10,
    minimumExclusive: false,
    maximumExclusive: false,
  }),
  soil: Object.freeze({
    unit: "%",
    minimum: 0,
    maximum: 100,
    minimumExclusive: true,
    maximumExclusive: true,
  }),
  ec: Object.freeze({
    unit: "mS/cm",
    minimum: 0,
    maximum: 50,
    minimumExclusive: false,
    maximumExclusive: false,
  }),
  ph: Object.freeze({
    unit: "pH",
    minimum: 3,
    maximum: 9,
    minimumExclusive: false,
    maximumExclusive: false,
  }),
} satisfies Record<
  PlantEventReviewSensorMetricKey,
  {
    readonly unit: string;
    readonly minimum: number;
    readonly maximum: number;
    readonly minimumExclusive: boolean;
    readonly maximumExclusive: boolean;
  }
>);
const TIMELINE_CATEGORY_VALUES: readonly TimelineFilterCategory[] = Object.freeze([
  "photos",
  "watering",
  "feeding",
  "symptoms",
  "training",
  "measurement",
  "transplant",
  "harvest",
  "reminder",
  "notes",
]);

const KNOWN_NOTE_EVENT_TYPES = new Set([
  "observation",
  "note",
  "environment",
  "other",
  "cure_check",
  "pest",
  "ph_check",
  "ec_check",
  "flush",
]);

export interface PlantEventReviewEventInput {
  readonly id: string;
  readonly growId: string | null;
  readonly tentId: string | null;
  readonly plantId: string | null;
  readonly occurredAt: string | null;
  readonly eventType: string | null;
  readonly stage: string | null;
  readonly notePresent: boolean;
  readonly photoPresent: boolean;
  readonly validForAiContext: boolean;
  readonly normalizationWarnings: readonly string[];
}

export interface PlantEventReviewSensorMetricInput {
  readonly key: PlantEventReviewSensorMetricKey;
  readonly value: number | null;
  readonly unit: string | null;
  readonly kind: PlantEventReviewSensorMetricKind | null;
}

export interface PlantEventReviewSensorSnapshotInput {
  readonly source: string | null;
  readonly sourceDetail: string | null;
  readonly capturedAt: string | null;
  readonly confidence: number | null;
  readonly invalid: boolean;
  readonly metrics: readonly PlantEventReviewSensorMetricInput[];
}

export interface PlantEventReviewSensorRefInput {
  readonly id: string;
  readonly captured_at: string;
  readonly source: string;
  readonly metric: string | null;
}

export interface PlantEventReviewSensorEvidenceInput {
  readonly scope: {
    readonly tentId: string | null;
    readonly plantId: string | null;
  };
  readonly snapshot: PlantEventReviewSensorSnapshotInput;
  readonly explicitRef: PlantEventReviewSensorRefInput | null;
}

export interface PlantEventReviewInput {
  readonly event: PlantEventReviewEventInput;
  readonly sensorEvidence: readonly PlantEventReviewSensorEvidenceInput[];
}

export type PlantEventReviewStatus = "reviewed" | "needs_context";
export type PlantEventReviewConfidence = "low" | "medium";
export type PlantEventReviewFindingSeverity = "info" | "warning" | "blocker";

export const PLANT_EVENT_REVIEW_FINDING_SEVERITY = Object.freeze({
  event_description_missing: "warning",
  event_normalization_warning: "warning",
  event_type_unknown: "warning",
  sensor_context_missing: "warning",
  sensor_evidence_csv: "info",
  sensor_evidence_demo: "warning",
  sensor_evidence_fresh_live: "info",
  sensor_evidence_fresh_manual: "info",
  sensor_evidence_invalid: "warning",
  sensor_evidence_confidence_unusable: "warning",
  sensor_evidence_metrics_unusable: "warning",
  sensor_evidence_no_metrics: "warning",
  sensor_evidence_ref_mismatch: "warning",
  sensor_evidence_ref_missing: "warning",
  sensor_evidence_stale: "warning",
  sensor_evidence_unknown_source: "warning",
  sensor_scope_mismatch: "warning",
  single_photo_non_diagnostic: "warning",
} satisfies Record<string, PlantEventReviewFindingSeverity>);

export type PlantEventReviewFindingCode = keyof typeof PLANT_EVENT_REVIEW_FINDING_SEVERITY;

export const PLANT_EVENT_REVIEW_MISSING_INFORMATION_CODES = Object.freeze([
  "current_sensor_context",
  "event_description",
  "explicit_sensor_reference",
  "fresh_sensor_context",
  "matching_sensor_context",
  "sensor_metrics",
  "specific_event_type",
  "valid_event_details",
] as const);
export type PlantEventReviewMissingInformationCode =
  (typeof PLANT_EVENT_REVIEW_MISSING_INFORMATION_CODES)[number];

export const PLANT_EVENT_REVIEW_NEXT_DATA_CODES = Object.freeze([
  "add_current_sensor_snapshot",
  "add_observation_note",
  "add_photo",
  "add_recent_feeding_context",
  "add_recent_watering_context",
  "clarify_event_details",
  "clarify_event_type",
  "log_dry_or_cure_outcome",
  "log_follow_up_observation",
  "log_plant_response_in_24h",
] as const);
export type PlantEventReviewNextDataCode = (typeof PLANT_EVENT_REVIEW_NEXT_DATA_CODES)[number];

export interface PlantEventReviewFinding {
  readonly findingId: PlantEventReviewFindingCode;
  readonly severity: PlantEventReviewFindingSeverity;
}

export interface PlantEventReviewOutcome {
  readonly status: PlantEventReviewStatus;
  readonly category: TimelineFilterCategory;
  readonly confidence: PlantEventReviewConfidence;
  readonly summary: string;
  readonly findings: readonly PlantEventReviewFinding[];
  readonly evidenceRefs: readonly PlantEventReviewEvidenceRef[];
  readonly missingInformation: readonly PlantEventReviewMissingInformationCode[];
  readonly nextDataToLog: readonly PlantEventReviewNextDataCode[];
  readonly actionQueueSuggestion: null;
}

const REVIEWED_SUMMARY =
  "The supplied plant event and matching evidence were reviewed without drawing a diagnosis.";
const NEEDS_CONTEXT_SUMMARY =
  "The supplied plant event needs more context before it can support a cautious review.";

const REVIEW_SUMMARIES = new Set([REVIEWED_SUMMARY, NEEDS_CONTEXT_SUMMARY]);
const FINDING_CODES = new Set<PlantEventReviewFindingCode>(
  Object.keys(PLANT_EVENT_REVIEW_FINDING_SEVERITY) as PlantEventReviewFindingCode[],
);
const MISSING_INFORMATION_CODES = new Set<PlantEventReviewMissingInformationCode>(
  PLANT_EVENT_REVIEW_MISSING_INFORMATION_CODES,
);
const NEXT_DATA_CODES = new Set<PlantEventReviewNextDataCode>(PLANT_EVENT_REVIEW_NEXT_DATA_CODES);

function isExactPlainRecord(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor),
    )
  ) {
    return false;
  }
  const actual = Object.keys(descriptors).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizedOptionalId(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

function normalizedRequiredId(value: unknown): string | null {
  const normalized = normalizedOptionalId(value);
  return typeof normalized === "string" ? normalized : null;
}

function normalizedOptionalCode(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return CODE_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizedOptionalBoundedText(
  value: unknown,
  maximumLength: number,
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  if (value.length === 0 || value.length > maximumLength || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function normalizedSource(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return SAFE_SOURCE_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizedFiniteOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isSemanticallyUsableSensorMetric(metric: PlantEventReviewSensorMetricInput): boolean {
  if (metric.value === null || metric.unit === null) return false;
  const contract = SENSOR_METRIC_CONTRACTS[metric.key];
  if (metric.unit !== contract.unit) return false;
  const aboveMinimum = contract.minimumExclusive
    ? metric.value > contract.minimum
    : metric.value >= contract.minimum;
  const belowMaximum = contract.maximumExclusive
    ? metric.value < contract.maximum
    : metric.value <= contract.maximum;
  return aboveMinimum && belowMaximum;
}

function stableUnique<Value extends string>(values: readonly Value[]): readonly Value[] {
  return Object.freeze([...new Set(values)].sort(compareCodePoints));
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseEvent(value: unknown): {
  event: PlantEventReviewEventInput | null;
  issues: string[];
} {
  if (!isExactPlainRecord(value, EVENT_KEYS)) {
    return { event: null, issues: ["event_shape_invalid"] };
  }

  const issues: string[] = [];
  const id = normalizedRequiredId(value.id);
  const growId = normalizedOptionalId(value.growId);
  const tentId = normalizedOptionalId(value.tentId);
  const plantId = normalizedOptionalId(value.plantId);
  const eventType = normalizedOptionalCode(value.eventType);
  const stage = normalizedOptionalCode(value.stage);

  if (!id) issues.push("event_id_invalid");
  if (growId === undefined) issues.push("event_grow_id_invalid");
  if (tentId === undefined) issues.push("event_tent_id_invalid");
  if (plantId === undefined) issues.push("event_plant_id_invalid");
  if (eventType === undefined) issues.push("event_type_invalid");
  if (stage === undefined) issues.push("event_stage_invalid");
  if (value.occurredAt !== null && typeof value.occurredAt !== "string") {
    issues.push("event_time_value_invalid");
  }
  if (typeof value.notePresent !== "boolean") {
    issues.push("event_note_presence_invalid");
  }
  if (typeof value.photoPresent !== "boolean") {
    issues.push("event_photo_presence_invalid");
  }
  if (typeof value.validForAiContext !== "boolean") {
    issues.push("event_context_flag_invalid");
  }

  let normalizationWarnings: readonly string[] = Object.freeze([]);
  if (
    !Array.isArray(value.normalizationWarnings) ||
    value.normalizationWarnings.length > MAX_NORMALIZATION_WARNINGS ||
    value.normalizationWarnings.some(
      (warning) =>
        typeof warning !== "string" || !WARNING_CODE_PATTERN.test(warning.trim().toLowerCase()),
    )
  ) {
    issues.push("event_normalization_warnings_invalid");
  } else {
    normalizationWarnings = stableUnique(
      value.normalizationWarnings.map((warning) => warning.trim().toLowerCase()),
    );
  }

  if (issues.length > 0) return { event: null, issues };

  return {
    event: Object.freeze({
      id: id as string,
      growId: growId as string | null,
      tentId: tentId as string | null,
      plantId: plantId as string | null,
      occurredAt: value.occurredAt as string | null,
      eventType: eventType as string | null,
      stage: stage as string | null,
      notePresent: value.notePresent as boolean,
      photoPresent: value.photoPresent as boolean,
      validForAiContext: value.validForAiContext as boolean,
      normalizationWarnings,
    }),
    issues,
  };
}

function parseSensorMetric(value: unknown): {
  metric: PlantEventReviewSensorMetricInput | null;
  issues: string[];
} {
  if (!isExactPlainRecord(value, SENSOR_METRIC_KEYS)) {
    return { metric: null, issues: ["sensor_metric_shape_invalid"] };
  }
  const issues: string[] = [];
  const key =
    typeof value.key === "string" &&
    SENSOR_METRIC_KEY_VALUES.includes(value.key as PlantEventReviewSensorMetricKey)
      ? (value.key as PlantEventReviewSensorMetricKey)
      : null;
  const numericValue = normalizedFiniteOrNull(value.value);
  const unit = normalizedOptionalBoundedText(value.unit, 8);
  const kind =
    value.kind === null ||
    (typeof value.kind === "string" &&
      SENSOR_METRIC_KIND_VALUES.includes(value.kind as PlantEventReviewSensorMetricKind))
      ? (value.kind as PlantEventReviewSensorMetricKind | null)
      : undefined;

  if (!key) issues.push("sensor_metric_key_invalid");
  if (numericValue === undefined) issues.push("sensor_metric_value_invalid");
  if (unit === undefined) issues.push("sensor_metric_unit_invalid");
  if (kind === undefined) issues.push("sensor_metric_kind_invalid");
  if (issues.length > 0) return { metric: null, issues };

  return {
    metric: Object.freeze({
      key: key as PlantEventReviewSensorMetricKey,
      value: numericValue as number | null,
      unit: unit as string | null,
      kind: kind as PlantEventReviewSensorMetricKind | null,
    }),
    issues,
  };
}

function parseSensorSnapshot(value: unknown): {
  snapshot: PlantEventReviewSensorSnapshotInput | null;
  issues: string[];
} {
  if (!isExactPlainRecord(value, SENSOR_SNAPSHOT_KEYS)) {
    return { snapshot: null, issues: ["sensor_snapshot_shape_invalid"] };
  }
  const issues: string[] = [];
  const source = normalizedSource(value.source);
  const sourceDetail = normalizedOptionalCode(value.sourceDetail);
  const capturedAt =
    value.capturedAt === null
      ? null
      : typeof value.capturedAt === "string" && isIsoTimestamp(value.capturedAt)
        ? value.capturedAt
        : undefined;
  const confidence = normalizedFiniteOrNull(value.confidence);

  if (source === undefined) issues.push("sensor_source_invalid");
  if (sourceDetail === undefined) issues.push("sensor_source_detail_invalid");
  if (capturedAt === undefined) issues.push("sensor_captured_at_invalid");
  if (
    confidence === undefined ||
    (typeof confidence === "number" && (confidence < 0 || confidence > 1))
  ) {
    issues.push("sensor_confidence_invalid");
  }
  if (typeof value.invalid !== "boolean") issues.push("sensor_invalid_flag_invalid");

  const metrics: PlantEventReviewSensorMetricInput[] = [];
  if (!Array.isArray(value.metrics) || value.metrics.length > MAX_SENSOR_METRICS) {
    issues.push("sensor_metrics_invalid");
  } else {
    for (const rawMetric of value.metrics) {
      const parsed = parseSensorMetric(rawMetric);
      issues.push(...parsed.issues);
      if (parsed.metric) metrics.push(parsed.metric);
    }
    if (new Set(metrics.map((metric) => metric.key)).size !== metrics.length) {
      issues.push("sensor_metric_duplicate");
    }
  }

  if (issues.length > 0) return { snapshot: null, issues };
  metrics.sort((left, right) => compareCodePoints(left.key, right.key));
  return {
    snapshot: Object.freeze({
      source: source as string | null,
      sourceDetail: sourceDetail as string | null,
      capturedAt: capturedAt as string | null,
      confidence: confidence as number | null,
      invalid: value.invalid as boolean,
      metrics: Object.freeze(metrics),
    }),
    issues,
  };
}

function parseSensorRef(value: unknown): {
  ref: PlantEventReviewSensorRefInput | null;
  issues: string[];
} {
  if (value === null) return { ref: null, issues: [] };
  if (!isExactPlainRecord(value, SENSOR_REF_KEYS)) {
    return { ref: null, issues: ["sensor_ref_shape_invalid"] };
  }
  const issues: string[] = [];
  const id = normalizedRequiredId(value.id);
  const source = normalizedSource(value.source);
  const metric = normalizedOptionalCode(value.metric);
  const capturedAt =
    typeof value.captured_at === "string" && isIsoTimestamp(value.captured_at)
      ? value.captured_at
      : null;
  if (!id) issues.push("sensor_ref_id_invalid");
  if (!capturedAt) issues.push("sensor_ref_time_invalid");
  if (source === null || source === undefined) issues.push("sensor_ref_source_invalid");
  if (metric === undefined) issues.push("sensor_ref_metric_invalid");
  if (issues.length > 0) return { ref: null, issues };
  return {
    ref: Object.freeze({
      id: id as string,
      captured_at: capturedAt as string,
      source: source as string,
      metric: metric as string | null,
    }),
    issues,
  };
}

function parseSensorEvidence(value: unknown): {
  evidence: PlantEventReviewSensorEvidenceInput | null;
  issues: string[];
} {
  if (!isExactPlainRecord(value, SENSOR_EVIDENCE_KEYS)) {
    return { evidence: null, issues: ["sensor_evidence_shape_invalid"] };
  }
  const issues: string[] = [];

  let scope: PlantEventReviewSensorEvidenceInput["scope"] | null = null;
  if (!isExactPlainRecord(value.scope, SENSOR_SCOPE_KEYS)) {
    issues.push("sensor_scope_shape_invalid");
  } else {
    const tentId = normalizedOptionalId(value.scope.tentId);
    const plantId = normalizedOptionalId(value.scope.plantId);
    if (tentId === undefined) issues.push("sensor_scope_tent_id_invalid");
    if (plantId === undefined) issues.push("sensor_scope_plant_id_invalid");
    if (tentId !== undefined && plantId !== undefined) {
      scope = Object.freeze({
        tentId: tentId as string | null,
        plantId: plantId as string | null,
      });
    }
  }

  const parsedSnapshot = parseSensorSnapshot(value.snapshot);
  const parsedRef = parseSensorRef(value.explicitRef);
  issues.push(...parsedSnapshot.issues, ...parsedRef.issues);

  if (issues.length > 0 || !scope || !parsedSnapshot.snapshot) {
    return { evidence: null, issues };
  }
  return {
    evidence: Object.freeze({
      scope,
      snapshot: parsedSnapshot.snapshot,
      explicitRef: parsedRef.ref,
    }),
    issues,
  };
}

function parsePlantEventReviewInput(value: unknown): {
  input: PlantEventReviewInput | null;
  issues: readonly string[];
} {
  if (!isExactPlainRecord(value, INPUT_KEYS)) {
    return { input: null, issues: Object.freeze(["input_shape_invalid"]) };
  }

  const parsedEvent = parseEvent(value.event);
  const issues = [...parsedEvent.issues];
  const sensorEvidence: PlantEventReviewSensorEvidenceInput[] = [];
  if (!Array.isArray(value.sensorEvidence)) {
    issues.push("sensor_evidence_list_invalid");
  } else if (value.sensorEvidence.length > MAX_SENSOR_EVIDENCE) {
    issues.push("sensor_evidence_limit_exceeded");
  } else {
    for (const rawEvidence of value.sensorEvidence) {
      const parsed = parseSensorEvidence(rawEvidence);
      issues.push(...parsed.issues);
      if (parsed.evidence) sensorEvidence.push(parsed.evidence);
    }
    const explicitRefIds = sensorEvidence
      .map((evidence) => evidence.explicitRef?.id)
      .filter((id): id is string => typeof id === "string");
    if (new Set(explicitRefIds).size !== explicitRefIds.length) {
      issues.push("sensor_ref_id_duplicate");
    }
  }

  if (issues.length > 0 || !parsedEvent.event) {
    return { input: null, issues: stableUnique(issues) };
  }

  sensorEvidence.sort((left, right) => {
    const leftKey = [
      left.explicitRef?.captured_at ?? left.snapshot.capturedAt ?? "",
      left.explicitRef?.id ?? "",
      left.scope.tentId ?? "",
      left.scope.plantId ?? "",
    ].join("|");
    const rightKey = [
      right.explicitRef?.captured_at ?? right.snapshot.capturedAt ?? "",
      right.explicitRef?.id ?? "",
      right.scope.tentId ?? "",
      right.scope.plantId ?? "",
    ].join("|");
    return compareCodePoints(leftKey, rightKey);
  });

  return {
    input: Object.freeze({
      event: parsedEvent.event,
      sensorEvidence: Object.freeze(sensorEvidence),
    }),
    issues: Object.freeze([]),
  };
}

function isKnownEventType(eventType: string | null): boolean {
  if (!eventType) return false;
  return (
    eventType === "photo" ||
    eventType === "watering" ||
    eventType === "feeding" ||
    KNOWN_NOTE_EVENT_TYPES.has(eventType) ||
    SYMPTOM_EVENT_TYPES.has(eventType) ||
    TRAINING_EVENT_TYPES.has(eventType) ||
    MEASUREMENT_EVENT_TYPES.has(eventType) ||
    TRANSPLANT_EVENT_TYPES.has(eventType) ||
    HARVEST_EVENT_TYPES.has(eventType) ||
    REMINDER_EVENT_TYPES.has(eventType)
  );
}

function scopesMatch(
  event: PlantEventReviewEventInput,
  evidence: PlantEventReviewSensorEvidenceInput,
): boolean {
  return (
    event.plantId !== null &&
    event.tentId !== null &&
    evidence.scope.plantId !== null &&
    evidence.scope.tentId !== null &&
    evidence.scope.plantId === event.plantId &&
    evidence.scope.tentId === event.tentId
  );
}

const SYMPTOM_EVENT_TYPES = new Set(["symptoms", "pest_disease", "diagnosis"]);
const TRAINING_EVENT_TYPES = new Set(["training", "defoliation"]);
const MEASUREMENT_EVENT_TYPES = new Set(["measurement", "manual_snapshot", "sensor_snapshot"]);
const TRANSPLANT_EVENT_TYPES = new Set(["transplant", "repot"]);
const HARVEST_EVENT_TYPES = new Set(["harvest", "dry", "drying", "cure", "curing"]);
const REMINDER_EVENT_TYPES = new Set([
  "reminder",
  "action_followup",
  "action_outcome",
  "run_learning_decision",
]);

function classifyPlantEvent(
  eventType: string | null,
  photoPresent: boolean,
): TimelineFilterCategory {
  const type = eventType ?? "";
  if (photoPresent || type === "photo") return "photos";
  if (type === "watering") return "watering";
  if (type === "feeding") return "feeding";
  if (SYMPTOM_EVENT_TYPES.has(type)) return "symptoms";
  if (TRAINING_EVENT_TYPES.has(type)) return "training";
  if (MEASUREMENT_EVENT_TYPES.has(type)) return "measurement";
  if (TRANSPLANT_EVENT_TYPES.has(type)) return "transplant";
  if (HARVEST_EVENT_TYPES.has(type)) return "harvest";
  if (REMINDER_EVENT_TYPES.has(type)) return "reminder";
  return "notes";
}

type LocalSnapshotResolution =
  | {
      readonly freshness: "fresh";
      readonly effectiveSource: "live" | "manual" | "csv";
      readonly capturedAt: string;
      readonly reason: "fresh";
    }
  | {
      readonly freshness: "demo";
      readonly effectiveSource: "demo";
      readonly capturedAt: string | null;
      readonly reason: "demo_source";
    }
  | {
      readonly freshness: "stale";
      readonly effectiveSource: "stale";
      readonly capturedAt: string | null;
      readonly reason: "stale_reading";
    }
  | {
      readonly freshness: "invalid";
      readonly effectiveSource: "invalid";
      readonly capturedAt: string | null;
      readonly reason:
        | "invalid_flag"
        | "unknown_source"
        | "missing_captured_at"
        | "invalid_captured_at"
        | "future_captured_at";
    };

const CANONICAL_SNAPSHOT_SOURCES = new Set(["live", "manual", "csv", "demo", "stale", "invalid"]);
const ENVIRONMENT_STALE_WINDOW_MS = 15 * 60 * 1_000;
const SOIL_STALE_WINDOW_MS = 60 * 60 * 1_000;

function resolveLocalSnapshot(
  snapshot: PlantEventReviewSensorSnapshotInput,
  executionMs: number,
): LocalSnapshotResolution {
  const source = snapshot.source;
  const capturedAt = snapshot.capturedAt;
  const capturedMs =
    typeof capturedAt === "string" && Number.isFinite(Date.parse(capturedAt))
      ? Date.parse(capturedAt)
      : null;

  if (snapshot.invalid) {
    return {
      freshness: "invalid",
      effectiveSource: "invalid",
      capturedAt: capturedMs === null ? null : (capturedAt as string),
      reason: "invalid_flag",
    };
  }
  if (!source || !CANONICAL_SNAPSHOT_SOURCES.has(source)) {
    return {
      freshness: "invalid",
      effectiveSource: "invalid",
      capturedAt: capturedMs === null ? null : (capturedAt as string),
      reason: "unknown_source",
    };
  }
  if (source === "demo") {
    return {
      freshness: "demo",
      effectiveSource: "demo",
      capturedAt: capturedMs === null ? null : (capturedAt as string),
      reason: "demo_source",
    };
  }
  if (source === "invalid") {
    return {
      freshness: "invalid",
      effectiveSource: "invalid",
      capturedAt: capturedMs === null ? null : (capturedAt as string),
      reason: "invalid_flag",
    };
  }
  if (source === "stale") {
    return {
      freshness: "stale",
      effectiveSource: "stale",
      capturedAt: capturedMs === null ? null : (capturedAt as string),
      reason: "stale_reading",
    };
  }
  if (!capturedAt) {
    return {
      freshness: "invalid",
      effectiveSource: "invalid",
      capturedAt: null,
      reason: "missing_captured_at",
    };
  }
  if (capturedMs === null) {
    return {
      freshness: "invalid",
      effectiveSource: "invalid",
      capturedAt: null,
      reason: "invalid_captured_at",
    };
  }
  const ageMs = executionMs - capturedMs;
  if (ageMs < 0) {
    return {
      freshness: "invalid",
      effectiveSource: "invalid",
      capturedAt,
      reason: "future_captured_at",
    };
  }
  const hasEnvironmentMetric =
    snapshot.metrics.length === 0 ||
    snapshot.metrics.some(
      (metric) =>
        metric.kind === "environment" ||
        metric.kind === "other" ||
        metric.key === "temp" ||
        metric.key === "rh" ||
        metric.key === "vpd",
    );
  const staleWindowMs = hasEnvironmentMetric ? ENVIRONMENT_STALE_WINDOW_MS : SOIL_STALE_WINDOW_MS;
  if (ageMs > staleWindowMs) {
    return {
      freshness: "stale",
      effectiveSource: "stale",
      capturedAt,
      reason: "stale_reading",
    };
  }
  return {
    freshness: "fresh",
    effectiveSource: source as "live" | "manual" | "csv",
    capturedAt,
    reason: "fresh",
  };
}

function buildCurrentEvidenceRef(
  ref: PlantEventReviewSensorRefInput,
): PlantEventReviewEvidenceRef | null {
  if (ref.source !== "manual" && ref.source !== "live") return null;
  return Object.freeze({
    id: ref.id,
    type: "sensor_snapshot",
    occurred_at: ref.captured_at,
    source: ref.source,
  });
}

function normalizeCurrentEvidenceRefs(
  input: readonly PlantEventReviewEvidenceRef[],
): PlantEventReviewEvidenceRef[] {
  const byId = new Map<string, PlantEventReviewEvidenceRef>();
  for (const ref of input) {
    if (!byId.has(ref.id)) byId.set(ref.id, ref);
  }
  return [...byId.values()].sort((left, right) => {
    if (left.occurred_at !== right.occurred_at) {
      return compareCodePoints(left.occurred_at, right.occurred_at);
    }
    return compareCodePoints(left.id, right.id);
  });
}

function addCategoryNextData(
  category: TimelineFilterCategory,
  photoPresent: boolean,
  next: Set<PlantEventReviewNextDataCode>,
): void {
  switch (category) {
    case "watering":
    case "feeding":
    case "training":
    case "transplant":
      next.add("log_plant_response_in_24h");
      break;
    case "symptoms":
      if (!photoPresent) next.add("add_photo");
      next.add("add_recent_feeding_context");
      next.add("add_recent_watering_context");
      break;
    case "harvest":
      next.add("log_dry_or_cure_outcome");
      break;
    case "photos":
      break;
    default:
      next.add("log_follow_up_observation");
      break;
  }
}

function reviewPlantEvent(
  input: PlantEventReviewInput,
  executionAt: string,
): PlantEventReviewOutcome {
  const category = classifyPlantEvent(input.event.eventType, input.event.photoPresent);
  const eventCategory = classifyPlantEvent(input.event.eventType, false);
  const knownEventType = isKnownEventType(input.event.eventType);
  const findingCodes = new Set<PlantEventReviewFindingCode>();
  const missing = new Set<PlantEventReviewMissingInformationCode>();
  const next = new Set<PlantEventReviewNextDataCode>();
  const currentRefs: PlantEventReviewEvidenceRef[] = [];
  let matchingEvidenceCount = 0;
  let currentEvidenceCount = 0;

  if (!input.event.notePresent) {
    findingCodes.add("event_description_missing");
    missing.add("event_description");
    next.add("add_observation_note");
  }
  if (input.event.photoPresent && !input.event.notePresent) {
    findingCodes.add("single_photo_non_diagnostic");
  }
  if (input.event.normalizationWarnings.length > 0) {
    findingCodes.add("event_normalization_warning");
    missing.add("valid_event_details");
    next.add("clarify_event_details");
  }
  if (!knownEventType) {
    findingCodes.add("event_type_unknown");
    missing.add("specific_event_type");
    next.add("clarify_event_type");
  }

  if (input.sensorEvidence.length === 0) {
    findingCodes.add("sensor_context_missing");
    missing.add("current_sensor_context");
    next.add("add_current_sensor_snapshot");
  }

  const executionMs = Date.parse(executionAt);
  for (const evidence of input.sensorEvidence) {
    if (!scopesMatch(input.event, evidence)) {
      findingCodes.add("sensor_scope_mismatch");
      continue;
    }
    matchingEvidenceCount += 1;
    const display = resolveLocalSnapshot(evidence.snapshot, executionMs);
    if (display.freshness === "demo") {
      findingCodes.add("sensor_evidence_demo");
      continue;
    }
    if (display.freshness === "stale") {
      findingCodes.add("sensor_evidence_stale");
      continue;
    }
    if (display.freshness === "invalid") {
      findingCodes.add(
        display.reason === "unknown_source"
          ? "sensor_evidence_unknown_source"
          : "sensor_evidence_invalid",
      );
      continue;
    }
    if (display.effectiveSource === "csv") {
      findingCodes.add("sensor_evidence_csv");
      continue;
    }
    if (display.effectiveSource !== "manual" && display.effectiveSource !== "live") {
      findingCodes.add("sensor_evidence_invalid");
      continue;
    }

    const populatedMetrics = evidence.snapshot.metrics.filter((metric) => metric.value !== null);
    if (populatedMetrics.length === 0) {
      findingCodes.add("sensor_evidence_no_metrics");
      missing.add("sensor_metrics");
      continue;
    }
    const usableMetrics = populatedMetrics.filter(isSemanticallyUsableSensorMetric);
    if (usableMetrics.length === 0) {
      findingCodes.add("sensor_evidence_metrics_unusable");
      missing.add("sensor_metrics");
      continue;
    }
    if (usableMetrics.length !== populatedMetrics.length) {
      findingCodes.add("sensor_evidence_metrics_unusable");
      missing.add("sensor_metrics");
      continue;
    }
    if (
      typeof evidence.snapshot.confidence !== "number" ||
      evidence.snapshot.confidence <= 0 ||
      evidence.snapshot.confidence > 1
    ) {
      findingCodes.add("sensor_evidence_confidence_unusable");
      continue;
    }

    if (!evidence.explicitRef) {
      findingCodes.add("sensor_evidence_ref_missing");
      missing.add("explicit_sensor_reference");
      continue;
    }
    if (
      evidence.explicitRef.source !== display.effectiveSource ||
      evidence.explicitRef.captured_at !== display.capturedAt
    ) {
      findingCodes.add("sensor_evidence_ref_mismatch");
      missing.add("explicit_sensor_reference");
      continue;
    }

    const built = buildCurrentEvidenceRef(evidence.explicitRef);
    if (!built) {
      findingCodes.add("sensor_evidence_ref_missing");
      missing.add("explicit_sensor_reference");
      continue;
    }
    currentRefs.push(built);
    currentEvidenceCount += 1;
    findingCodes.add(
      display.effectiveSource === "manual"
        ? "sensor_evidence_fresh_manual"
        : "sensor_evidence_fresh_live",
    );
  }

  if (input.sensorEvidence.length > 0 && matchingEvidenceCount === 0) {
    missing.add("matching_sensor_context");
    next.add("add_current_sensor_snapshot");
  } else if (matchingEvidenceCount > 0 && currentEvidenceCount === 0) {
    missing.add("fresh_sensor_context");
    next.add("add_current_sensor_snapshot");
  }

  addCategoryNextData(eventCategory, input.event.photoPresent, next);

  const reviewed =
    input.event.notePresent &&
    knownEventType &&
    input.event.normalizationWarnings.length === 0 &&
    currentEvidenceCount > 0;
  const status: PlantEventReviewStatus = reviewed ? "reviewed" : "needs_context";
  const findings: PlantEventReviewFinding[] = [...findingCodes].sort().map((code) =>
    Object.freeze({
      findingId: code,
      severity: PLANT_EVENT_REVIEW_FINDING_SEVERITY[code],
    }),
  );

  return Object.freeze({
    status,
    category,
    confidence: reviewed ? "medium" : "low",
    summary: reviewed ? REVIEWED_SUMMARY : NEEDS_CONTEXT_SUMMARY,
    findings: Object.freeze(findings),
    evidenceRefs: Object.freeze(normalizeCurrentEvidenceRefs(currentRefs)),
    missingInformation: stableUnique([...missing]),
    nextDataToLog: stableUnique([...next]),
    actionQueueSuggestion: null,
  });
}

function isSortedUniqueStrings(values: readonly string[]): boolean {
  return values.every(
    (value, index) => index === 0 || compareCodePoints(values[index - 1], value) < 0,
  );
}

function validateStringCodeArray<Value extends string>(
  value: unknown,
  allowed: ReadonlySet<Value>,
  maximumLength: number,
): readonly Value[] | null {
  if (
    !Array.isArray(value) ||
    value.length > maximumLength ||
    value.some((item) => typeof item !== "string" || !allowed.has(item as Value)) ||
    !isSortedUniqueStrings(value as string[])
  ) {
    return null;
  }
  return Object.freeze([...(value as Value[])]);
}

export function validatePlantEventReviewOutcome(
  value: unknown,
): VerdantSkillOutcomeValidation<PlantEventReviewOutcome> {
  if (!isExactPlainRecord(value, OUTPUT_KEYS)) {
    return { ok: false, reasonCodes: Object.freeze(["outcome_shape_invalid"]) };
  }

  const reasons: string[] = [];
  const status =
    value.status === "reviewed" || value.status === "needs_context" ? value.status : null;
  const category =
    typeof value.category === "string" &&
    TIMELINE_CATEGORY_VALUES.includes(value.category as TimelineFilterCategory)
      ? (value.category as TimelineFilterCategory)
      : null;
  const confidence =
    value.confidence === "low" || value.confidence === "medium" ? value.confidence : null;

  if (!status) reasons.push("outcome_status_invalid");
  if (!category) reasons.push("outcome_category_invalid");
  if (!confidence) reasons.push("outcome_confidence_invalid");
  if (
    typeof value.summary !== "string" ||
    !REVIEW_SUMMARIES.has(value.summary) ||
    (status === "reviewed" && value.summary !== REVIEWED_SUMMARY) ||
    (status === "needs_context" && value.summary !== NEEDS_CONTEXT_SUMMARY)
  ) {
    reasons.push("outcome_summary_invalid");
  }
  if (
    (status === "reviewed" && confidence !== "medium") ||
    (status === "needs_context" && confidence !== "low")
  ) {
    reasons.push("outcome_confidence_status_mismatch");
  }

  const findings: PlantEventReviewFinding[] = [];
  if (!Array.isArray(value.findings) || value.findings.length > MAX_FINDINGS) {
    reasons.push("outcome_findings_invalid");
  } else {
    for (const raw of value.findings) {
      if (!isExactPlainRecord(raw, FINDING_KEYS)) {
        reasons.push("outcome_finding_shape_invalid");
        continue;
      }
      if (
        typeof raw.findingId !== "string" ||
        !FINDING_CODES.has(raw.findingId as PlantEventReviewFindingCode) ||
        raw.severity !==
          PLANT_EVENT_REVIEW_FINDING_SEVERITY[raw.findingId as PlantEventReviewFindingCode]
      ) {
        reasons.push("outcome_finding_invalid");
        continue;
      }
      findings.push(
        Object.freeze({
          findingId: raw.findingId as PlantEventReviewFindingCode,
          severity: raw.severity as PlantEventReviewFindingSeverity,
        }),
      );
    }
    if (
      findings.length !== value.findings.length ||
      !isSortedUniqueStrings(findings.map((finding) => finding.findingId))
    ) {
      reasons.push("outcome_findings_order_invalid");
    }
  }

  const evidenceRefs: PlantEventReviewEvidenceRef[] = [];
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > MAX_EVIDENCE_REFS) {
    reasons.push("outcome_evidence_refs_invalid");
  } else {
    for (const raw of value.evidenceRefs) {
      if (!isExactPlainRecord(raw, EVIDENCE_REF_KEYS)) {
        reasons.push("outcome_evidence_ref_shape_invalid");
        continue;
      }
      if (
        typeof raw.id !== "string" ||
        !ID_PATTERN.test(raw.id) ||
        raw.type !== "sensor_snapshot" ||
        typeof raw.occurred_at !== "string" ||
        !isIsoTimestamp(raw.occurred_at) ||
        (raw.source !== "manual" && raw.source !== "live")
      ) {
        reasons.push("outcome_evidence_ref_invalid");
        continue;
      }
      evidenceRefs.push(
        Object.freeze({
          id: raw.id,
          type: "sensor_snapshot",
          occurred_at: raw.occurred_at,
          source: raw.source,
        }),
      );
    }
    const normalized = normalizeCurrentEvidenceRefs(evidenceRefs);
    if (
      normalized.length !== evidenceRefs.length ||
      JSON.stringify(normalized) !== JSON.stringify(evidenceRefs)
    ) {
      reasons.push("outcome_evidence_ref_order_invalid");
    }
  }

  const missingInformation = validateStringCodeArray(
    value.missingInformation,
    MISSING_INFORMATION_CODES,
    MAX_MISSING_INFORMATION,
  );
  const nextDataToLog = validateStringCodeArray(
    value.nextDataToLog,
    NEXT_DATA_CODES,
    MAX_NEXT_DATA_TO_LOG,
  );
  if (!missingInformation) reasons.push("outcome_missing_information_invalid");
  if (!nextDataToLog) reasons.push("outcome_next_data_invalid");
  if (value.actionQueueSuggestion !== null) {
    reasons.push("outcome_action_queue_suggestion_invalid");
  }

  const findingIds = new Set(findings.map((finding) => finding.findingId));
  if (status === "reviewed") {
    if (evidenceRefs.length === 0) {
      reasons.push("outcome_reviewed_evidence_missing");
    }
    if (
      evidenceRefs.some(
        (ref) =>
          !findingIds.has(
            ref.source === "manual" ? "sensor_evidence_fresh_manual" : "sensor_evidence_fresh_live",
          ),
      )
    ) {
      reasons.push("outcome_reviewed_source_finding_missing");
    }
    if (missingInformation && missingInformation.length > 0) {
      reasons.push("outcome_reviewed_missing_information_conflict");
    }
  }
  if (
    status === "needs_context" &&
    findings.length === 0 &&
    missingInformation?.length === 0 &&
    nextDataToLog?.length === 0
  ) {
    reasons.push("outcome_needs_context_signal_missing");
  }

  if (reasons.length > 0 || !status || !category || !confidence) {
    return {
      ok: false,
      reasonCodes: stableUnique(reasons),
    };
  }

  return {
    ok: true,
    outcome: Object.freeze({
      status,
      category,
      confidence,
      summary: value.summary as string,
      findings: Object.freeze(findings),
      evidenceRefs: Object.freeze(evidenceRefs),
      missingInformation: missingInformation as readonly PlantEventReviewMissingInformationCode[],
      nextDataToLog: nextDataToLog as readonly PlantEventReviewNextDataCode[],
      actionQueueSuggestion: null,
    }),
  };
}

export const PLANT_EVENT_REVIEW_SKILL_MANIFEST = createVerdantSkillManifest({
  schemaVersion: VERDANT_SKILL_MANIFEST_SCHEMA_VERSION,
  id: PLANT_EVENT_REVIEW_SKILL_ID,
  version: PLANT_EVENT_REVIEW_SKILL_VERSION,
  title: "Plant Event Review",
  description:
    "Reviews one supplied normalized plant event for evidence completeness and names useful data to log next without diagnosis or side effects.",
  inputKind: "plant-event-review-input.v1",
  outputKind: "plant-event-review-output.v1",
  activation: "explicit",
  sideEffects: "none",
  capabilities: VERDANT_SKILL_V1_CAPABILITIES,
  policyTags: VERDANT_SKILL_V1_POLICY_TAGS,
  fixtureSet: PLANT_EVENT_REVIEW_FIXTURE_SET,
});

export const PLANT_EVENT_REVIEW_SKILL_DEFINITION: VerdantSkillDefinition<
  PlantEventReviewInput,
  PlantEventReviewOutcome
> = Object.freeze({
  manifest: PLANT_EVENT_REVIEW_SKILL_MANIFEST,
  assess: (input, executionAt) => {
    const parsedExecutionAt = parseVerdantSkillExecutionAt(executionAt);
    if (!parsedExecutionAt) {
      return invalidVerdantSkillApplicability(["execution_time_invalid"]);
    }

    const parsed = parsePlantEventReviewInput(input);
    if (!parsed.input) {
      return invalidVerdantSkillApplicability(parsed.issues);
    }

    const reasons: string[] = [];
    if (!parsed.input.event.growId) reasons.push("grow_context_missing");
    if (!parsed.input.event.plantId) reasons.push("plant_context_missing");
    if (!parsed.input.event.occurredAt) {
      reasons.push("event_time_missing");
    } else if (!isIsoTimestamp(parsed.input.event.occurredAt)) {
      reasons.push("event_time_invalid");
    } else if (Date.parse(parsed.input.event.occurredAt) > Date.parse(parsedExecutionAt)) {
      reasons.push("event_time_future");
    }
    if (!parsed.input.event.validForAiContext) {
      reasons.push("event_invalid_for_review");
    }

    if (reasons.length > 0) {
      return notApplicableVerdantSkill(reasons);
    }
    return applicableVerdantSkill(parsed.input, ["plant_event_context_supplied"]);
  },
  run: ({ input, executionAt }) => {
    const outcome = reviewPlantEvent(input, executionAt);
    return Object.freeze({
      status: outcome.status === "reviewed" ? "completed" : "insufficient_evidence",
      outcome,
    });
  },
  validateOutcome: validatePlantEventReviewOutcome,
});
